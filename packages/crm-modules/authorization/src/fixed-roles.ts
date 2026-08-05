import type { DatabaseRuntime } from "@ai-crm/database";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { AuthorizationDeniedError, AuthorizationUnavailableError } from "./errors.js";
import type { AuthorizationDecision, AuthorizationDecisionRecord, AuthorizationDecisionRecorder, AuthorizationService, AuthorizationSubjectContext, PermissionRequest } from "./types.js";

export const FIXED_ROLE_KEYS = ["application_user", "crm_administrator", "system_administrator"] as const;
export type FixedRoleKey = (typeof FIXED_ROLE_KEYS)[number];

export const FIXED_ROLE_PERMISSION_BUNDLES: Readonly<Record<Exclude<FixedRoleKey, "system_administrator">, readonly PermissionRequest[]>> = Object.freeze({
  application_user: Object.freeze([
    { action: "upload", resource: "crm.file-center.file" },
    { action: "download", resource: "crm.file-center.file" },
    { action: "read", resource: "crm.form-schema.form-release" },
    { action: "validate", resource: "crm.form-schema.form-release" },
    { action: "list", resource: "crm.notifications.in-app-notification" },
    { action: "read", resource: "crm.notifications.in-app-notification" },
    { action: "mark-read", resource: "crm.notifications.in-app-notification" },
    { action: "archive", resource: "crm.notifications.in-app-notification" },
    { action: "list", resource: "crm.task-center.task-projection" },
    { action: "read", resource: "crm.task-center.task-projection" },
    { action: "complete", resource: "crm.task-center.task-projection" },
    { action: "reconcile", resource: "crm.task-center.task-projection" },
    { action: "read", resource: "crm.workbench.shell" },
    { action: "access", resource: "crm.application" },
  ]),
  crm_administrator: Object.freeze([
    { action: "upload", resource: "crm.file-center.file" },
    { action: "download", resource: "crm.file-center.file" },
    { action: "read", resource: "crm.form-schema.form-release" },
    { action: "validate", resource: "crm.form-schema.form-release" },
    { action: "list", resource: "crm.notifications.in-app-notification" },
    { action: "read", resource: "crm.notifications.in-app-notification" },
    { action: "mark-read", resource: "crm.notifications.in-app-notification" },
    { action: "archive", resource: "crm.notifications.in-app-notification" },
    { action: "read", resource: "crm.notifications.template" },
    { action: "manage", resource: "crm.notifications.template" },
    { action: "publish", resource: "crm.notifications.template" },
    { action: "activate", resource: "crm.notifications.template" },
    { action: "list", resource: "crm.task-center.task-projection" },
    { action: "read", resource: "crm.task-center.task-projection" },
    { action: "complete", resource: "crm.task-center.task-projection" },
    { action: "reconcile", resource: "crm.task-center.task-projection" },
    { action: "read", resource: "crm.workbench.shell" },
    { action: "read", resource: "crm.workforce-access.console" },
    { action: "manage", resource: "crm.workforce-access.console" },
    { action: "access", resource: "crm.application" },
  ]),
});

export interface FixedRoleGrant {
  readonly assignmentId?: string;
  readonly grantId: string;
  readonly grantedAt: string;
  readonly roleKey: FixedRoleKey;
  readonly workforcePersonId: string;
}

export interface FixedRoleGrantStore {
  grant(input: Readonly<{ assignmentId?: string; grantId: string; grantedAt: string; operationId: string; roleKey: FixedRoleKey; workforcePersonId: string }>): Promise<void>;
  listActive(workforcePersonId: string, at: string): Promise<readonly Readonly<FixedRoleGrant>[]>;
  revoke(input: Readonly<{ grantId: string; revokedAt: string }>): Promise<void>;
}

interface GrantRow {
  readonly assignment_id: string | null;
  readonly grant_id: string;
  readonly granted_at: Date | string;
  readonly role_key: FixedRoleKey;
  readonly workforce_person_id: string;
}

interface StoredGrantRow extends GrantRow {
  readonly operation_id: string;
}

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export function createFixedRoleGrantStore(database: Pick<DatabaseRuntime, "execute">): Readonly<FixedRoleGrantStore> {
  return Object.freeze({
    async grant(input: Parameters<FixedRoleGrantStore["grant"]>[0]) {
      const assignmentId = input.assignmentId ?? null;
      try {
        const inserted = await database.execute(
          "insert into authorization_core.fixed_role_grants(grant_id,workforce_person_id,assignment_id,role_key,granted_at,operation_id) values($1,$2,$3,$4,$5,$6) on conflict do nothing",
          [input.grantId, input.workforcePersonId, assignmentId, input.roleKey, input.grantedAt, input.operationId],
        );
        if (inserted.rowCount === 1) return;
        const identityConflict = await database.execute<StoredGrantRow>(
          "select grant_id,operation_id,workforce_person_id,assignment_id,role_key,granted_at from authorization_core.fixed_role_grants where operation_id=$1 or grant_id=$2 order by grant_id",
          [input.operationId, input.grantId],
        );
        if (identityConflict.rows.length > 0) {
          const row = identityConflict.rows[0];
          if (identityConflict.rows.length === 1 && row !== undefined && row.grant_id === input.grantId && row.operation_id === input.operationId &&
            row.workforce_person_id === input.workforcePersonId && row.assignment_id === assignmentId && row.role_key === input.roleKey &&
            iso(row.granted_at) === new Date(input.grantedAt).toISOString()) return;
          throw new Error("fixed_role_grant_identity_conflict");
        }
        const existing = await database.execute<{ grant_id: string }>(
          "select grant_id from authorization_core.fixed_role_grants where workforce_person_id=$1 and role_key=$2 and assignment_id is not distinct from $3::uuid and revoked_at is null",
          [input.workforcePersonId, input.roleKey, assignmentId],
        );
        if (existing.rows[0] === undefined) throw new Error("fixed_role_grant_conflict");
      } catch { throw new AuthorizationUnavailableError(); }
    },
    async listActive(workforcePersonId: string, at: string) {
      try {
        const result = await database.execute<GrantRow>(
          "select grant_id,workforce_person_id,assignment_id,role_key,granted_at from authorization_core.fixed_role_grants where workforce_person_id=$1 and granted_at<=$2 and (revoked_at is null or revoked_at>$2) order by role_key,assignment_id nulls first,grant_id",
          [workforcePersonId, at],
        );
        return Object.freeze(result.rows.map((row) => Object.freeze({
          grantId: row.grant_id,
          workforcePersonId: row.workforce_person_id,
          roleKey: row.role_key,
          grantedAt: iso(row.granted_at),
          ...(row.assignment_id === null ? {} : { assignmentId: row.assignment_id }),
        })));
      } catch { throw new AuthorizationUnavailableError(); }
    },
    async revoke(input: Parameters<FixedRoleGrantStore["revoke"]>[0]) {
      try {
        const result = await database.execute("update authorization_core.fixed_role_grants set revoked_at=$2 where grant_id=$1 and revoked_at is null", [input.grantId, input.revokedAt]);
        if (result.rowCount !== 1) throw new AuthorizationDeniedError(randomUUID());
      } catch (error) {
        if (error instanceof AuthorizationDeniedError) throw error;
        throw new AuthorizationUnavailableError();
      }
    },
  });
}

export function createFixedRoleDecisionRecorder(database: Pick<DatabaseRuntime, "execute">): Readonly<AuthorizationDecisionRecorder> {
  return Object.freeze({
    async record(record: AuthorizationDecisionRecord) {
      const digest = createHash("sha256").update(JSON.stringify(record)).digest("hex");
      try {
        await database.execute(
          "insert into authorization_core.decision_records(decision_id,record_digest,evaluated_at,operation,resource,action,permission_code,allowed,reason,policy_version,workforce_person_id,selected_assignment_id,trace_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [record.decisionId, digest, record.evaluatedAt, record.operation, record.resource, record.action, record.permissionCode, record.allowed, record.reason, record.policyVersion, record.workforcePersonId, record.selectedAssignmentId ?? null, record.traceId],
        );
      } catch { throw new AuthorizationUnavailableError(); }
    },
  });
}

export interface FixedRoleAuthorizationOptions {
  readonly approvedPermissions: readonly PermissionRequest[];
  readonly clock?: () => Date;
  readonly decisionRecorder?: AuthorizationDecisionRecorder;
  readonly rolePermissions: Readonly<Record<Exclude<FixedRoleKey, "system_administrator">, readonly PermissionRequest[]>>;
  readonly store: FixedRoleGrantStore;
  readonly traceId?: () => string;
}

const permissionKey = (request: PermissionRequest): string => `${request.resource}:${request.action}`;

function validatePermission(request: PermissionRequest): void {
  if (request.resource.length === 0 || request.action.length === 0 || request.resource.includes("*") || request.action.includes("*")) {
    throw new Error("authorization_fixed_role_permission_invalid");
  }
}

export function createFixedRoleAuthorizationService(options: FixedRoleAuthorizationOptions): Readonly<AuthorizationService> {
  for (const permission of options.approvedPermissions) validatePermission(permission);
  for (const permission of [...options.rolePermissions.application_user, ...options.rolePermissions.crm_administrator]) {
    validatePermission(permission);
    if (!options.approvedPermissions.some((approved) => permissionKey(approved) === permissionKey(permission))) throw new Error("authorization_fixed_role_permission_unapproved");
  }
  const approved = new Set(options.approvedPermissions.map(permissionKey));
  const application = new Set(options.rolePermissions.application_user.map(permissionKey));
  const crmAdministrator = new Set(options.rolePermissions.crm_administrator.map(permissionKey));
  const clock = options.clock ?? (() => new Date());
  const evaluate = async (subject: AuthorizationSubjectContext, request: PermissionRequest, operation: AuthorizationDecisionRecord["operation"], grantSnapshot?: readonly FixedRoleGrant[], evaluatedAt = clock().toISOString()): Promise<Readonly<{ decision: AuthorizationDecision; grants: readonly FixedRoleGrant[] }>> => {
    const key = permissionKey(request);
    let allowed = false;
    let reason: AuthorizationDecision["reason"] = "unknown_permission";
    const grants = grantSnapshot ?? (approved.has(key) ? await options.store.listActive(subject.workforcePersonId, evaluatedAt) : []);
    if (approved.has(key)) {
      const applicable = grants.filter((grant) => grant.roleKey === "system_administrator" || grant.assignmentId !== undefined && grant.assignmentId === subject.selectedAssignmentId && subject.activeAssignmentIds.includes(grant.assignmentId));
      allowed = applicable.some((grant) => grant.roleKey === "system_administrator" || grant.roleKey === "application_user" && application.has(key) || grant.roleKey === "crm_administrator" && crmAdministrator.has(key));
      reason = allowed ? "allowed" : "no_applicable_grant";
    }
    const decision = Object.freeze({ allowed, decisionId: randomUUID(), evaluatedAt, policyVersion: "fixed-roles.v1" as const, reason });
    if (options.decisionRecorder !== undefined) await options.decisionRecorder.record({
      action: request.action,
      allowed,
      decisionId: decision.decisionId,
      evaluatedAt,
      operation,
      permissionCode: key,
      policyVersion: "fixed-roles.v1",
      reason,
      resource: request.resource,
      ...(subject.selectedAssignmentId === undefined ? {} : { selectedAssignmentId: subject.selectedAssignmentId }),
      traceId: options.traceId?.() ?? randomBytes(16).toString("hex"),
      workforcePersonId: subject.workforcePersonId,
    });
    return Object.freeze({ decision, grants });
  };
  return Object.freeze({
    async check(subject: AuthorizationSubjectContext, request: PermissionRequest) { return (await evaluate(subject, request, "check")).decision; },
    async batchCheck(subject: AuthorizationSubjectContext, requests: readonly PermissionRequest[]) {
      const evaluatedAt = clock().toISOString();
      const grants = requests.some((request) => approved.has(permissionKey(request)))
        ? await options.store.listActive(subject.workforcePersonId, evaluatedAt)
        : [];
      return Promise.all(requests.map(async (request) => (await evaluate(subject, request, "batch_check", grants, evaluatedAt)).decision));
    },
    async requireAllowed(subject: AuthorizationSubjectContext, request: PermissionRequest) { const { decision } = await evaluate(subject, request, "check"); if (!decision.allowed) throw new AuthorizationDeniedError(decision.decisionId); return decision; },
    async resolveDataScope(subject: AuthorizationSubjectContext, request: Omit<PermissionRequest, "resourceContext">) {
      const evaluatedAt = clock().toISOString();
      const grants = approved.has(permissionKey(request)) ? await options.store.listActive(subject.workforcePersonId, evaluatedAt) : [];
      const { decision } = await evaluate(subject, request, "resolve_data_scope", grants, evaluatedAt);
      if (!decision.allowed) return Object.freeze({ decision });
      const systemAdministrator = grants.some(({ roleKey }) => roleKey === "system_administrator");
      return Object.freeze({ decision, scope: { terms: systemAdministrator ? [{ kind: "all" as const }] : [{ constraints: [{ dimension: "assignmentId", values: subject.selectedAssignmentId === undefined ? [] : [subject.selectedAssignmentId] }], kind: "match" as const }], version: 1 as const } });
    },
  });
}
