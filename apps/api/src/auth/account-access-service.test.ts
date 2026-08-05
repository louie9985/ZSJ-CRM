import type { FixedRoleGrant, FixedRoleGrantStore } from "@ai-crm/crm-authorization";
import type { WorkforcePersonContext } from "@ai-crm/crm-organization";
import { hashPassword, type LocalLoginAccount, type PasswordCredentialPort } from "@ai-crm/crm-workforce-access";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AccountAccessApplicationService } from "./account-access-service.js";
import type { AccessSessionStore, AuthenticationSurface, StoredAccessSession } from "./local-session-store.js";

const ids = Object.freeze({ account: "10000000-0000-4000-8000-000000000001", person: "10000000-0000-4000-8000-000000000002", assignmentA: "10000000-0000-4000-8000-000000000003", assignmentB: "10000000-0000-4000-8000-000000000004" });
let passwordHash = "";
beforeAll(async () => { passwordHash = await hashPassword("Correct-password-1!"); });

class MemorySessions implements AccessSessionStore {
  readonly values = new Map<string, StoredAccessSession>();
  readonly failures: string[] = [];
  admitLoginAttempt(identifier: string, sourceAddress: string) {
    const identifierFailures = this.failures.filter((value) => value.startsWith(`${identifier}:`)).length;
    const sourceFailures = this.failures.filter((value) => value.endsWith(`:${sourceAddress}`)).length;
    if (identifierFailures >= 5 || sourceFailures >= 30) return Promise.resolve(false);
    this.failures.push(`${identifier}:${sourceAddress}`);
    return Promise.resolve(true);
  }
  recordLoginSuccess(identifier: string, sourceAddress: string) {
    for (let index = this.failures.length - 1; index >= 0; index -= 1) {
      const value = this.failures[index] ?? "";
      if (value.startsWith(`${identifier}:`) || value.endsWith(`:${sourceAddress}`)) this.failures.splice(index, 1);
    }
    return Promise.resolve();
  }
  key(surface: AuthenticationSurface, credential: string) { return `${surface}:${credential}`; }
  create(surface: AuthenticationSurface, credential: string, session: StoredAccessSession) { for (const [key, value] of this.values) if (value.surface === surface && value.accountId === session.accountId) this.values.delete(key); this.values.set(this.key(surface, credential), session); return Promise.resolve(); }
  delete(surface: AuthenticationSurface, credential: string) { this.values.delete(this.key(surface, credential)); return Promise.resolve(); }
  get(surface: AuthenticationSurface, credential: string) { return Promise.resolve(this.values.get(this.key(surface, credential))); }
  peek(surface: AuthenticationSurface, credential: string) {
    const value = this.values.get(this.key(surface, credential));
    return Promise.resolve(value === undefined ? undefined : { idleExpiresAtMs: value.absoluteExpiresAtMs, session: value });
  }
  rotate(surface: AuthenticationSurface, previousCredential: string, nextCredential: string, session: StoredAccessSession) { if (!this.values.delete(this.key(surface, previousCredential))) return Promise.reject(new Error("missing")); this.values.set(this.key(surface, nextCredential), session); return Promise.resolve(); }
}

function fixture() {
  const account: LocalLoginAccount = { accountId: ids.account, passwordHash, securityRevision: 4, status: "active", workforcePersonId: ids.person };
  const sessions = new MemorySessions();
  const findByAccountId = vi.fn(() => Promise.resolve(account));
  const findByIdentifier = vi.fn(() => Promise.resolve(account));
  const credentials: PasswordCredentialPort = {
    create: vi.fn(),
    findByAccountId,
    findByIdentifier,
    replace: vi.fn(),
  };
  const workforce: WorkforcePersonContext = { assignments: [
    { assignmentId: ids.assignmentA, employmentId: "10000000-0000-4000-8000-000000000005", organizationUnitId: "10000000-0000-4000-8000-000000000006", positionId: "10000000-0000-4000-8000-000000000007" },
    { assignmentId: ids.assignmentB, employmentId: "10000000-0000-4000-8000-000000000005", organizationUnitId: "10000000-0000-4000-8000-000000000008", positionId: "10000000-0000-4000-8000-000000000009" },
  ], employmentIds: ["10000000-0000-4000-8000-000000000005"], resolvedAt: "2026-08-04T00:00:00.000Z", workforcePersonId: ids.person };
  const grants: FixedRoleGrant[] = [
    { grantId: "20000000-0000-4000-8000-000000000001", grantedAt: workforce.resolvedAt, roleKey: "system_administrator", workforcePersonId: ids.person },
    { assignmentId: ids.assignmentA, grantId: "20000000-0000-4000-8000-000000000002", grantedAt: workforce.resolvedAt, roleKey: "application_user", workforcePersonId: ids.person },
    { assignmentId: ids.assignmentB, grantId: "20000000-0000-4000-8000-000000000003", grantedAt: workforce.resolvedAt, roleKey: "crm_administrator", workforcePersonId: ids.person },
  ];
  const listActive = vi.fn(() => Promise.resolve(grants));
  const roles: FixedRoleGrantStore = { grant: vi.fn(), listActive, revoke: vi.fn() };
  const auditRecord = vi.fn(() => Promise.resolve());
  const service = new AccountAccessApplicationService({ audit: { record: auditRecord }, clock: () => new Date("2026-08-04T00:00:00.000Z"), credentials, organization: { resolveWorkforcePersonContext: vi.fn(() => Promise.resolve(workforce)) }, roles, sessions });
  return { account, auditRecord, findByAccountId, findByIdentifier, listActive, service, sessions };
}

describe("AccountAccessApplicationService", () => {
  it("requires an explicit Assignment for multi-assignment accounts and rotates when one is selected", async () => {
    const { service, sessions } = fixture();
    const login = await service.login({ identifier: "User.One", password: "Correct-password-1!", sourceAddress: "127.0.0.1", surface: "pc" });
    expect(login.view.currentAssignmentId).toBeUndefined();
    expect(login.view.roles).toEqual(["system_administrator"]);
    const selected = await service.selectAssignment({ assignmentId: ids.assignmentA, credential: login.credential, surface: "pc" });
    expect(selected.credential).not.toBe(login.credential);
    expect(selected.view.roles).toEqual(["system_administrator", "application_user"]);
    expect(sessions.values.has(`pc:${login.credential}`)).toBe(false);
    await expect(service.current("pc", login.credential)).rejects.toMatchObject({ code: "authentication_required" });
  });

  it("invalidates existing sessions when securityRevision changes", async () => {
    const { account, findByAccountId, service } = fixture();
    const login = await service.login({ identifier: "13800000000", password: "Correct-password-1!", sourceAddress: "127.0.0.1", surface: "internal-h5" });
    findByAccountId.mockResolvedValue({ ...account, securityRevision: account.securityRevision + 1 });
    await expect(service.current("internal-h5", login.credential)).rejects.toMatchObject({ code: "authentication_required" });
  });

  it("uses the same invalid-credentials error and records failures", async () => {
    const { service, sessions } = fixture();
    await expect(service.login({ identifier: "missing", password: "Wrong-password-1!", sourceAddress: "192.0.2.1", surface: "pc" }))
      .rejects.toMatchObject({ code: "authentication_invalid_credentials" });
    expect(sessions.failures).toEqual(["missing:192.0.2.1"]);
  });

  it("does not expose the bearer credential as the principal session reference", async () => {
    const { service } = fixture();
    const login = await service.login({ identifier: "User.One", password: "Correct-password-1!", sourceAddress: "127.0.0.1", surface: "pc" });
    const principal = await service.principal("pc", login.credential);
    expect(principal.sessionId).not.toBe(login.credential);
    expect(principal.sessionId).toHaveLength(43);
  });

  it("rate-limits and audits failed reauthentication", async () => {
    const { auditRecord, service, sessions } = fixture();
    const login = await service.login({ identifier: "User.One", password: "Correct-password-1!", sourceAddress: "127.0.0.1", surface: "pc" });
    await expect(service.reauthenticate({ credential: login.credential, password: "Wrong-password-1!", sourceAddress: "192.0.2.7", surface: "pc" }))
      .rejects.toMatchObject({ code: "authentication_invalid_credentials" });
    expect(sessions.failures).toContain(`reauthentication:${ids.account}:192.0.2.7`);
    expect(auditRecord).toHaveBeenLastCalledWith(expect.objectContaining({ action: "reauthentication_failed", accountId: ids.account }));
  });

  it("removes a newly created Session when success auditing fails", async () => {
    const { auditRecord, service, sessions } = fixture();
    auditRecord.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(service.login({ identifier: "User.One", password: "Correct-password-1!", sourceAddress: "127.0.0.1", surface: "pc" }))
      .rejects.toMatchObject({ code: "authentication_dependency_unavailable" });
    expect(sessions.values.size).toBe(0);
  });

  it("revokes logout credentials even when audit dependencies fail", async () => {
    const { auditRecord, service, sessions } = fixture();
    const login = await service.login({ identifier: "User.One", password: "Correct-password-1!", sourceAddress: "127.0.0.1", surface: "pc" });
    auditRecord.mockRejectedValue(new Error("audit unavailable"));

    await expect(service.logout("pc", login.credential)).resolves.toBeUndefined();
    expect(sessions.values.has(`pc:${login.credential}`)).toBe(false);
  });

  it("does not create a Session when role projection is unavailable", async () => {
    const { listActive, service, sessions } = fixture();
    listActive.mockRejectedValueOnce(new Error("roles unavailable"));
    await expect(service.login({ identifier: "User.One", password: "Correct-password-1!", sourceAddress: "127.0.0.1", surface: "pc" }))
      .rejects.toMatchObject({ code: "authentication_dependency_unavailable" });
    expect(sessions.values.size).toBe(0);
  });

  it("maps malformed identifiers to the uniform invalid-credentials path", async () => {
    const { findByIdentifier, service, sessions } = fixture();
    findByIdentifier.mockRejectedValueOnce(Object.assign(new Error("invalid"), { code: "input_invalid" }));
    await expect(service.login({ identifier: "x", password: "Wrong-password-1!", sourceAddress: "192.0.2.9", surface: "pc" }))
      .rejects.toMatchObject({ code: "authentication_invalid_credentials" });
    expect(sessions.failures).toContain("x:192.0.2.9");
  });

  it("reports the idle expiry observed from Redis without refreshing it", async () => {
    const { service, sessions } = fixture();
    const login = await service.login({ identifier: "User.One", password: "Correct-password-1!", sourceAddress: "127.0.0.1", surface: "pc" });
    sessions.peek = (surface, credential) => {
      const value = sessions.values.get(sessions.key(surface, credential));
      return Promise.resolve(value === undefined ? undefined : { idleExpiresAtMs: Date.parse("2026-08-04T00:12:00.000Z"), session: value });
    };
    await expect(service.current("pc", login.credential)).resolves.toMatchObject({ idleExpiresAt: "2026-08-04T00:12:00.000Z" });
  });
});
