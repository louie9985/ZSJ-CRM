import { createHash } from "node:crypto";

import { hashPassword } from "@ai-crm/crm-workforce-access";

import {
  WorkforceAdministrationFacadeError,
  type WorkforceAccountPage,
  type WorkforceAccountQuery,
  type WorkforceAccountView,
  type WorkforceAdministrationCommand,
  type WorkforceAdministrationSnapshot,
} from "../platform-http/workforce-administration-http.js";
import { createFixedRoleAdministrationGrantPort } from "./authorization-grants.js";
import type {
  AccountRecord,
  AdministrationPrincipal,
  DepartmentTreeNode,
  WorkforceAdministrationApplicationFacade,
  WorkforceAdministrationDependencies,
  WorkforcePersonContext,
} from "./types.js";

const READ_PERMISSION = Object.freeze({ action: "read", resource: "crm.workforce-access.console" });
const MANAGE_PERMISSION = Object.freeze({ action: "manage", resource: "crm.workforce-access.console" });

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

function safeCode(error: unknown): string | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  const value = Reflect.get(error, "code") as unknown;
  return typeof value === "string" ? value : undefined;
}

function mapError(error: unknown): WorkforceAdministrationFacadeError {
  if (error instanceof WorkforceAdministrationFacadeError) return error;
  const code = safeCode(error);
  if (["AUTHORIZATION_DENIED", "authorization_denied", "assignment_not_active", "employment_not_active"].includes(code ?? "")) return new WorkforceAdministrationFacadeError("forbidden");
  if (["entity_conflict", "entity_not_found", "idempotency_conflict", "login_identifier_occupied", "revision_conflict", "state_transition_invalid", "organization_hierarchy_cycle", "organization_path_invalid"].includes(code ?? "") || error instanceof Error && error.message === "idempotency_conflict") return new WorkforceAdministrationFacadeError("conflict");
  if (code === "input_invalid" || code === "effective_interval_invalid") return new WorkforceAdministrationFacadeError("invalid");
  return new WorkforceAdministrationFacadeError("unavailable");
}

function commandFingerprint(command: WorkforceAdministrationCommand): Readonly<Record<string, unknown>> {
  if (command.kind === "create_account") {
    return Object.freeze({
      departmentId: command.departmentId,
      kind: command.kind,
      legalName: command.legalName,
      ...(command.phone === undefined ? {} : { phone: command.phone }),
      positionId: command.positionId,
      username: command.username,
    });
  }
  if (command.kind === "reset_password") {
    return Object.freeze({ accountId: command.accountId, expectedRevision: command.expectedRevision, kind: command.kind });
  }
  return command;
}

function target(command: WorkforceAdministrationCommand, operationId: string): string {
  if (command.kind === "create_account") return deriveAdministrationOperationId(operationId, "account");
  if ("accountId" in command) return command.accountId;
  if ("departmentId" in command) return command.departmentId;
  return command.positionId;
}

async function audit(
  dependencies: WorkforceAdministrationDependencies,
  principal: AdministrationPrincipal,
  command: WorkforceAdministrationCommand,
  operationId: string,
  traceId: string,
): Promise<void> {
  await dependencies.audit.record({
    action: command.kind,
    actorId: principal.actor.actorId,
    operationId: deriveAdministrationOperationId(operationId, "audit"),
    result: "succeeded",
    targetId: target(command, operationId),
    traceId,
  });
}

async function context(
  dependencies: WorkforceAdministrationDependencies,
  account: AccountRecord,
  at: string,
): Promise<Readonly<WorkforcePersonContext> | undefined> {
  try { return await dependencies.organization.resolveWorkforcePersonContext(account.workforcePersonId, at); }
  catch (error) {
    if (["assignment_not_active", "employment_not_active", "entity_not_found"].includes(safeCode(error) ?? "")) return undefined;
    throw error;
  }
}

async function exactAssignment(dependencies: WorkforceAdministrationDependencies, account: AccountRecord, at: string) {
  const current = await context(dependencies, account, at);
  if (current?.assignments.length !== 1 || current.assignments[0] === undefined) throw new WorkforceAdministrationFacadeError("conflict");
  return Object.freeze({ assignment: current.assignments[0], context: current });
}

async function createAccount(
  dependencies: WorkforceAdministrationDependencies,
  principal: AdministrationPrincipal,
  command: Extract<WorkforceAdministrationCommand, { kind: "create_account" }>,
  operationId: string,
  traceId: string,
  at: string,
): Promise<void> {
  const passwordHash = await hashPassword(command.initialPassword);
  const accountId = deriveAdministrationOperationId(operationId, "account");
  const workforcePersonId = deriveAdministrationOperationId(operationId, "workforce-person");
  const employmentId = deriveAdministrationOperationId(operationId, "employment");
  const assignmentId = deriveAdministrationOperationId(operationId, "assignment");
  const grants = createFixedRoleAdministrationGrantPort(dependencies.roles, dependencies.clock);
  await dependencies.transactions.run(async () => {
    await dependencies.organization.createWorkforcePerson({ ...metadata(principal, deriveAdministrationOperationId(operationId, "create-person"), "workforce_administration:create_account", traceId), recordedAt: at, workforcePersonId });
    await dependencies.organization.createEmployment({ ...metadata(principal, deriveAdministrationOperationId(operationId, "create-employment"), "workforce_administration:create_account", traceId), effectiveFrom: at, employmentId, workforcePersonId });
    await dependencies.organization.createAssignment({ ...metadata(principal, deriveAdministrationOperationId(operationId, "create-assignment"), "workforce_administration:create_account", traceId), assignmentId, effectiveFrom: at, employmentId, organizationUnitId: command.departmentId, positionId: command.positionId, workforcePersonId });
    await dependencies.organizationDirectory.upsertPersonProfile({ ...metadata(principal, deriveAdministrationOperationId(operationId, "create-profile"), "workforce_administration:create_account", traceId), realName: command.legalName, updatedAt: at, workforcePersonId });
    await dependencies.accounts.createAccount({ ...metadata(principal, deriveAdministrationOperationId(operationId, "create-account"), "workforce_administration:create_account", traceId), accountId, createdAt: at, ...(command.phone === undefined ? {} : { phone: command.phone }), status: "active", username: command.username, workforcePersonId });
    await dependencies.credentials.create({ accountId, passwordHash, updatedAt: at });
    await grants.grantApplicationUser({ assignmentId, operationId: deriveAdministrationOperationId(operationId, "application-user-role"), workforcePersonId });
    await audit(dependencies, principal, command, operationId, traceId);
  });
}

async function updateAccount(
  dependencies: WorkforceAdministrationDependencies,
  principal: AdministrationPrincipal,
  command: Extract<WorkforceAdministrationCommand, { kind: "update_account" | "update_system_account" }>,
  operationId: string,
  traceId: string,
  at: string,
): Promise<void> {
  await dependencies.transactions.run(async () => {
    const account = await dependencies.accounts.getAccount(command.accountId);
    if (account.revision !== command.expectedRevision) throw new WorkforceAdministrationFacadeError("conflict");
    if (command.kind === "update_account") {
      const current = await exactAssignment(dependencies, account, at);
      if (current.assignment.organizationUnitId !== command.departmentId || current.assignment.positionId !== command.positionId) {
        const assignmentId = deriveAdministrationOperationId(operationId, "assignment");
        await dependencies.organization.closeAssignment({ ...metadata(principal, deriveAdministrationOperationId(operationId, "close-assignment"), "workforce_administration:update_account", traceId), effectiveTo: at, factId: current.assignment.assignmentId });
        await dependencies.organization.createAssignment({ ...metadata(principal, deriveAdministrationOperationId(operationId, "create-assignment"), "workforce_administration:update_account", traceId), assignmentId, effectiveFrom: at, employmentId: current.assignment.employmentId, organizationUnitId: command.departmentId, positionId: command.positionId, workforcePersonId: account.workforcePersonId });
        await createFixedRoleAdministrationGrantPort(dependencies.roles, dependencies.clock).moveApplicationUser({ assignmentId, closeAssignmentIds: [current.assignment.assignmentId], operationId: deriveAdministrationOperationId(operationId, "move-application-user-role"), workforcePersonId: account.workforcePersonId });
      }
    }
    const profile = await dependencies.organizationDirectory.getPersonProfile(account.workforcePersonId);
    await dependencies.organizationDirectory.upsertPersonProfile({ ...metadata(principal, deriveAdministrationOperationId(operationId, "profile"), `workforce_administration:${command.kind}`, traceId), expectedRevision: profile.revision, realName: command.legalName, updatedAt: at, workforcePersonId: account.workforcePersonId });
    await dependencies.accounts.updateLoginIdentifiers({ ...metadata(principal, deriveAdministrationOperationId(operationId, "identifiers"), `workforce_administration:${command.kind}`, traceId), accountId: account.accountId, expectedRevision: account.revision, ...(command.phone === undefined ? { phone: null } : { phone: command.phone }), updatedAt: at, username: command.username });
    await audit(dependencies, principal, command, operationId, traceId);
  });
}

async function accountCommand(
  dependencies: WorkforceAdministrationDependencies,
  principal: AdministrationPrincipal,
  command: WorkforceAdministrationCommand,
  operationId: string,
  traceId: string,
  at: string,
): Promise<boolean> {
  if (command.kind === "create_account") {
    await createAccount(dependencies, principal, command, operationId, traceId, at);
    return true;
  }
  if (!("accountId" in command)) return false;
  const account = await dependencies.accounts.getAccount(command.accountId);
  if (account.accountId === principal.accountId && command.kind === "deactivate_account") throw new WorkforceAdministrationFacadeError("forbidden");
  const grants = createFixedRoleAdministrationGrantPort(dependencies.roles, dependencies.clock);
  const targetIsSystemAdministrator = await grants.isSystemAdministrator(account.workforcePersonId);
  const actorIsSystemAdministrator = await grants.isSystemAdministrator(principal.subject.workforcePersonId);
  if (targetIsSystemAdministrator && !actorIsSystemAdministrator) throw new WorkforceAdministrationFacadeError("forbidden");
  const targetIsCrmAdministrator = await grants.hasCrmAdministrator(account.workforcePersonId);
  if (targetIsCrmAdministrator && !actorIsSystemAdministrator && account.accountId !== principal.accountId) throw new WorkforceAdministrationFacadeError("forbidden");

  if (command.kind === "update_account" || command.kind === "update_system_account") {
    if (command.kind === "update_account" && targetIsSystemAdministrator) throw new WorkforceAdministrationFacadeError("forbidden");
    if (command.kind === "update_system_account" && (!targetIsSystemAdministrator || !principal.reauthenticated || account.accountId !== principal.accountId)) throw new WorkforceAdministrationFacadeError("forbidden");
    await updateAccount(dependencies, principal, command, operationId, traceId, at);
    return true;
  }
  if (account.revision !== command.expectedRevision) throw new WorkforceAdministrationFacadeError("conflict");
  if (command.kind === "reset_password") {
    if (!principal.reauthenticated) throw new WorkforceAdministrationFacadeError("forbidden");
    const passwordHash = await hashPassword(command.password);
    await dependencies.transactions.run(async () => {
      await dependencies.credentials.replace({ accountId: account.accountId, expectedSecurityRevision: account.securityRevision, passwordHash, updatedAt: at });
      await audit(dependencies, principal, command, operationId, traceId);
    });
    return true;
  }
  if (command.kind === "release_phone") {
    await dependencies.accounts.releasePhone({ ...metadata(principal, deriveAdministrationOperationId(operationId, "release-phone"), "workforce_administration:release_phone", traceId), accountId: account.accountId, expectedRevision: command.expectedRevision, phone: command.phone, releasedAt: at });
    return true;
  }
  if (command.kind === "deactivate_account") {
    const current = await context(dependencies, account, at);
    await dependencies.transactions.run(async () => {
      if (targetIsSystemAdministrator) {
        await dependencies.transactions.lockSystemAdministratorSet();
        const activeAccounts = (await allAccounts(dependencies)).filter(({ status }) => status === "active");
        const administratorFlags = await Promise.all(activeAccounts.map(({ workforcePersonId }) => grants.isSystemAdministrator(workforcePersonId)));
        if (administratorFlags.filter(Boolean).length <= 1) throw new WorkforceAdministrationFacadeError("forbidden");
      }
      for (const assignment of current?.assignments ?? []) await dependencies.organization.closeAssignment({ ...metadata(principal, deriveAdministrationOperationId(operationId, `close-assignment:${assignment.assignmentId}`), "workforce_administration:deactivate_account", traceId), effectiveTo: at, factId: assignment.assignmentId });
      for (const employmentId of current?.employmentIds ?? []) await dependencies.organization.closeEmployment({ ...metadata(principal, deriveAdministrationOperationId(operationId, `close-employment:${employmentId}`), "workforce_administration:deactivate_account", traceId), effectiveTo: at, factId: employmentId });
      await dependencies.accounts.setStatus({ ...metadata(principal, deriveAdministrationOperationId(operationId, "disable-account"), "workforce_administration:deactivate_account", traceId), accountId: account.accountId, expectedRevision: account.revision, status: "disabled", updatedAt: at });
    });
    return true;
  }
  if (command.kind === "reactivate_account") {
    const employmentId = deriveAdministrationOperationId(operationId, "employment");
    const assignmentId = deriveAdministrationOperationId(operationId, "assignment");
    await dependencies.transactions.run(async () => {
      await dependencies.organization.createEmployment({ ...metadata(principal, deriveAdministrationOperationId(operationId, "create-employment"), "workforce_administration:reactivate_account", traceId), effectiveFrom: at, employmentId, workforcePersonId: account.workforcePersonId });
      await dependencies.organization.createAssignment({ ...metadata(principal, deriveAdministrationOperationId(operationId, "create-assignment"), "workforce_administration:reactivate_account", traceId), assignmentId, effectiveFrom: at, employmentId, organizationUnitId: command.departmentId, positionId: command.positionId, workforcePersonId: account.workforcePersonId });
      await dependencies.accounts.setStatus({ ...metadata(principal, deriveAdministrationOperationId(operationId, "activate-account"), "workforce_administration:reactivate_account", traceId), accountId: account.accountId, expectedRevision: account.revision, status: "active", updatedAt: at });
      await grants.grantApplicationUser({ assignmentId, operationId: deriveAdministrationOperationId(operationId, "application-user-role"), workforcePersonId: account.workforcePersonId });
    });
    return true;
  }
  if (!actorIsSystemAdministrator) throw new WorkforceAdministrationFacadeError("forbidden");
  const current = await exactAssignment(dependencies, account, at);
  await grants.setCrmAdministrator({ assignmentId: current.assignment.assignmentId, enabled: command.enabled, operationId: deriveAdministrationOperationId(operationId, "crm-administrator-role"), workforcePersonId: account.workforcePersonId });
  return true;
}

async function directoryCommand(
  dependencies: WorkforceAdministrationDependencies,
  principal: AdministrationPrincipal,
  command: WorkforceAdministrationCommand,
  operationId: string,
  traceId: string,
  at: string,
): Promise<void> {
  const meta = (purpose: string) => metadata(principal, deriveAdministrationOperationId(operationId, purpose), `workforce_administration:${command.kind}`, traceId);
  if (command.kind === "create_department") {
    await dependencies.transactions.run(async () => {
      await dependencies.organization.createOrganizationUnit({ ...meta("organization-unit"), effectiveFrom: at, organizationUnitId: command.departmentId, ...(command.parentDepartmentId === undefined ? {} : { parentOrganizationUnitId: command.parentDepartmentId }), placementId: deriveAdministrationOperationId(operationId, "placement") });
      await dependencies.organizationDirectory.createDepartment({ ...meta("department-directory"), name: command.name, organizationUnitId: command.departmentId, ...(command.parentDepartmentId === undefined ? {} : { parentOrganizationUnitId: command.parentDepartmentId }), updatedAt: at });
    });
  } else if (command.kind === "update_department") {
    await dependencies.organizationDirectory.updateDepartment({ ...meta("department-update"), expectedRevision: command.expectedRevision, name: command.name, organizationUnitId: command.departmentId, ...(command.parentDepartmentId === undefined ? {} : { parentOrganizationUnitId: command.parentDepartmentId }), updatedAt: at });
  } else if (command.kind === "deactivate_department" || command.kind === "reactivate_department") {
    await dependencies.organizationDirectory.setDepartmentActive({ ...meta("department-status"), active: command.kind === "reactivate_department", expectedRevision: command.expectedRevision, organizationUnitId: command.departmentId, updatedAt: at });
  } else if (command.kind === "create_position") {
    await dependencies.transactions.run(async () => {
      await dependencies.organization.createPosition({ ...meta("position-fact"), effectiveFrom: at, organizationUnitId: command.departmentId, positionId: command.positionId });
      await dependencies.organizationDirectory.createPosition({ ...meta("position-directory"), name: command.name, organizationUnitId: command.departmentId, positionId: command.positionId, updatedAt: at });
    });
  } else if (command.kind === "update_position") {
    await dependencies.organizationDirectory.updatePosition({ ...meta("position-update"), expectedRevision: command.expectedRevision, name: command.name, positionId: command.positionId, updatedAt: at });
  } else if (command.kind === "deactivate_position" || command.kind === "reactivate_position") {
    await dependencies.organizationDirectory.setPositionActive({ ...meta("position-status"), active: command.kind === "reactivate_position", expectedRevision: command.expectedRevision, positionId: command.positionId, updatedAt: at });
  } else {
    throw new WorkforceAdministrationFacadeError("invalid");
  }
}

function flatten(nodes: readonly DepartmentTreeNode[]): readonly DepartmentTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

async function accountView(
  dependencies: WorkforceAdministrationDependencies,
  account: AccountRecord,
  at: string,
  actorIsSystemAdministrator: boolean,
  systemAdministrator?: boolean,
): Promise<Readonly<WorkforceAccountView>> {
  const grants = createFixedRoleAdministrationGrantPort(dependencies.roles, dependencies.clock);
  const [profile, current, history, resolvedSystemAdministrator] = await Promise.all([
    dependencies.organizationDirectory.getPersonProfile(account.workforcePersonId),
    context(dependencies, account, at),
    dependencies.accounts.listIdentifierHistory(account.accountId),
    systemAdministrator === undefined ? grants.isSystemAdministrator(account.workforcePersonId) : Promise.resolve(systemAdministrator),
  ]);
  const assignment = current?.assignments.length === 1 ? current.assignments[0] : undefined;
  const crmAdministrator = assignment === undefined ? false : await grants.hasCrmAdministrator(account.workforcePersonId, assignment.assignmentId);
  const departments = flatten(await dependencies.organizationDirectory.listDepartmentTree({ includeInactive: true }));
  const department = assignment === undefined ? undefined : departments.find(({ organizationUnitId }) => organizationUnitId === assignment.organizationUnitId);
  const position = assignment === undefined ? undefined : (await dependencies.organizationDirectory.listPositions(assignment.organizationUnitId, { includeInactive: true })).find(({ positionId }) => positionId === assignment.positionId);
  const allowedActions = resolvedSystemAdministrator
    ? ["edit"]
    : account.status === "active"
      ? ["deactivate", "edit", ...(actorIsSystemAdministrator ? [crmAdministrator ? "revoke_crm_administrator" : "grant_crm_administrator"] as const : []), "release_phone", "reset_password", "transfer"]
      : ["reactivate", "release_phone", "reset_password"];
  return Object.freeze({
    accountId: account.accountId,
    allowedActions: Object.freeze(allowedActions),
    crmAdministrator,
    ...(assignment === undefined ? {} : { departmentId: assignment.organizationUnitId, positionId: assignment.positionId }),
    ...(department === undefined ? {} : { departmentName: department.name }),
    legalName: profile.realName,
    ...(account.phone === undefined ? {} : { phone: account.phone }),
    ...(position === undefined ? {} : { positionName: position.name }),
    releasablePhones: Object.freeze(history.filter((item) => item.kind === "phone" && item.releasedAt === undefined && item.value !== account.phone).map(({ value }) => value)),
    revision: account.revision,
    status: account.status,
    username: account.username,
  });
}

function matchesAccount(view: WorkforceAccountView, query: WorkforceAccountQuery): boolean {
  return (query.status === undefined || view.status === query.status) &&
    (query.username === undefined || view.username.toLowerCase().includes(query.username.toLowerCase())) &&
    (query.legalName === undefined || view.legalName.includes(query.legalName)) &&
    (query.phone === undefined || view.phone?.includes(query.phone) === true) &&
    (query.departmentId === undefined || view.departmentId === query.departmentId) &&
    (query.positionId === undefined || view.positionId === query.positionId);
}

async function allAccounts(dependencies: WorkforceAdministrationDependencies): Promise<readonly AccountRecord[]> {
  const accounts: AccountRecord[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await dependencies.accounts.listAccounts({ ...(cursor === undefined ? {} : { cursor }), limit: 200 });
    accounts.push(...page.items);
    cursor = page.nextCursor;
    if (cursor !== undefined && (cursors.has(cursor) || accounts.length > 10_000)) throw new WorkforceAdministrationFacadeError("unavailable");
    if (cursor !== undefined) cursors.add(cursor);
  } while (cursor !== undefined);
  return Object.freeze(accounts);
}

export function createWorkforceAdministrationFacade(dependencies: WorkforceAdministrationDependencies): Readonly<WorkforceAdministrationApplicationFacade> {
  return Object.freeze({
    async execute(input: Parameters<WorkforceAdministrationApplicationFacade["execute"]>[0]) {
      try {
        const principal = await dependencies.principals.resolve({ credential: input.credential, traceId: input.traceId });
        await dependencies.authorization.requireAllowed(principal.subject, MANAGE_PERMISSION);
        const at = timestamp(dependencies);
        const fingerprint = digest({ actor: principal.actor, command: commandFingerprint(input.command) });
        const completed = await dependencies.operations.execute({ fingerprint, operationId: input.operationId, traceId: input.traceId }, async () => {
          const auditedInTransaction = await accountCommand(dependencies, principal, input.command, input.operationId, input.traceId, at);
          if (!auditedInTransaction) await directoryCommand(dependencies, principal, input.command, input.operationId, input.traceId, at);
          if (!(input.command.kind === "create_account" || input.command.kind === "reset_password")) await audit(dependencies, principal, input.command, input.operationId, input.traceId);
          return Object.freeze({});
        });
        return Object.freeze({ replayed: completed.replayed });
      } catch (error) { throw mapError(error); }
    },
    async listAccounts(input: Parameters<WorkforceAdministrationApplicationFacade["listAccounts"]>[0]): Promise<Readonly<WorkforceAccountPage>> {
      try {
        const principal = await dependencies.principals.resolve({ credential: input.credential, traceId: input.traceId });
        await dependencies.authorization.requireAllowed(principal.subject, READ_PERMISSION);
        const at = timestamp(dependencies);
        const grants = createFixedRoleAdministrationGrantPort(dependencies.roles, dependencies.clock);
        const actorIsSystemAdministrator = await grants.isSystemAdministrator(principal.subject.workforcePersonId);
        const accounts = await allAccounts(dependencies);
        const systemFlags = await Promise.all(accounts.map(({ workforcePersonId }) => grants.isSystemAdministrator(workforcePersonId)));
        const ordinaryAccounts = accounts.filter((_account, index) => systemFlags[index] === false);
        const views = await Promise.all(ordinaryAccounts.map((account) => accountView(dependencies, account, at, actorIsSystemAdministrator, false)));
        const filtered = views.filter((view) => matchesAccount(view, input.query));
        const offset = (input.query.page - 1) * input.query.pageSize;
        return Object.freeze({ items: Object.freeze(filtered.slice(offset, offset + input.query.pageSize)), page: input.query.page, pageSize: input.query.pageSize, total: filtered.length });
      } catch (error) { throw mapError(error); }
    },
    async load(input: Parameters<WorkforceAdministrationApplicationFacade["load"]>[0]): Promise<Readonly<WorkforceAdministrationSnapshot>> {
      try {
        const principal = await dependencies.principals.resolve({ credential: input.credential, traceId: input.traceId });
        await dependencies.authorization.requireAllowed(principal.subject, READ_PERMISSION);
        const at = timestamp(dependencies);
        const grants = createFixedRoleAdministrationGrantPort(dependencies.roles, dependencies.clock);
        const actorIsSystemAdministrator = await grants.isSystemAdministrator(principal.subject.workforcePersonId);
        const accountRecords = await allAccounts(dependencies);
        const systemFlags = await Promise.all(accountRecords.map(({ workforcePersonId }) => grants.isSystemAdministrator(workforcePersonId)));
        const ordinaryRecords = accountRecords.filter((_account, index) => systemFlags[index] === false);
        const accounts = await Promise.all(ordinaryRecords.map((account) => accountView(dependencies, account, at, actorIsSystemAdministrator, false)));
        const ownSystemRecord = actorIsSystemAdministrator
          ? accountRecords.find((account, index) => account.accountId === principal.accountId && systemFlags[index] === true)
          : undefined;
        const systemAccount = ownSystemRecord === undefined ? undefined : await accountView(dependencies, ownSystemRecord, at, true, true);
        const departments = flatten(await dependencies.organizationDirectory.listDepartmentTree({ includeInactive: true }));
        const positions = (await Promise.all(departments.map(({ organizationUnitId }) => dependencies.organizationDirectory.listPositions(organizationUnitId, { includeInactive: true })))).flat();
        return Object.freeze({
          accounts: Object.freeze(accounts),
          departments: Object.freeze(departments.map((item) => ({ allowedActions: Object.freeze([item.active ? "deactivate" : "reactivate", "edit"]), departmentId: item.organizationUnitId, name: item.name, ...(item.parentOrganizationUnitId === undefined ? {} : { parentDepartmentId: item.parentOrganizationUnitId }), revision: item.revision, status: item.active ? "active" as const : "disabled" as const }))),
          positions: Object.freeze(positions.map((item) => ({ allowedActions: Object.freeze([item.active ? "deactivate" : "reactivate", "edit"]), departmentId: item.organizationUnitId, name: item.name, positionId: item.positionId, revision: item.revision, status: item.active ? "active" as const : "disabled" as const }))),
          ...(systemAccount === undefined ? {} : { systemAccount }),
        });
      } catch (error) { throw mapError(error); }
    },
  });
}
