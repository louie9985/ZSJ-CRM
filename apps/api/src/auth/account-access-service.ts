import type { FixedRoleGrantStore, FixedRoleKey } from "@ai-crm/crm-authorization";
import type { WorkforcePersonContext } from "@ai-crm/crm-organization";
import { verifyPasswordOrDummy, type PasswordCredentialPort } from "@ai-crm/crm-workforce-access";

import { BrowserSessionFailure } from "./errors.js";
import { createOpaqueSessionCredential, type AccessSessionStore, type AuthenticationSurface, type StoredAccessSession } from "./local-session-store.js";

const IDLE_TTL_MS = 30 * 60 * 1_000;
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1_000;
const REAUTHENTICATION_TTL_MS = 5 * 60 * 1_000;

export interface AccountSessionView {
  readonly absoluteExpiresAt: string;
  readonly accountId: string;
  readonly assignments: readonly string[];
  readonly authenticatedAt: string;
  readonly csrfToken: string;
  readonly currentAssignmentId?: string;
  readonly idleExpiresAt: string;
  readonly reauthenticatedUntil?: string;
  readonly roles: readonly FixedRoleKey[];
  readonly surface: AuthenticationSurface;
}

export interface AccountSessionResult {
  readonly credential: string;
  readonly view: Readonly<AccountSessionView>;
}

export interface AccountAccessPrincipal {
  readonly accountId: string;
  readonly currentAssignmentId?: string;
  readonly expiresAt: string;
  readonly issuedAt: string;
  readonly reauthenticated: boolean;
  readonly sessionId: string;
  readonly workforcePersonId: string;
}

export interface AccountAccessAuditPort {
  record(event: Readonly<{ accountId?: string; action: "assignment_selected" | "login_failed" | "login_succeeded" | "logout" | "logout_requested" | "reauthenticated" | "reauthentication_failed"; occurredAt: string; surface: AuthenticationSurface; traceId?: string; workforcePersonId?: string }>): Promise<void>;
}

export interface AccountAccessServiceOptions {
  readonly audit: AccountAccessAuditPort;
  readonly clock?: () => Date;
  readonly credentials: PasswordCredentialPort;
  readonly organization: Pick<import("@ai-crm/crm-organization").OrganizationServiceApi, "resolveWorkforcePersonContext">;
  readonly roles: FixedRoleGrantStore;
  readonly sessions: AccessSessionStore;
}

function iso(milliseconds: number): string { return new Date(milliseconds).toISOString(); }

function safeCode(error: unknown): string | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  const value = Reflect.get(error, "code") as unknown;
  return typeof value === "string" ? value : undefined;
}

function rateIdentifier(value: string): string {
  const compact = value.replace(/[ -]/gu, "");
  return /^\+?[0-9]{6,20}$/u.test(compact) ? compact : value.toLowerCase();
}

export class AccountAccessApplicationService {
  readonly #clock: () => Date;
  constructor(private readonly options: AccountAccessServiceOptions) { this.#clock = options.clock ?? (() => new Date()); }

  async login(input: Readonly<{ identifier: string; password: string; sourceAddress: string; surface: AuthenticationSurface; traceId?: string }>): Promise<Readonly<AccountSessionResult>> {
    const now = this.#clock();
    if (typeof input.identifier !== "string" || input.identifier.length < 1 || input.identifier.length > 64 || typeof input.sourceAddress !== "string" || input.sourceAddress.length < 1 || input.sourceAddress.length > 128) {
      throw new BrowserSessionFailure("authentication_invalid_credentials");
    }
    const rateKey = rateIdentifier(input.identifier);
    if (!await this.options.sessions.admitLoginAttempt(rateKey, input.sourceAddress, now.getTime())) {
      await this.#audit({ action: "login_failed", occurredAt: now.toISOString(), surface: input.surface, ...(input.traceId === undefined ? {} : { traceId: input.traceId }) });
      throw new BrowserSessionFailure("authentication_rate_limited");
    }
    let account: Awaited<ReturnType<PasswordCredentialPort["findByIdentifier"]>>;
    try { account = await this.options.credentials.findByIdentifier(input.identifier); }
    catch (error) {
      if (safeCode(error) === "input_invalid") account = undefined;
      else throw new BrowserSessionFailure("authentication_dependency_unavailable");
    }
    const validPassword = await verifyPasswordOrDummy(account, input.password);
    if (!validPassword || account?.status !== "active") {
      await this.#recordLoginFailure(input, now, account);
      throw new BrowserSessionFailure("authentication_invalid_credentials");
    }
    let workforce: Readonly<WorkforcePersonContext>;
    try { workforce = await this.options.organization.resolveWorkforcePersonContext(account.workforcePersonId, now.toISOString()); }
    catch (error) {
      if (["assignment_not_active", "employment_not_active", "entity_not_found"].includes(safeCode(error) ?? "")) {
        await this.#recordLoginFailure(input, now, account);
        throw new BrowserSessionFailure("authentication_invalid_credentials");
      }
      throw new BrowserSessionFailure("authentication_dependency_unavailable");
    }
    if (workforce.employmentIds.length === 0 || workforce.assignments.length === 0) {
      await this.#recordLoginFailure(input, now, account);
      throw new BrowserSessionFailure("authentication_invalid_credentials");
    }
    const currentAssignmentId = workforce.assignments.length === 1 ? workforce.assignments[0]?.assignmentId : undefined;
    const session: StoredAccessSession = Object.freeze({
      absoluteExpiresAtMs: now.getTime() + ABSOLUTE_TTL_MS,
      accountId: account.accountId,
      authenticatedAtMs: now.getTime(),
      createdAtMs: now.getTime(),
      csrfToken: createOpaqueSessionCredential(),
      ...(currentAssignmentId === undefined ? {} : { currentAssignmentId }),
      securityRevision: account.securityRevision,
      sessionId: createOpaqueSessionCredential(),
      surface: input.surface,
      workforcePersonId: account.workforcePersonId,
    });
    const credential = createOpaqueSessionCredential();
    const view = await this.#view(session, workforce, now.getTime() + IDLE_TTL_MS);
    await this.options.sessions.create(input.surface, credential, session, IDLE_TTL_MS);
    await this.#auditAfterSessionChange(input.surface, credential, { accountId: account.accountId, action: "login_succeeded", occurredAt: now.toISOString(), surface: input.surface, ...(input.traceId === undefined ? {} : { traceId: input.traceId }), workforcePersonId: account.workforcePersonId });
    await this.options.sessions.recordLoginSuccess(rateKey, input.sourceAddress);
    return Object.freeze({ credential, view });
  }

  async current(surface: AuthenticationSurface, credential: string): Promise<Readonly<AccountSessionView>> {
    const resolved = await this.#resolve(surface, credential, false);
    return this.#view(resolved.session, resolved.workforce, resolved.idleExpiresAtMs);
  }

  async principal(surface: AuthenticationSurface, credential: string): Promise<Readonly<AccountAccessPrincipal>> {
    const { session } = await this.#resolve(surface, credential);
    const nowMs = this.#clock().getTime();
    return Object.freeze({ accountId: session.accountId, ...(session.currentAssignmentId === undefined ? {} : { currentAssignmentId: session.currentAssignmentId }), expiresAt: iso(session.absoluteExpiresAtMs), issuedAt: iso(session.authenticatedAtMs), reauthenticated: (session.reauthenticatedUntilMs ?? 0) > nowMs, sessionId: session.sessionId, workforcePersonId: session.workforcePersonId });
  }

  async reauthenticate(input: Readonly<{ credential: string; password: string; sourceAddress: string; surface: AuthenticationSurface; traceId?: string }>): Promise<Readonly<AccountSessionResult>> {
    if (typeof input.sourceAddress !== "string" || input.sourceAddress.length < 1 || input.sourceAddress.length > 128) throw new BrowserSessionFailure("authentication_invalid_credentials");
    const { account, session, workforce } = await this.#resolve(input.surface, input.credential);
    const now = this.#clock();
    const rateKey = `reauthentication:${account.accountId}`;
    if (!await this.options.sessions.admitLoginAttempt(rateKey, input.sourceAddress, now.getTime())) {
      await this.#audit({ accountId: account.accountId, action: "reauthentication_failed", occurredAt: now.toISOString(), surface: input.surface, ...(input.traceId === undefined ? {} : { traceId: input.traceId }), workforcePersonId: account.workforcePersonId });
      throw new BrowserSessionFailure("authentication_rate_limited");
    }
    if (!await verifyPasswordOrDummy(account, input.password)) {
      await this.#audit({ accountId: account.accountId, action: "reauthentication_failed", occurredAt: now.toISOString(), surface: input.surface, ...(input.traceId === undefined ? {} : { traceId: input.traceId }), workforcePersonId: account.workforcePersonId });
      throw new BrowserSessionFailure("authentication_invalid_credentials");
    }
    const next = Object.freeze({ ...session, csrfToken: createOpaqueSessionCredential(), reauthenticatedUntilMs: now.getTime() + REAUTHENTICATION_TTL_MS, sessionId: createOpaqueSessionCredential() });
    const credential = createOpaqueSessionCredential();
    const remainingTtlMs = Math.min(IDLE_TTL_MS, next.absoluteExpiresAtMs - now.getTime());
    if (remainingTtlMs <= 0) throw new BrowserSessionFailure("authentication_required");
    const view = await this.#view(next, workforce, now.getTime() + remainingTtlMs);
    await this.options.sessions.rotate(input.surface, input.credential, credential, next, remainingTtlMs, now.getTime());
    await this.#auditAfterSessionChange(input.surface, credential, { accountId: account.accountId, action: "reauthenticated", occurredAt: now.toISOString(), surface: input.surface, ...(input.traceId === undefined ? {} : { traceId: input.traceId }), workforcePersonId: account.workforcePersonId });
    await this.options.sessions.recordLoginSuccess(rateKey, input.sourceAddress);
    return Object.freeze({ credential, view });
  }

  async selectAssignment(input: Readonly<{ assignmentId: string; credential: string; surface: AuthenticationSurface; traceId?: string }>): Promise<Readonly<AccountSessionResult>> {
    const { account, session, workforce } = await this.#resolve(input.surface, input.credential);
    if (!workforce.assignments.some(({ assignmentId }) => assignmentId === input.assignmentId)) throw new BrowserSessionFailure("authentication_required");
    const next = Object.freeze({ ...session, csrfToken: createOpaqueSessionCredential(), currentAssignmentId: input.assignmentId, sessionId: createOpaqueSessionCredential() });
    const credential = createOpaqueSessionCredential();
    const now = this.#clock();
    const remainingTtlMs = Math.min(IDLE_TTL_MS, next.absoluteExpiresAtMs - now.getTime());
    if (remainingTtlMs <= 0) throw new BrowserSessionFailure("authentication_required");
    const view = await this.#view(next, workforce, now.getTime() + remainingTtlMs);
    await this.options.sessions.rotate(input.surface, input.credential, credential, next, remainingTtlMs, now.getTime());
    await this.#auditAfterSessionChange(input.surface, credential, { accountId: account.accountId, action: "assignment_selected", occurredAt: now.toISOString(), surface: input.surface, ...(input.traceId === undefined ? {} : { traceId: input.traceId }), workforcePersonId: account.workforcePersonId });
    return Object.freeze({ credential, view });
  }

  async logout(surface: AuthenticationSurface, credential: string | undefined, traceId?: string): Promise<void> {
    if (credential === undefined) return;
    const observed = await this.options.sessions.peek(surface, credential, this.#clock().getTime()).catch(() => undefined);
    const accountId = observed?.session.accountId;
    const workforcePersonId = observed?.session.workforcePersonId;
    await this.#audit({ ...(accountId === undefined ? {} : { accountId }), action: "logout_requested", occurredAt: this.#clock().toISOString(), surface, ...(traceId === undefined ? {} : { traceId }), ...(workforcePersonId === undefined ? {} : { workforcePersonId }) }).catch(() => undefined);
    await this.options.sessions.delete(surface, credential);
    await this.#audit({ ...(accountId === undefined ? {} : { accountId }), action: "logout", occurredAt: this.#clock().toISOString(), surface, ...(traceId === undefined ? {} : { traceId }), ...(workforcePersonId === undefined ? {} : { workforcePersonId }) }).catch(() => undefined);
  }

  async #resolve(surface: AuthenticationSurface, credential: string, touch = true) {
    const now = this.#clock();
    const observed = touch ? undefined : await this.options.sessions.peek(surface, credential, now.getTime());
    const session = touch
      ? await this.options.sessions.get(surface, credential, IDLE_TTL_MS, now.getTime())
      : observed?.session;
    if (session === undefined || session.absoluteExpiresAtMs <= now.getTime()) throw new BrowserSessionFailure("authentication_required");
    let account: Awaited<ReturnType<PasswordCredentialPort["findByAccountId"]>>;
    try { account = await this.options.credentials.findByAccountId(session.accountId); }
    catch { throw new BrowserSessionFailure("authentication_dependency_unavailable"); }
    if (account === undefined || account.status !== "active" || account.securityRevision !== session.securityRevision || account.workforcePersonId !== session.workforcePersonId) throw new BrowserSessionFailure("authentication_required");
    let workforce: Readonly<WorkforcePersonContext>;
    try { workforce = await this.options.organization.resolveWorkforcePersonContext(session.workforcePersonId, now.toISOString(), session.currentAssignmentId); }
    catch (error) {
      if (["assignment_not_active", "employment_not_active", "entity_not_found"].includes(safeCode(error) ?? "")) throw new BrowserSessionFailure("authentication_required");
      throw new BrowserSessionFailure("authentication_dependency_unavailable");
    }
    if (workforce.employmentIds.length === 0 || workforce.assignments.length === 0) throw new BrowserSessionFailure("authentication_required");
    const idleExpiresAtMs = touch
      ? Math.min(session.absoluteExpiresAtMs, now.getTime() + IDLE_TTL_MS)
      : observed?.idleExpiresAtMs;
    if (idleExpiresAtMs === undefined) throw new BrowserSessionFailure("authentication_required");
    return Object.freeze({ account, idleExpiresAtMs, session, workforce });
  }

  async #view(session: StoredAccessSession, workforce: Readonly<WorkforcePersonContext>, idleExpiresAtMs: number): Promise<Readonly<AccountSessionView>> {
    const now = this.#clock();
    let grants: Awaited<ReturnType<FixedRoleGrantStore["listActive"]>>;
    try { grants = await this.options.roles.listActive(session.workforcePersonId, now.toISOString()); }
    catch { throw new BrowserSessionFailure("authentication_dependency_unavailable"); }
    const roles = grants.filter((grant) => grant.roleKey === "system_administrator" || grant.assignmentId === session.currentAssignmentId).map(({ roleKey }) => roleKey);
    return Object.freeze({
      absoluteExpiresAt: iso(session.absoluteExpiresAtMs), accountId: session.accountId,
      assignments: Object.freeze(workforce.assignments.map(({ assignmentId }) => assignmentId)), authenticatedAt: iso(session.authenticatedAtMs), csrfToken: session.csrfToken,
      ...(session.currentAssignmentId === undefined ? {} : { currentAssignmentId: session.currentAssignmentId }),
      idleExpiresAt: iso(Math.min(session.absoluteExpiresAtMs, idleExpiresAtMs)),
      ...(session.reauthenticatedUntilMs === undefined ? {} : { reauthenticatedUntil: iso(session.reauthenticatedUntilMs) }),
      roles: Object.freeze([...new Set(roles)]), surface: session.surface,
    });
  }

  async #audit(event: Parameters<AccountAccessAuditPort["record"]>[0]): Promise<void> {
    try { await this.options.audit.record(event); }
    catch { throw new BrowserSessionFailure("authentication_dependency_unavailable"); }
  }

  async #auditAfterSessionChange(surface: AuthenticationSurface, credential: string, event: Parameters<AccountAccessAuditPort["record"]>[0]): Promise<void> {
    try { await this.#audit(event); }
    catch (error) {
      await this.options.sessions.delete(surface, credential).catch(() => undefined);
      throw error;
    }
  }

  async #recordLoginFailure(
    input: Readonly<{ sourceAddress: string; surface: AuthenticationSurface; traceId?: string }>,
    now: Date,
    account: Awaited<ReturnType<PasswordCredentialPort["findByIdentifier"]>>,
  ): Promise<void> {
    await this.#audit({
      ...(account === undefined ? {} : { accountId: account.accountId, workforcePersonId: account.workforcePersonId }),
      action: "login_failed",
      occurredAt: now.toISOString(),
      surface: input.surface,
      ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
    });
  }
}
