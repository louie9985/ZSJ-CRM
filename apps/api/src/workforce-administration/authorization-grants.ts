import { createHash } from "node:crypto";

import type {
  AuthorizationPolicyPublisher,
  AuthorizationPolicySnapshot,
  AuthorizationPolicyStore,
  EffectiveRoleGrant,
} from "@ai-crm/platform-authorization";

import type { AccountDirectoryPort, CrmAdministratorGrantPort } from "./types.js";

const CRM_ADMINISTRATOR_ROLE_KEY = "crm.system-administrator";
const CRM_APPLICATION_USER_ROLE_KEY = "crm.application-user";

export interface AuthorizationGrantPortDependencies {
  readonly clock: () => Date;
  readonly publisher: AuthorizationPolicyPublisher;
  readonly resolveActiveAssignmentIds: (workforcePersonId: string, at: string) => Promise<readonly string[]>;
  readonly store: AuthorizationPolicyStore;
}

export async function backfillActiveCrmApplicationGrants(input: Readonly<{
  accounts: Pick<AccountDirectoryPort, "listAccounts">;
  grants: Pick<CrmAdministratorGrantPort, "backfillApplicationGrants">;
  operationId: string;
}>): Promise<Readonly<{ grantedAccountIds: readonly string[] }>> {
  const accounts: { accountId: string; workforcePersonId: string }[] = [];
  const invalidAccountIds: string[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined;
  do {
    if (cursor !== undefined && visited.has(cursor)) throw new Error("crm_application_grant_backfill_cursor_conflict");
    if (cursor !== undefined) visited.add(cursor);
    const page = await input.accounts.listAccounts({ ...(cursor === undefined ? {} : { cursor }), limit: 100, status: "active" });
    for (const account of page.items) {
      if (account.workforcePersonId === undefined) invalidAccountIds.push(account.accountId);
      else accounts.push({ accountId: account.accountId, workforcePersonId: account.workforcePersonId });
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  if (invalidAccountIds.length > 0) throw Object.assign(new Error("crm_application_grant_preflight_failed"), { accountIds: Object.freeze(invalidAccountIds.sort()), code: "crm_application_grant_preflight_failed" });
  return input.grants.backfillApplicationGrants({ accounts: Object.freeze(accounts), operationId: input.operationId });
}

function uuid(source: string): string {
  const hex = createHash("sha256").update(source).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function currentTime(clock: () => Date): string {
  const value = clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error("authorization_grant_clock_invalid");
  return value.toISOString();
}

function snapshot(value: unknown, version: string): AuthorizationPolicySnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("authorization_policy_invalid");
  const candidate = value as Partial<AuthorizationPolicySnapshot>;
  if (candidate.version !== version || candidate.schemaVersion !== 2 || !Array.isArray(candidate.permissions) ||
    !Array.isArray(candidate.roles) || !Array.isArray(candidate.grants) || !Array.isArray(candidate.superAdministratorGrants)) {
    throw new Error("authorization_policy_invalid");
  }
  return candidate as AuthorizationPolicySnapshot;
}

function active(from: string, to: string | undefined, at: string): boolean {
  return from <= at && (to === undefined || at < to);
}

async function load(dependencies: AuthorizationGrantPortDependencies): Promise<AuthorizationPolicySnapshot> {
  const version = await dependencies.store.currentVersion();
  return snapshot(await dependencies.store.load(version), version);
}

function roleId(policy: AuthorizationPolicySnapshot, roleKey: string): string {
  const role = policy.roles.find((candidate) => candidate.roleKey === roleKey);
  if (role === undefined) throw new Error(roleKey === CRM_APPLICATION_USER_ROLE_KEY ? "crm_application_user_role_missing" : "crm_administrator_role_missing");
  return role.roleId;
}

function hasAssignmentGrant(policy: AuthorizationPolicySnapshot, targetRoleId: string, assignments: ReadonlySet<string>, at: string): boolean {
  return policy.grants.some((grant) => grant.roleId === targetRoleId && active(grant.validFrom, grant.validTo, at) && grant.subject.kind === "assignment" && assignments.has(grant.subject.assignmentId));
}

async function publish(dependencies: AuthorizationGrantPortDependencies, policy: AuthorizationPolicySnapshot, grants: readonly EffectiveRoleGrant[], operationId: string, at: string): Promise<void> {
  await dependencies.publisher.publish({ contractVersion: "authorization-policy.v2", expectedPreviousVersion: policy.version, publicationId: uuid(`${operationId}:publication`), publishedAt: at, snapshot: { ...policy, grants: Object.freeze(grants), version: operationId } });
}

export function createAuthorizationGrantPort(dependencies: AuthorizationGrantPortDependencies): Readonly<CrmAdministratorGrantPort> {
  return Object.freeze({
    async backfillApplicationGrants(input: Parameters<CrmAdministratorGrantPort["backfillApplicationGrants"]>[0]) {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      const applicationRoleId = roleId(policy, CRM_APPLICATION_USER_ROLE_KEY);
      const ambiguous: string[] = [];
      const eligible: { accountId: string; assignmentId: string }[] = [];
      for (const account of input.accounts) {
        const assignments = await dependencies.resolveActiveAssignmentIds(account.workforcePersonId, at);
        const superAdministrator = (policy.superAdministratorGrants ?? []).some((grant) => grant.workforcePersonId === account.workforcePersonId && active(grant.validFrom, grant.validTo, at));
        if (superAdministrator && assignments.length === 0) continue;
        if (assignments.length !== 1 || assignments[0] === undefined) { ambiguous.push(account.accountId); continue; }
        eligible.push({ accountId: account.accountId, assignmentId: assignments[0] });
      }
      if (ambiguous.length > 0) throw Object.assign(new Error("crm_application_grant_preflight_failed"), { accountIds: Object.freeze(ambiguous.sort()), code: "crm_application_grant_preflight_failed" });
      const missing = eligible.filter(({ assignmentId }) => !hasAssignmentGrant(policy, applicationRoleId, new Set([assignmentId]), at));
      if (missing.length === 0) return Object.freeze({ grantedAccountIds: Object.freeze([]) });
      const grants = [...policy.grants, ...missing.map(({ accountId, assignmentId }) => ({ grantId: uuid(`${input.operationId}:account:${accountId}`), roleId: applicationRoleId, subject: { assignmentId, kind: "assignment" as const }, validFrom: at }))];
      await publish(dependencies, policy, grants, input.operationId, at);
      return Object.freeze({ grantedAccountIds: Object.freeze(missing.map(({ accountId }) => accountId).sort()) });
    },
    async hasApplicationGrant(workforcePersonId: string): Promise<boolean> {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      return hasAssignmentGrant(policy, roleId(policy, CRM_APPLICATION_USER_ROLE_KEY), new Set(await dependencies.resolveActiveAssignmentIds(workforcePersonId, at)), at);
    },
    async hasGrant(workforcePersonId: Parameters<CrmAdministratorGrantPort["hasGrant"]>[0]): Promise<boolean> {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      const assignments = new Set(await dependencies.resolveActiveAssignmentIds(workforcePersonId, at));
      const crmRoleId = roleId(policy, CRM_ADMINISTRATOR_ROLE_KEY);
      return policy.grants.some((grant) => grant.roleId === crmRoleId && active(grant.validFrom, grant.validTo, at) &&
        (grant.subject.kind === "workforce_person"
          ? grant.subject.workforcePersonId === workforcePersonId
          : assignments.has(grant.subject.assignmentId)));
    },
    async isSuperAdministrator(workforcePersonId: Parameters<CrmAdministratorGrantPort["isSuperAdministrator"]>[0]): Promise<boolean> {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      return (policy.superAdministratorGrants ?? []).some((grant) =>
        grant.workforcePersonId === workforcePersonId && active(grant.validFrom, grant.validTo, at));
    },
    async moveApplicationGrant(input: Parameters<CrmAdministratorGrantPort["moveApplicationGrant"]>[0]): Promise<void> {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      const applicationRoleId = roleId(policy, CRM_APPLICATION_USER_ROLE_KEY);
      const closing = new Set(input.closeAssignmentIds);
      let grants: EffectiveRoleGrant[] = policy.grants.map((grant) => grant.roleId === applicationRoleId && grant.subject.kind === "assignment" && closing.has(grant.subject.assignmentId) && active(grant.validFrom, grant.validTo, at) ? { ...grant, validTo: at } : grant);
      if (!hasAssignmentGrant({ ...policy, grants }, applicationRoleId, new Set([input.assignmentId]), at)) grants = [...grants, { grantId: uuid(`${input.operationId}:grant`), roleId: applicationRoleId, subject: { assignmentId: input.assignmentId, kind: "assignment" }, validFrom: at }];
      if (JSON.stringify(grants) === JSON.stringify(policy.grants)) return;
      await publish(dependencies, policy, grants, input.operationId, at);
    },
    async setApplicationGrant(input: Parameters<CrmAdministratorGrantPort["setApplicationGrant"]>[0]): Promise<void> {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      const applicationRoleId = roleId(policy, CRM_APPLICATION_USER_ROLE_KEY);
      const matching = policy.grants.filter((grant) => grant.roleId === applicationRoleId && grant.subject.kind === "assignment" && grant.subject.assignmentId === input.assignmentId && active(grant.validFrom, grant.validTo, at));
      if ((input.enabled && matching.length === 1) || (!input.enabled && matching.length === 0)) return;
      if (matching.length > 1) throw new Error("crm_application_grant_conflict");
      const grants: EffectiveRoleGrant[] = input.enabled ? [...policy.grants, { grantId: uuid(`${input.operationId}:grant`), roleId: applicationRoleId, subject: { assignmentId: input.assignmentId, kind: "assignment" }, validFrom: at }] : policy.grants.map((grant) => matching[0]?.grantId === grant.grantId ? { ...grant, validTo: at } : grant);
      await publish(dependencies, policy, grants, input.operationId, at);
    },
    async setGrant(input: Parameters<CrmAdministratorGrantPort["setGrant"]>[0]): Promise<void> {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      const crmRoleId = roleId(policy, CRM_ADMINISTRATOR_ROLE_KEY);
      const matching = policy.grants.filter((grant) => grant.roleId === crmRoleId &&
        grant.subject.kind === "assignment" && grant.subject.assignmentId === input.assignmentId &&
        active(grant.validFrom, grant.validTo, at));
      if ((input.enabled && matching.length === 1) || (!input.enabled && matching.length === 0)) return;
      if (matching.length > 1) throw new Error("crm_administrator_grant_conflict");
      const grants: EffectiveRoleGrant[] = input.enabled
        ? [...policy.grants, { grantId: uuid(`${input.operationId}:grant`), roleId: crmRoleId, subject: { assignmentId: input.assignmentId, kind: "assignment" }, validFrom: at }]
        : policy.grants.map((grant) => matching[0]?.grantId === grant.grantId ? { ...grant, validTo: at } : grant);
      const nextVersion = input.operationId;
      await publish(dependencies, policy, grants, nextVersion, at);
    },
  });
}
