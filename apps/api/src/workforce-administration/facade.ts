import { createHash } from "node:crypto";

import { WorkforceAdministrationFacadeError, type WorkforceAccountPage, type WorkforceAccountQuery, type WorkforceAccountView, type WorkforceAdministrationCommand, type WorkforceAdministrationSnapshot } from "../platform-http/workforce-administration-http.js";
import type {
  AccountRecord,
  AdministrationPrincipal,
  DepartmentTreeNode,
  WorkforceAdministrationApplicationFacade,
  WorkforceAdministrationDependencies,
  WorkforcePersonContext,
} from "./types.js";

const READ_PERMISSION = Object.freeze({ action: "read", resource: "platform.workforce-access.console" });
const MANAGE_PERMISSION = Object.freeze({ action: "manage", resource: "platform.workforce-access.console" });

const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function deriveAdministrationOperationId(operationId: string, purpose: string): string {
  const hex = createHash("sha256").update(`${operationId}:${purpose}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function metadata(principal: AdministrationPrincipal, operationId: string, reason: string, traceId: string) {
  return Object.freeze({ actor: principal.actor, operationId, reason, traceId });
}

function timestamp(dependencies: WorkforceAdministrationDependencies): string {
  let value: unknown;
  try { value = dependencies.clock(); } catch { throw new WorkforceAdministrationFacadeError("unavailable"); }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new WorkforceAdministrationFacadeError("unavailable");
  return value.toISOString();
}

function target(command: WorkforceAdministrationCommand, operationId: string): string {
  if (command.kind === "create_account") return deriveAdministrationOperationId(operationId, "account");
  if ("accountId" in command) return command.accountId;
  if ("departmentId" in command) return command.departmentId;
  if ("positionId" in command) return command.positionId;
  throw new WorkforceAdministrationFacadeError("invalid");
}

function safeCode(error: unknown): string | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "string" ? descriptor.value : undefined;
}

function mapError(error: unknown): WorkforceAdministrationFacadeError {
  if (error instanceof WorkforceAdministrationFacadeError) return error;
  const code = safeCode(error);
  if (["AUTHORIZATION_DENIED", "authorization_denied", "assignment_not_active", "employment_not_active", "subject_not_associated"].includes(code ?? "")) return new WorkforceAdministrationFacadeError("forbidden");
  if (["entity_conflict", "entity_not_found", "idempotency_conflict", "login_identifier_occupied", "revision_conflict", "state_transition_invalid", "organization_hierarchy_cycle", "organization_path_invalid"].includes(code ?? "")) return new WorkforceAdministrationFacadeError("conflict");
  if (code === "password_policy_violation") return new WorkforceAdministrationFacadeError("password_policy_violation");
  if (code === "input_invalid" || code === "effective_interval_invalid") return new WorkforceAdministrationFacadeError("invalid");
  return new WorkforceAdministrationFacadeError("unavailable");
}

async function principal(dependencies: WorkforceAdministrationDependencies, credential: string, traceId: string): Promise<Readonly<AdministrationPrincipal>> {
  return dependencies.principals.resolve({ credential, traceId });
}

async function currentContext(dependencies: WorkforceAdministrationDependencies, account: AccountRecord, at: string): Promise<Readonly<WorkforcePersonContext> | undefined> {
  if (account.workforcePersonId === undefined) return undefined;
  try { return await dependencies.organization.resolveWorkforcePersonContext(account.workforcePersonId, at); }
  catch (error) {
    if (["employment_not_active", "entity_not_found"].includes(safeCode(error) ?? "")) return undefined;
    throw error;
  }
}

async function exactAssignment(dependencies: WorkforceAdministrationDependencies, account: AccountRecord, at: string) {
  const context = await currentContext(dependencies, account, at);
  if (context === undefined || context.assignments.length !== 1) throw new WorkforceAdministrationFacadeError("conflict");
  const assignment = context.assignments[0];
  if (assignment === undefined) throw new WorkforceAdministrationFacadeError("conflict");
  return Object.freeze({ assignment, context });
}

async function audit(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, command: WorkforceAdministrationCommand, operationId: string, traceId: string): Promise<void> {
  await dependencies.audit.record({ action: command.kind, actorId: principalValue.actor.actorId, operationId: deriveAdministrationOperationId(operationId, "audit"), result: "succeeded", targetId: target(command, operationId), traceId });
}

async function submitIdentitySync(
  dependencies: WorkforceAdministrationDependencies,
  principalValue: AdministrationPrincipal,
  input: Readonly<{ account: AccountRecord; action: "disable" | "revoke_sessions" | "synchronize_login_identifiers"; at: string; operationId: string; retryOfOperationId?: string; traceId: string }>,
): Promise<void> {
  if (input.account.keycloakUserId === undefined) throw new WorkforceAdministrationFacadeError("conflict");
  await dependencies.accounts.beginIdentitySync({
    ...metadata(principalValue, input.operationId, `workforce_administration:identity_sync:${input.action}`, input.traceId),
    accountId: input.account.accountId,
    action: input.action,
    requestedAt: input.at,
    ...(input.retryOfOperationId === undefined ? {} : { retryOfOperationId: input.retryOfOperationId }),
  });
  const common = { accountId: input.account.accountId, keycloakUserId: input.account.keycloakUserId, operationId: input.operationId, ...(input.retryOfOperationId === undefined ? {} : { retryOfOperationId: input.retryOfOperationId }), traceId: input.traceId };
  if (input.action === "disable") return dependencies.identity.disableAccount(common);
  if (input.action === "revoke_sessions") return dependencies.identity.revokeSessions(common);
  await dependencies.identity.synchronizeLoginIdentifiers({ ...common, ...(input.account.phone === undefined ? {} : { phone: input.account.phone }), username: input.account.username });
}

async function createAccount(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, command: Extract<WorkforceAdministrationCommand, { kind: "create_account" }>, operationId: string, traceId: string, at: string) {
  const accountId = deriveAdministrationOperationId(operationId, "account");
  const workforcePersonId = deriveAdministrationOperationId(operationId, "workforce-person");
  const employmentId = deriveAdministrationOperationId(operationId, "employment");
  const assignmentId = deriveAdministrationOperationId(operationId, "assignment");
  await dependencies.transactions.run(async () => {
    await dependencies.organization.createWorkforcePerson({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "create-person"), "workforce_administration:create_account", traceId), recordedAt: at, workforcePersonId });
    await dependencies.organization.createEmployment({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "create-employment"), "workforce_administration:create_account", traceId), effectiveFrom: at, employmentId, workforcePersonId });
    await dependencies.organization.createAssignment({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "create-assignment"), "workforce_administration:create_account", traceId), assignmentId, effectiveFrom: at, employmentId, organizationUnitId: command.departmentId, positionId: command.positionId, workforcePersonId });
    await dependencies.organizationDirectory.upsertPersonProfile({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "create-profile"), "workforce_administration:create_account", traceId), realName: command.legalName, updatedAt: at, workforcePersonId });
    await dependencies.accounts.createAccount({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "create-account-directory"), "workforce_administration:create_account", traceId), accountId, createdAt: at, ...(command.phone === undefined ? {} : { phone: command.phone }), username: command.username, workforcePersonId });
  });
  const identity = await dependencies.identity.createDisabledAccount({ accountId, operationId: deriveAdministrationOperationId(operationId, "identity-create"), ...(command.phone === undefined ? {} : { phone: command.phone }), traceId, username: command.username });
  const account = await dependencies.accounts.getAccount(accountId);
  const linked = await dependencies.accounts.linkKeycloakUser({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "identity-link"), "workforce_administration:create_account", traceId), accountId, expectedRevision: account.revision, keycloakUserId: identity.keycloakUserId, updatedAt: at });
  await dependencies.grants.setApplicationGrant({ assignmentId, enabled: true, operationId: deriveAdministrationOperationId(operationId, "crm-application-grant"), workforcePersonId });
  await dependencies.identity.setPasswordAndEnable({ accountId, keycloakUserId: identity.keycloakUserId, operationId: deriveAdministrationOperationId(operationId, "set-initial-password"), password: command.initialPassword, traceId });
  await dependencies.accounts.setStatus({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "activate-directory"), "workforce_administration:create_account", traceId), accountId, expectedRevision: linked.revision, status: "active", updatedAt: at });
  return Object.freeze({});
}

async function updateAccount(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, command: Extract<WorkforceAdministrationCommand, { kind: "update_account" }>, operationId: string, traceId: string, at: string) {
  const account = await dependencies.accounts.getAccount(command.accountId);
  if (account.keycloakUserId === undefined) throw new WorkforceAdministrationFacadeError("conflict");
  if (account.workforcePersonId === undefined) throw new WorkforceAdministrationFacadeError("conflict");
  if (await dependencies.grants.hasGrant(account.workforcePersonId)) {
    const current = await exactAssignment(dependencies, account, at);
    if (current.assignment.organizationUnitId !== command.departmentId || current.assignment.positionId !== command.positionId) throw new WorkforceAdministrationFacadeError("conflict");
  }
  const current = await exactAssignment(dependencies, account, at);
  const assignmentChanged = current.assignment.organizationUnitId !== command.departmentId || current.assignment.positionId !== command.positionId;
  const nextAssignmentId = deriveAdministrationOperationId(operationId, "assignment");
  await dependencies.transactions.run(async () => {
    await dependencies.accounts.updateLoginIdentifiers({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "identifiers"), "workforce_administration:update_account", traceId), accountId: account.accountId, expectedRevision: command.expectedRevision, ...(command.phone === undefined ? {} : { phone: command.phone }), updatedAt: at, username: command.username });
    const profile = await dependencies.organizationDirectory.getPersonProfile(account.workforcePersonId ?? "");
    await dependencies.organizationDirectory.upsertPersonProfile({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "profile"), "workforce_administration:update_account", traceId), expectedRevision: profile.revision, realName: command.legalName, updatedAt: at, workforcePersonId: account.workforcePersonId ?? "" });
    if (assignmentChanged) {
      await dependencies.organization.closeAssignment({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "close-assignment"), "workforce_administration:update_account", traceId), effectiveTo: at, factId: current.assignment.assignmentId });
      await dependencies.organization.createAssignment({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "create-assignment"), "workforce_administration:update_account", traceId), assignmentId: nextAssignmentId, effectiveFrom: at, employmentId: current.assignment.employmentId, organizationUnitId: command.departmentId, positionId: command.positionId, workforcePersonId: account.workforcePersonId ?? "" });
    }
    const updatedAccount = { ...account, ...(command.phone === undefined ? {} : { phone: command.phone }), username: command.username };
    await submitIdentitySync(dependencies, principalValue, { account: updatedAccount, action: "synchronize_login_identifiers", at, operationId: deriveAdministrationOperationId(operationId, "identity-sync"), traceId });
  });
  if (assignmentChanged) await dependencies.grants.moveApplicationGrant({ assignmentId: nextAssignmentId, closeAssignmentIds: [current.assignment.assignmentId], operationId: deriveAdministrationOperationId(operationId, "move-crm-application-grant"), workforcePersonId: account.workforcePersonId });
  return Object.freeze({});
}

async function updateSystemAccount(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, command: Extract<WorkforceAdministrationCommand, { kind: "update_system_account" }>, operationId: string, traceId: string, at: string) {
  const account = await dependencies.accounts.getAccount(command.accountId);
  if (account.revision !== command.expectedRevision || account.keycloakUserId === undefined || account.workforcePersonId === undefined || account.status !== "active") {
    throw new WorkforceAdministrationFacadeError("conflict");
  }
  const self = account.workforcePersonId === principalValue.subject.workforcePersonId;
  const [currentIsSuper, targetIsSuper] = await Promise.all([
    dependencies.grants.isSuperAdministrator(principalValue.subject.workforcePersonId),
    dependencies.grants.isSuperAdministrator(account.workforcePersonId),
  ]);
  if (!self || !currentIsSuper || !targetIsSuper || principalValue.reauthenticated !== true) throw new WorkforceAdministrationFacadeError("forbidden");
  await dependencies.transactions.run(async () => {
    const profile = await dependencies.organizationDirectory.getPersonProfile(account.workforcePersonId ?? "");
    await dependencies.accounts.updateLoginIdentifiers({
      ...metadata(principalValue, deriveAdministrationOperationId(operationId, "identifiers"), "workforce_administration:update_system_account", traceId),
      accountId: account.accountId,
      expectedRevision: command.expectedRevision,
      ...(command.phone === undefined ? {} : { phone: command.phone }),
      updatedAt: at,
      username: command.username,
    });
    await dependencies.organizationDirectory.upsertPersonProfile({
      ...metadata(principalValue, deriveAdministrationOperationId(operationId, "profile"), "workforce_administration:update_system_account", traceId),
      expectedRevision: profile.revision,
      realName: command.legalName,
      updatedAt: at,
      workforcePersonId: account.workforcePersonId ?? "",
    });
    const updatedAccount = { ...account, ...(command.phone === undefined ? {} : { phone: command.phone }), username: command.username };
    await submitIdentitySync(dependencies, principalValue, { account: updatedAccount, action: "synchronize_login_identifiers", at, operationId: deriveAdministrationOperationId(operationId, "identity-sync"), traceId });
  });
  return Object.freeze({});
}

async function deactivateAccount(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, command: Readonly<{ accountId: string; expectedRevision: number; kind: "deactivate_account" }>, operationId: string, traceId: string, at: string) {
  const account = await dependencies.accounts.getAccount(command.accountId);
  if (account.workforcePersonId === undefined || account.keycloakUserId === undefined || await dependencies.grants.hasGrant(account.workforcePersonId)) throw new WorkforceAdministrationFacadeError("conflict");
  const context = await exactAssignment(dependencies, account, at);
  await dependencies.transactions.run(async () => {
    await dependencies.accounts.setStatus({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "disable-directory"), "workforce_administration:deactivate_account", traceId), accountId: account.accountId, expectedRevision: command.expectedRevision, status: "disabled", updatedAt: at });
    for (const assignment of context.context.assignments) await dependencies.organization.closeAssignment({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, `close-assignment:${assignment.assignmentId}`), "workforce_administration:deactivate_account", traceId), effectiveTo: at, factId: assignment.assignmentId });
    for (const employmentId of context.context.employmentIds) await dependencies.organization.closeEmployment({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, `close-employment:${employmentId}`), "workforce_administration:deactivate_account", traceId), effectiveTo: at, factId: employmentId });
  });
  await dependencies.grants.setApplicationGrant({ assignmentId: context.assignment.assignmentId, enabled: false, operationId: deriveAdministrationOperationId(operationId, "close-crm-application-grant"), workforcePersonId: account.workforcePersonId });
  await dependencies.transactions.run(() => submitIdentitySync(dependencies, principalValue, { account: { ...account, status: "disabled" }, action: "disable", at, operationId: deriveAdministrationOperationId(operationId, "identity-disable"), traceId }));
  return Object.freeze({});
}

async function requireAccountMutationAllowed(
  dependencies: WorkforceAdministrationDependencies,
  principalValue: AdministrationPrincipal,
  account: AccountRecord,
  kind: WorkforceAdministrationCommand["kind"],
): Promise<void> {
  if (account.workforcePersonId === undefined) throw new WorkforceAdministrationFacadeError("conflict");
  const self = account.workforcePersonId === principalValue.subject.workforcePersonId;
  const [currentIsSuper, targetIsSuper, targetIsCrmAdministrator] = await Promise.all([
    dependencies.grants.isSuperAdministrator(principalValue.subject.workforcePersonId),
    dependencies.grants.isSuperAdministrator(account.workforcePersonId),
    dependencies.grants.hasGrant(account.workforcePersonId),
  ]);
  if (self) {
    if (currentIsSuper && (kind === "update_account" || kind === "retry_identity_sync") && principalValue.reauthenticated === true) return;
    throw new WorkforceAdministrationFacadeError("forbidden");
  }
  if (!currentIsSuper && (targetIsSuper || targetIsCrmAdministrator)) throw new WorkforceAdministrationFacadeError("forbidden");
}

async function accountCommand(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, command: WorkforceAdministrationCommand, operationId: string, traceId: string, at: string) {
  if (command.kind === "create_account") return createAccount(dependencies, principalValue, command, operationId, traceId, at);
  if (!("accountId" in command)) throw new WorkforceAdministrationFacadeError("invalid");
  if (command.kind === "update_system_account") return updateSystemAccount(dependencies, principalValue, command, operationId, traceId, at);
  const targetAccount = await dependencies.accounts.getAccount(command.accountId);
  await requireAccountMutationAllowed(dependencies, principalValue, targetAccount, command.kind);
  if (command.kind === "retry_identity_sync") {
    if (targetAccount.revision !== command.expectedRevision || targetAccount.keycloakUserId === undefined) throw new WorkforceAdministrationFacadeError("conflict");
    const failed = await dependencies.accounts.getIdentitySyncOperation(command.failedOperationId);
    if (failed.accountId !== targetAccount.accountId || failed.status !== "failed" || targetAccount.latestIdentitySync?.operationId !== failed.operationId) throw new WorkforceAdministrationFacadeError("conflict");
    const statusAllows = failed.action === "disable"
      ? targetAccount.status === "disabled"
      : failed.action === "revoke_sessions"
        ? ["active", "credential_pending", "disabled"].includes(targetAccount.status)
        : ["active", "credential_pending"].includes(targetAccount.status);
    if (!statusAllows) throw new WorkforceAdministrationFacadeError("conflict");
    await dependencies.transactions.run(() => submitIdentitySync(dependencies, principalValue, {
      account: targetAccount,
      action: failed.action,
      at,
      operationId: deriveAdministrationOperationId(operationId, "identity-retry"),
      retryOfOperationId: failed.operationId,
      traceId,
    }));
    return Object.freeze({});
  }
  if (command.kind === "update_account") return updateAccount(dependencies, principalValue, command, operationId, traceId, at);
  if (command.kind === "deactivate_account") return deactivateAccount(dependencies, principalValue, { accountId: command.accountId, expectedRevision: command.expectedRevision, kind: "deactivate_account" }, operationId, traceId, at);
  if (command.kind === "complete_credential_ceremony") {
    const account = await dependencies.accounts.getAccount(command.accountId);
    if (account.revision !== command.expectedRevision || account.keycloakUserId === undefined) throw new WorkforceAdministrationFacadeError("conflict");
    await dependencies.credentialCeremonies.complete({ accountId: account.accountId, keycloakUserId: account.keycloakUserId, operationId: command.ceremonyOperationId, operatorSubjectId: principalValue.identitySubjectId, traceId });
    if (account.status === "credential_pending") {
      if (account.workforcePersonId === undefined || !await dependencies.grants.hasApplicationGrant(account.workforcePersonId)) throw new WorkforceAdministrationFacadeError("forbidden");
      await dependencies.accounts.setStatus({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "credential-complete"), "workforce_administration:complete_credential_ceremony", traceId), accountId: account.accountId, expectedRevision: command.expectedRevision, status: "active", updatedAt: at });
    } else if (account.status !== "active") throw new WorkforceAdministrationFacadeError("conflict");
    return Object.freeze({});
  }
  if (command.kind === "reset_password") {
    const account = await dependencies.accounts.getAccount(command.accountId);
    if (account.revision !== command.expectedRevision || account.keycloakUserId === undefined || !["active", "credential_pending"].includes(account.status)) throw new WorkforceAdministrationFacadeError("conflict");
    await dependencies.identity.setPasswordAndEnable({ accountId: account.accountId, keycloakUserId: account.keycloakUserId, operationId: deriveAdministrationOperationId(operationId, "set-password"), password: command.password, traceId });
    await dependencies.transactions.run(() => submitIdentitySync(dependencies, principalValue, { account, action: "revoke_sessions", at, operationId: deriveAdministrationOperationId(operationId, "revoke-sessions"), traceId }));
    if (account.status === "credential_pending") {
      if (account.workforcePersonId === undefined || !await dependencies.grants.hasApplicationGrant(account.workforcePersonId)) throw new WorkforceAdministrationFacadeError("forbidden");
      await dependencies.accounts.setStatus({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "activate-directory"), "workforce_administration:reset_password", traceId), accountId: account.accountId, expectedRevision: command.expectedRevision, status: "active", updatedAt: at });
    } else if (account.status !== "active") throw new WorkforceAdministrationFacadeError("conflict");
    return Object.freeze({});
  }
  if (command.kind === "release_phone") {
    const account = await dependencies.accounts.getAccount(command.accountId);
    if (account.revision !== command.expectedRevision || account.phone === command.phone) throw new WorkforceAdministrationFacadeError("conflict");
    const history = await dependencies.accounts.listIdentifierHistory(account.accountId);
    const releasable = history.some((item) => item.accountId === account.accountId && item.kind === "phone" && item.value === command.phone && item.releasedAt === undefined);
    if (!releasable) throw new WorkforceAdministrationFacadeError("conflict");
    await dependencies.accounts.releasePhone({
      ...metadata(principalValue, deriveAdministrationOperationId(operationId, "release-phone"), "workforce_administration:release_phone", traceId),
      accountId: account.accountId,
      phone: command.phone,
      releasedAt: at,
    });
    return Object.freeze({});
  }
  if (command.kind === "reactivate_account") {
    const account = await dependencies.accounts.getAccount(command.accountId);
    if (account.workforcePersonId === undefined || account.keycloakUserId === undefined) throw new WorkforceAdministrationFacadeError("conflict");
    await dependencies.transactions.run(async () => {
      await dependencies.recovery.restore({ accountId: account.accountId, actor: principalValue.actor, departmentId: command.departmentId, effectiveFrom: at, operationId: deriveAdministrationOperationId(operationId, "restore-workforce"), positionId: command.positionId, traceId, workforcePersonId: account.workforcePersonId ?? "" });
      await dependencies.accounts.setStatus({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "reactivate-directory"), "workforce_administration:reactivate_account", traceId), accountId: account.accountId, expectedRevision: command.expectedRevision, status: "credential_pending", updatedAt: at });
    });
    const recoveryOperationId = deriveAdministrationOperationId(operationId, "restore-workforce");
    await dependencies.grants.setApplicationGrant({ assignmentId: deriveAdministrationOperationId(recoveryOperationId, "assignment"), enabled: true, operationId: deriveAdministrationOperationId(operationId, "restore-crm-application-grant"), workforcePersonId: account.workforcePersonId });
    const ceremony = await dependencies.credentialCeremonies.start({ accountId: account.accountId, keycloakUserId: account.keycloakUserId, kind: "recover", operationId: deriveAdministrationOperationId(operationId, "credential-ceremony"), operatorSubjectId: principalValue.identitySubjectId, traceId });
    return Object.freeze({ credentialRedirectUrl: ceremony.redirectUrl });
  }
  throw new WorkforceAdministrationFacadeError("invalid");
}

async function grantCommand(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, command: Extract<WorkforceAdministrationCommand, { kind: "set_crm_administrator" }>, operationId: string, traceId: string, at: string) {
  if (!await dependencies.grants.isSuperAdministrator(principalValue.subject.workforcePersonId)) throw new WorkforceAdministrationFacadeError("forbidden");
  const account = await dependencies.accounts.getAccount(command.accountId);
  if (account.revision !== command.expectedRevision || account.workforcePersonId === undefined) throw new WorkforceAdministrationFacadeError("conflict");
  const { assignment } = await exactAssignment(dependencies, account, at);
  if (assignment.organizationUnitId !== dependencies.crmAdministratorDepartmentId) throw new WorkforceAdministrationFacadeError("conflict");
  await dependencies.grants.setGrant({ actor: principalValue.actor, assignmentId: assignment.assignmentId, enabled: command.enabled, operationId: deriveAdministrationOperationId(operationId, "crm-administrator-grant"), traceId, workforcePersonId: account.workforcePersonId });
  return Object.freeze({});
}

async function directoryCommand(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, command: WorkforceAdministrationCommand, operationId: string, traceId: string, at: string) {
  if (command.kind === "create_department") {
    await dependencies.transactions.run(async () => {
      await dependencies.organization.createOrganizationUnit({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "organization-unit"), "workforce_administration:create_department", traceId), effectiveFrom: at, organizationUnitId: command.departmentId, ...(command.parentDepartmentId === undefined ? {} : { parentOrganizationUnitId: command.parentDepartmentId }), placementId: deriveAdministrationOperationId(operationId, "placement") });
      await dependencies.organizationDirectory.createDepartment({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "department-directory"), "workforce_administration:create_department", traceId), name: command.name, organizationUnitId: command.departmentId, ...(command.parentDepartmentId === undefined ? {} : { parentOrganizationUnitId: command.parentDepartmentId }), updatedAt: at });
    });
  } else if (command.kind === "update_department") {
    await dependencies.organizationDirectory.updateDepartment({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "department-update"), "workforce_administration:update_department", traceId), expectedRevision: command.expectedRevision, name: command.name, organizationUnitId: command.departmentId, ...(command.parentDepartmentId === undefined ? {} : { parentOrganizationUnitId: command.parentDepartmentId }), updatedAt: at });
  } else if (command.kind === "deactivate_department" || command.kind === "reactivate_department") {
    await dependencies.organizationDirectory.setDepartmentActive({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "department-status"), `workforce_administration:${command.kind}`, traceId), active: command.kind === "reactivate_department", expectedRevision: command.expectedRevision, organizationUnitId: command.departmentId, updatedAt: at });
  } else if (command.kind === "create_position") {
    await dependencies.transactions.run(async () => {
      await dependencies.organization.createPosition({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "position"), "workforce_administration:create_position", traceId), effectiveFrom: at, organizationUnitId: command.departmentId, positionId: command.positionId });
      await dependencies.organizationDirectory.createPosition({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "position-directory"), "workforce_administration:create_position", traceId), name: command.name, organizationUnitId: command.departmentId, positionId: command.positionId, updatedAt: at });
    });
  } else if (command.kind === "update_position") {
    await dependencies.organizationDirectory.updatePosition({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "position-update"), "workforce_administration:update_position", traceId), expectedRevision: command.expectedRevision, name: command.name, positionId: command.positionId, updatedAt: at });
  } else if (command.kind === "deactivate_position" || command.kind === "reactivate_position") {
    await dependencies.organizationDirectory.setPositionActive({ ...metadata(principalValue, deriveAdministrationOperationId(operationId, "position-status"), `workforce_administration:${command.kind}`, traceId), active: command.kind === "reactivate_position", expectedRevision: command.expectedRevision, positionId: command.positionId, updatedAt: at });
  } else throw new WorkforceAdministrationFacadeError("invalid");
  return Object.freeze({});
}

function flatten(nodes: readonly DepartmentTreeNode[]): readonly DepartmentTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

async function accountView(dependencies: WorkforceAdministrationDependencies, current: AdministrationPrincipal, account: AccountRecord, at: string, currentIsSuper: boolean): Promise<{ readonly system: boolean; readonly view?: WorkforceAccountView }> {
  if (account.workforcePersonId === undefined) return Object.freeze({ system: false });
  const system = await dependencies.grants.isSuperAdministrator(account.workforcePersonId);
  if (system && !currentIsSuper) return Object.freeze({ system: true });
  const profile = await dependencies.organizationDirectory.getPersonProfile(account.workforcePersonId);
  const context = await currentContext(dependencies, account, at);
  const assignment = context?.assignments.length === 1 ? context.assignments[0] : undefined;
  const crmAdministrator = await dependencies.grants.hasGrant(account.workforcePersonId);
  const identifierHistory = await dependencies.accounts.listIdentifierHistory(account.accountId);
  const releasablePhones = Object.freeze([...new Set(identifierHistory
    .filter((item) => item.accountId === account.accountId && item.kind === "phone" && item.releasedAt === undefined && item.value !== account.phone)
    .map((item) => item.value))]);
  if (releasablePhones.length > 100) throw new WorkforceAdministrationFacadeError("unavailable");
  const self = current.subject.workforcePersonId === account.workforcePersonId;
  const retryStateAllows = account.latestIdentitySync?.status === "failed" && (account.latestIdentitySync.action === "disable"
    ? account.status === "disabled"
    : account.latestIdentitySync.action === "revoke_sessions"
      ? ["active", "credential_pending", "disabled"].includes(account.status)
      : ["active", "credential_pending"].includes(account.status));
  const retryAllowed = account.keycloakUserId !== undefined && retryStateAllows && (system
    ? self && currentIsSuper && current.reauthenticated === true
    : !self && (currentIsSuper || !crmAdministrator));
  const baseActions = system ? self && currentIsSuper && current.reauthenticated === true && account.status === "active" ? ["edit"] : [] : self || crmAdministrator && !currentIsSuper ? [] : account.status === "disabled"
    ? ["reactivate", ...(releasablePhones.length === 0 ? [] : ["release_phone"])]
    : ["edit", "deactivate", "reset_password", "transfer", ...(releasablePhones.length === 0 ? [] : ["release_phone"]), ...(currentIsSuper ? [crmAdministrator ? "revoke_crm_administrator" : "grant_crm_administrator"] : [])];
  const allowedActions = [...baseActions, ...(retryAllowed ? ["retry_identity_sync"] : [])];
  const latestIdentitySync = account.latestIdentitySync === undefined ? undefined : Object.freeze({
    action: account.latestIdentitySync.action,
    ...(account.latestIdentitySync.completedAt === undefined ? {} : { completedAt: account.latestIdentitySync.completedAt }),
    ...(account.latestIdentitySync.errorCode === undefined ? {} : { errorCode: account.latestIdentitySync.errorCode }),
    operationId: account.latestIdentitySync.operationId,
    requestedAt: account.latestIdentitySync.requestedAt,
    ...(account.latestIdentitySync.retryOfOperationId === undefined ? {} : { retryOfOperationId: account.latestIdentitySync.retryOfOperationId }),
    status: account.latestIdentitySync.status,
  });
  let departmentName: string | undefined; let positionName: string | undefined;
  if (assignment !== undefined) {
    const departments = flatten(await dependencies.organizationDirectory.listDepartmentTree({ includeInactive: true }));
    departmentName = departments.find((item) => item.organizationUnitId === assignment.organizationUnitId)?.name;
    positionName = (await dependencies.organizationDirectory.listPositions(assignment.organizationUnitId, { includeInactive: true })).find((item) => item.positionId === assignment.positionId)?.name;
  }
  return Object.freeze({ system, view: Object.freeze({
    accountId: account.accountId, allowedActions: Object.freeze(allowedActions), crmAdministrator,
    ...(assignment === undefined ? {} : { departmentId: assignment.organizationUnitId, ...(departmentName === undefined ? {} : { departmentName }), positionId: assignment.positionId, ...(positionName === undefined ? {} : { positionName }) }),
    legalName: profile.realName, ...(latestIdentitySync === undefined ? {} : { latestIdentitySync }), ...(account.phone === undefined ? {} : { phone: account.phone }), releasablePhones, revision: account.revision, status: account.status, username: account.username,
  }) });
}

function matchesAccount(view: WorkforceAccountView, query: WorkforceAccountQuery): boolean {
  const username = query.username?.toLocaleLowerCase("en-US");
  return (username === undefined || view.username.toLocaleLowerCase("en-US").includes(username))
    && (query.legalName === undefined || view.legalName.includes(query.legalName))
    && (query.phone === undefined || view.phone?.includes(query.phone) === true)
    && (query.departmentId === undefined || view.departmentId === query.departmentId)
    && (query.positionId === undefined || view.positionId === query.positionId)
    && (query.status === undefined || view.status === query.status);
}

async function visibleAccounts(dependencies: WorkforceAdministrationDependencies, principalValue: AdministrationPrincipal, at: string): Promise<readonly WorkforceAccountView[]> {
  const currentIsSuper = await dependencies.grants.isSuperAdministrator(principalValue.subject.workforcePersonId);
  const result: WorkforceAccountView[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await dependencies.accounts.listAccounts({ ...(cursor === undefined ? {} : { cursor }), limit: 200 });
    const rendered = await Promise.all(page.items.map((account) => accountView(dependencies, principalValue, account, at, currentIsSuper)));
    result.push(...rendered.filter((item) => !item.system && item.view !== undefined).map((item) => item.view as WorkforceAccountView));
    cursor = page.nextCursor;
    if (cursor !== undefined && (cursors.has(cursor) || cursors.size >= 1_000_000)) throw new WorkforceAdministrationFacadeError("unavailable");
    if (cursor !== undefined) cursors.add(cursor);
  } while (cursor !== undefined);
  return Object.freeze(result);
}

export function createWorkforceAdministrationFacade(dependencies: WorkforceAdministrationDependencies): Readonly<WorkforceAdministrationApplicationFacade> {
  return Object.freeze({
    async execute(input: Readonly<{ command: WorkforceAdministrationCommand; credential: string; operationId: string; traceId: string }>) {
      try {
        const principalValue = await principal(dependencies, input.credential, input.traceId);
        await dependencies.authorization.requireAllowed(principalValue.subject, MANAGE_PERMISSION);
        const at = timestamp(dependencies);
        const fingerprint = digest({ actor: principalValue.actor, command: input.command });
        const completed = await dependencies.operations.execute({ fingerprint, operationId: input.operationId, traceId: input.traceId }, async () => {
          let value: Readonly<{ credentialRedirectUrl?: string }>;
          if (input.command.kind === "set_crm_administrator") value = await grantCommand(dependencies, principalValue, input.command, input.operationId, input.traceId, at);
          else if (["create_account", "update_account", "update_system_account", "deactivate_account", "reactivate_account", "reset_password", "complete_credential_ceremony", "release_phone", "retry_identity_sync"].includes(input.command.kind)) value = await accountCommand(dependencies, principalValue, input.command, input.operationId, input.traceId, at);
          else value = await directoryCommand(dependencies, principalValue, input.command, input.operationId, input.traceId, at);
          await audit(dependencies, principalValue, input.command, input.operationId, input.traceId);
          return value;
        });
        return Object.freeze({ ...completed.value, replayed: completed.replayed });
      } catch (error) { throw mapError(error); }
    },
    async listAccounts(input: Readonly<{ credential: string; query: WorkforceAccountQuery; traceId: string }>): Promise<Readonly<WorkforceAccountPage>> {
      try {
        const principalValue = await principal(dependencies, input.credential, input.traceId);
        await dependencies.authorization.requireAllowed(principalValue.subject, READ_PERMISSION);
        const filtered = (await visibleAccounts(dependencies, principalValue, timestamp(dependencies))).filter((view) => matchesAccount(view, input.query));
        const offset = (input.query.page - 1) * input.query.pageSize;
        return Object.freeze({ items: Object.freeze(filtered.slice(offset, offset + input.query.pageSize)), page: input.query.page, pageSize: input.query.pageSize, total: filtered.length });
      } catch (error) { throw mapError(error); }
    },
    async load(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<WorkforceAdministrationSnapshot>> {
      try {
        const principalValue = await principal(dependencies, input.credential, input.traceId);
        await dependencies.authorization.requireAllowed(principalValue.subject, READ_PERMISSION);
        const at = timestamp(dependencies);
        const currentIsSuper = await dependencies.grants.isSuperAdministrator(principalValue.subject.workforcePersonId);
        const accounts: AccountRecord[] = [];
        let cursor: string | undefined;
        do {
          const page = await dependencies.accounts.listAccounts({ ...(cursor === undefined ? {} : { cursor }), limit: 200 });
          accounts.push(...page.items); cursor = page.nextCursor;
          if (accounts.length > 1_000) throw new WorkforceAdministrationFacadeError("unavailable");
        } while (cursor !== undefined);
        const rendered = await Promise.all(accounts.map((account) => accountView(dependencies, principalValue, account, at, currentIsSuper)));
        const departments = flatten(await dependencies.organizationDirectory.listDepartmentTree({ includeInactive: true }));
        const positions = (await Promise.all(departments.map((department) => dependencies.organizationDirectory.listPositions(department.organizationUnitId, { includeInactive: true })))).flat();
        const systemAccount = rendered.find((item) => item.system)?.view;
        return Object.freeze({
          accounts: Object.freeze(rendered.filter((item) => !item.system && item.view !== undefined).map((item) => item.view as WorkforceAccountView)),
          departments: Object.freeze(departments.map((item) => ({ allowedActions: Object.freeze(item.rootLocked ? ["edit"] : item.active ? ["edit", "deactivate"] : ["reactivate"]), departmentId: item.organizationUnitId, name: item.name, ...(item.parentOrganizationUnitId === undefined ? {} : { parentDepartmentId: item.parentOrganizationUnitId }), revision: item.revision, status: item.active ? "active" as const : "disabled" as const }))),
          positions: Object.freeze(positions.map((item) => ({ allowedActions: Object.freeze(item.active ? ["edit", "deactivate"] : ["reactivate"]), departmentId: item.organizationUnitId, name: item.name, positionId: item.positionId, revision: item.revision, status: item.active ? "active" as const : "disabled" as const }))),
          ...(systemAccount === undefined ? {} : { systemAccount }),
        });
      } catch (error) { throw mapError(error); }
    },
  });
}
