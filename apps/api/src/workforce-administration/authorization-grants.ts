import { createHash } from "node:crypto";

import type {
  AuthorizationPolicyPublisher,
  AuthorizationPolicySnapshot,
  AuthorizationPolicyStore,
  EffectiveRoleGrant,
} from "@ai-crm/platform-authorization";

import type { CrmAdministratorGrantPort } from "./types.js";

const CRM_ADMINISTRATOR_ROLE_KEY = "crm.system-administrator";

export interface AuthorizationGrantPortDependencies {
  readonly clock: () => Date;
  readonly publisher: AuthorizationPolicyPublisher;
  readonly resolveActiveAssignmentIds: (workforcePersonId: string, at: string) => Promise<readonly string[]>;
  readonly store: AuthorizationPolicyStore;
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

function roleId(policy: AuthorizationPolicySnapshot): string {
  const role = policy.roles.find(({ roleKey }) => roleKey === CRM_ADMINISTRATOR_ROLE_KEY);
  if (role === undefined) throw new Error("crm_administrator_role_missing");
  return role.roleId;
}

export function createAuthorizationGrantPort(dependencies: AuthorizationGrantPortDependencies): Readonly<CrmAdministratorGrantPort> {
  return Object.freeze({
    async hasGrant(workforcePersonId: Parameters<CrmAdministratorGrantPort["hasGrant"]>[0]): Promise<boolean> {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      const assignments = new Set(await dependencies.resolveActiveAssignmentIds(workforcePersonId, at));
      const crmRoleId = roleId(policy);
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
    async setGrant(input: Parameters<CrmAdministratorGrantPort["setGrant"]>[0]): Promise<void> {
      const at = currentTime(dependencies.clock);
      const policy = await load(dependencies);
      const crmRoleId = roleId(policy);
      const matching = policy.grants.filter((grant) => grant.roleId === crmRoleId &&
        grant.subject.kind === "assignment" && grant.subject.assignmentId === input.assignmentId &&
        active(grant.validFrom, grant.validTo, at));
      if ((input.enabled && matching.length === 1) || (!input.enabled && matching.length === 0)) return;
      if (matching.length > 1) throw new Error("crm_administrator_grant_conflict");
      const grants: EffectiveRoleGrant[] = input.enabled
        ? [...policy.grants, { grantId: uuid(`${input.operationId}:grant`), roleId: crmRoleId, subject: { assignmentId: input.assignmentId, kind: "assignment" }, validFrom: at }]
        : policy.grants.map((grant) => matching[0]?.grantId === grant.grantId ? { ...grant, validTo: at } : grant);
      const nextVersion = input.operationId;
      await dependencies.publisher.publish({
        contractVersion: "authorization-policy.v2",
        expectedPreviousVersion: policy.version,
        publicationId: uuid(`${input.operationId}:publication`),
        publishedAt: at,
        snapshot: { ...policy, grants: Object.freeze(grants), version: nextVersion },
      });
    },
  });
}
