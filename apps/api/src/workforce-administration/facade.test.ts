/* eslint-disable @typescript-eslint/unbound-method -- Every asserted port method is a fixture-owned vi.fn. */
import { describe, expect, it, vi } from "vitest";

import { WorkforceAdministrationFacadeError } from "../platform-http/workforce-administration-http.js";
import { createWorkforceAdministrationFacade, deriveAdministrationOperationId } from "./facade.js";
import type { AccountDirectoryPort, AccountRecord, WorkforceAdministrationDependencies } from "./types.js";

const ids = Object.freeze({
  account: "20000000-0000-4000-8000-000000000001",
  actorPerson: "20000000-0000-4000-8000-000000000002",
  assignment: "20000000-0000-4000-8000-000000000003",
  department: "20000000-0000-4000-8000-000000000004",
  employment: "20000000-0000-4000-8000-000000000005",
  operation: "20000000-0000-4000-8000-000000000006",
  person: "20000000-0000-4000-8000-000000000007",
  position: "20000000-0000-4000-8000-000000000008",
});
const traceId = "1234567890abcdef1234567890abcdef";
const actor = Object.freeze({ actorId: "subject.crm-admin", actorType: "authenticated_subject" as const });
const subject = Object.freeze({ activeAssignmentIds: Object.freeze([ids.assignment]), selectedAssignmentId: ids.assignment, workforcePersonId: ids.actorPerson });
const account: AccountRecord = Object.freeze({ accountId: ids.account, keycloakUserId: "30000000-0000-4000-8000-000000000001", phone: "+8613800000000", revision: 2, status: "active", username: "employee.one", workforcePersonId: ids.person });
const context = Object.freeze({ assignments: Object.freeze([{ assignmentId: ids.assignment, employmentId: ids.employment, organizationUnitId: ids.department, positionId: ids.position }]), employmentIds: Object.freeze([ids.employment]), resolvedAt: "2026-08-02T12:00:00.000Z", workforcePersonId: ids.person });

function fixture() {
  const dependencies: WorkforceAdministrationDependencies = {
    accounts: {
      beginIdentitySync: vi.fn((command: Parameters<AccountDirectoryPort["beginIdentitySync"]>[0]) => Promise.resolve({ accountId: command.accountId, action: command.action, operationId: command.operationId, requestedAt: command.requestedAt, ...(command.retryOfOperationId === undefined ? {} : { retryOfOperationId: command.retryOfOperationId }), status: "pending" as const, traceId: command.traceId })),
      createAccount: vi.fn(() => Promise.resolve<AccountRecord>({ ...account, revision: 0, status: "provisioning" })),
      getAccount: vi.fn(() => Promise.resolve(account)),
      getIdentitySyncOperation: vi.fn(() => Promise.reject(new Error("fixture_identity_sync_missing"))),
      linkKeycloakUser: vi.fn(() => Promise.resolve<AccountRecord>({ ...account, revision: 1, status: "provisioning" })),
      listAccounts: vi.fn(() => Promise.resolve({ items: [account] })),
      listIdentifierHistory: vi.fn(() => Promise.resolve([
        { accountId: ids.account, kind: "phone" as const, normalizedValue: "+8613700000000", value: "+8613700000000" },
        { accountId: ids.account, kind: "phone" as const, normalizedValue: "+8613800000000", value: "+8613800000000" },
        { accountId: ids.account, kind: "phone" as const, normalizedValue: "+8613600000000", releasedAt: "2026-08-01T12:00:00.000Z", value: "+8613600000000" },
      ])),
      releasePhone: vi.fn(() => Promise.resolve()),
      setStatus: vi.fn(() => Promise.resolve({ ...account, revision: account.revision + 1 })),
      updateLoginIdentifiers: vi.fn(() => Promise.resolve({ ...account, revision: account.revision + 1 })),
    },
    audit: { record: vi.fn(() => Promise.resolve()) },
    authorization: { requireAllowed: vi.fn(() => Promise.resolve({})) },
    clock: () => new Date("2026-08-02T12:00:00.000Z"),
    credentialCeremonies: { complete: vi.fn(() => Promise.resolve()), start: vi.fn(() => Promise.resolve({ redirectUrl: "/auth/pc/credential-ceremony" })) },
    crmAdministratorDepartmentId: ids.department,
    grants: {
      hasGrant: vi.fn(() => Promise.resolve(false)),
      isSuperAdministrator: vi.fn((workforcePersonId: string) => Promise.resolve(workforcePersonId === ids.actorPerson)),
      setGrant: vi.fn(() => Promise.resolve()),
    },
    identity: {
      createDisabledAccount: vi.fn(() => Promise.resolve({ keycloakUserId: "30000000-0000-4000-8000-000000000001" })),
      disableAccount: vi.fn(() => Promise.resolve()),
      revokeSessions: vi.fn(() => Promise.resolve()),
      synchronizeLoginIdentifiers: vi.fn(() => Promise.resolve()),
    },
    operations: { async execute<T>(_input: Readonly<{ fingerprint: string; operationId: string; traceId: string }>, work: () => Promise<Readonly<T>>) { return { replayed: false, value: await work() }; } },
    organization: {
      closeAssignment: vi.fn(() => Promise.resolve()), closeEmployment: vi.fn(() => Promise.resolve()),
      createAssignment: vi.fn(() => Promise.resolve()), createEmployment: vi.fn(() => Promise.resolve()),
      createOrganizationUnit: vi.fn(() => Promise.resolve()), createPosition: vi.fn(() => Promise.resolve()),
      createWorkforcePerson: vi.fn(() => Promise.resolve()), resolveWorkforcePersonContext: vi.fn(() => Promise.resolve(context)),
    },
    organizationDirectory: {
      createDepartment: vi.fn(() => Promise.resolve({ active: true, name: "AI应用部", normalizedName: "ai应用部", organizationUnitId: ids.department, revision: 0, rootLocked: false, updatedAt: "2026-08-02T12:00:00.000Z" })),
      createPosition: vi.fn(() => Promise.resolve({ active: true, name: "系统管理岗", normalizedName: "系统管理岗", organizationUnitId: ids.department, positionId: ids.position, revision: 0, updatedAt: "2026-08-02T12:00:00.000Z" })),
      getPersonProfile: vi.fn(() => Promise.resolve({ realName: "测试员工", revision: 1, updatedAt: "2026-08-02T12:00:00.000Z", workforcePersonId: ids.person })),
      listDepartmentTree: vi.fn(() => Promise.resolve([{ active: true, children: [], name: "AI应用部", normalizedName: "ai应用部", organizationUnitId: ids.department, revision: 1, rootLocked: false, updatedAt: "2026-08-02T12:00:00.000Z" }])),
      listPositions: vi.fn(() => Promise.resolve([{ active: true, name: "系统管理岗", normalizedName: "系统管理岗", organizationUnitId: ids.department, positionId: ids.position, revision: 1, updatedAt: "2026-08-02T12:00:00.000Z" }])),
      setDepartmentActive: vi.fn(() => Promise.resolve({ active: false, name: "AI应用部", normalizedName: "ai应用部", organizationUnitId: ids.department, revision: 2, rootLocked: false, updatedAt: "2026-08-02T12:00:00.000Z" })),
      setPositionActive: vi.fn(() => Promise.resolve({ active: false, name: "系统管理岗", normalizedName: "系统管理岗", organizationUnitId: ids.department, positionId: ids.position, revision: 2, updatedAt: "2026-08-02T12:00:00.000Z" })),
      updateDepartment: vi.fn(() => Promise.resolve({ active: true, name: "AI应用部", normalizedName: "ai应用部", organizationUnitId: ids.department, revision: 2, rootLocked: false, updatedAt: "2026-08-02T12:00:00.000Z" })),
      updatePosition: vi.fn(() => Promise.resolve({ active: true, name: "系统管理岗", normalizedName: "系统管理岗", organizationUnitId: ids.department, positionId: ids.position, revision: 2, updatedAt: "2026-08-02T12:00:00.000Z" })),
      upsertPersonProfile: vi.fn(() => Promise.resolve({ realName: "测试员工", revision: 1, updatedAt: "2026-08-02T12:00:00.000Z", workforcePersonId: ids.person })),
    },
    principals: { resolve: vi.fn(() => Promise.resolve({ actor, identitySubjectId: "keycloak-operator-subject", subject })) },
    recovery: { restore: vi.fn(() => Promise.resolve()) },
    transactions: { run: (work) => work() },
  };
  return { dependencies, facade: createWorkforceAdministrationFacade(dependencies) };
}

const input = <Command>(command: Command) => Object.freeze({ command, credential: "c".repeat(43), operationId: ids.operation, traceId });

describe("workforce administration application facade", () => {
  it("creates one workforce account with stable derived IDs and no password boundary", async () => {
    const { dependencies, facade } = fixture();
    const command = { departmentId: ids.department, kind: "create_account" as const, legalName: "测试员工", phone: "+8613800000000", positionId: ids.position, username: "employee.one" };
    await expect(facade.execute(input(command))).resolves.toEqual({ credentialRedirectUrl: "/auth/pc/credential-ceremony", replayed: false });
    expect(dependencies.authorization.requireAllowed).toHaveBeenCalledWith(subject, { action: "manage", resource: "platform.workforce-access.console" });
    expect(dependencies.organization.createWorkforcePerson).toHaveBeenCalledWith(expect.objectContaining({ operationId: deriveAdministrationOperationId(ids.operation, "create-person"), workforcePersonId: deriveAdministrationOperationId(ids.operation, "workforce-person") }));
    expect(JSON.stringify(vi.mocked(dependencies.accounts.createAccount).mock.calls)).not.toMatch(/password|token/iu);
    expect(dependencies.identity.createDisabledAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: deriveAdministrationOperationId(ids.operation, "account") }));
    expect(dependencies.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "create_account", operationId: deriveAdministrationOperationId(ids.operation, "audit"), targetId: deriveAdministrationOperationId(ids.operation, "account") }));
  });

  it("updates identifiers/profile and submits one durable identity-sync operation that also revokes sessions", async () => {
    const { dependencies, facade } = fixture();
    const newDepartment = "20000000-0000-4000-8000-000000000009";
    const newPosition = "20000000-0000-4000-8000-000000000010";
    await facade.execute(input({ accountId: ids.account, departmentId: newDepartment, expectedRevision: 2, kind: "update_account" as const, legalName: "新姓名", phone: "+8613900000000", positionId: newPosition, username: "employee.two" }));
    expect(dependencies.organization.closeAssignment).toHaveBeenCalledWith(expect.objectContaining({ factId: ids.assignment }));
    expect(dependencies.organization.createAssignment).toHaveBeenCalledWith(expect.objectContaining({ organizationUnitId: newDepartment, positionId: newPosition }));
    expect(dependencies.identity.synchronizeLoginIdentifiers).toHaveBeenCalledWith(expect.objectContaining({ username: "employee.two" }));
    expect(dependencies.identity.revokeSessions).not.toHaveBeenCalled();
    expect(dependencies.accounts.beginIdentitySync).toHaveBeenCalledOnce();
  });

  it("retries only the latest failed identity synchronization with a new durable operation", async () => {
    const { dependencies, facade } = fixture();
    const failedOperationId = "20000000-0000-4000-8000-000000000012";
    const failed = Object.freeze({ accountId: ids.account, action: "synchronize_login_identifiers" as const, completedAt: "2026-08-02T11:59:00.000Z", errorCode: "keycloak_administration_unavailable" as const, operationId: failedOperationId, requestedAt: "2026-08-02T11:58:00.000Z", status: "failed" as const, traceId });
    vi.mocked(dependencies.accounts.getAccount).mockResolvedValue({ ...account, latestIdentitySync: failed });
    vi.mocked(dependencies.accounts.getIdentitySyncOperation).mockResolvedValue(failed);

    await expect(facade.execute(input({ accountId: ids.account, expectedRevision: account.revision, failedOperationId, kind: "retry_identity_sync" as const }))).resolves.toEqual({ replayed: false });

    const retryOperationId = deriveAdministrationOperationId(ids.operation, "identity-retry");
    expect(dependencies.accounts.beginIdentitySync).toHaveBeenCalledWith(expect.objectContaining({ operationId: retryOperationId, retryOfOperationId: failedOperationId }));
    expect(dependencies.identity.synchronizeLoginIdentifiers).toHaveBeenCalledWith(expect.objectContaining({ operationId: retryOperationId, retryOfOperationId: failedOperationId, username: account.username }));
  });

  it("updates only the reauthenticated super administrator's own login identifiers through one durable synchronization", async () => {
    const { dependencies, facade } = fixture();
    const systemAccount: AccountRecord = { ...account, accountId: "20000000-0000-4000-8000-000000000011", workforcePersonId: ids.actorPerson };
    vi.mocked(dependencies.accounts.getAccount).mockResolvedValue(systemAccount);
    vi.mocked(dependencies.principals.resolve).mockResolvedValue({ actor, identitySubjectId: "keycloak-operator-subject", reauthenticated: true, subject });

    await expect(facade.execute(input({ accountId: systemAccount.accountId, expectedRevision: 2, kind: "update_system_account" as const, phone: "+8613900000000", username: "system.admin.two" }))).resolves.toEqual({ replayed: false });

    expect(dependencies.accounts.updateLoginIdentifiers).toHaveBeenCalledWith(expect.objectContaining({ accountId: systemAccount.accountId, expectedRevision: 2, username: "system.admin.two" }));
    expect(dependencies.identity.synchronizeLoginIdentifiers).toHaveBeenCalledWith(expect.objectContaining({ accountId: systemAccount.accountId, username: "system.admin.two" }));
    expect(dependencies.identity.revokeSessions).not.toHaveBeenCalled();
    expect(dependencies.accounts.beginIdentitySync).toHaveBeenCalledOnce();
    expect(dependencies.organization.resolveWorkforcePersonContext).not.toHaveBeenCalled();
    expect(dependencies.organizationDirectory.upsertPersonProfile).not.toHaveBeenCalled();
    expect(dependencies.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "update_system_account", targetId: systemAccount.accountId }));
    expect(JSON.stringify(vi.mocked(dependencies.audit.record).mock.calls)).not.toMatch(/system\.admin\.two|8613900000000/u);
  });

  it("rejects system-account identifier changes without fresh reauthentication or for another target", async () => {
    const { dependencies, facade } = fixture();
    const systemAccount: AccountRecord = { ...account, accountId: "20000000-0000-4000-8000-000000000011", workforcePersonId: ids.actorPerson };
    vi.mocked(dependencies.accounts.getAccount).mockResolvedValue(systemAccount);
    const command = { accountId: systemAccount.accountId, expectedRevision: 2, kind: "update_system_account" as const, username: "system.admin.two" };
    await expect(facade.execute(input(command))).rejects.toEqual(new WorkforceAdministrationFacadeError("forbidden"));
    vi.mocked(dependencies.principals.resolve).mockResolvedValue({ actor, identitySubjectId: "keycloak-operator-subject", reauthenticated: true, subject });
    vi.mocked(dependencies.accounts.getAccount).mockResolvedValue({ ...systemAccount, workforcePersonId: ids.person });
    await expect(facade.execute(input(command))).rejects.toEqual(new WorkforceAdministrationFacadeError("forbidden"));
    expect(dependencies.accounts.updateLoginIdentifiers).not.toHaveBeenCalled();
  });

  it("requires CRM grant revocation before transfer or deactivation", async () => {
    const { dependencies, facade } = fixture();
    vi.mocked(dependencies.grants.hasGrant).mockResolvedValue(true);
    await expect(facade.execute(input({ accountId: ids.account, departmentId: "20000000-0000-4000-8000-000000000009", expectedRevision: 2, kind: "update_account" as const, legalName: "测试员工", positionId: ids.position, username: "employee.one" }))).rejects.toEqual(new WorkforceAdministrationFacadeError("conflict"));
    await expect(facade.execute(input({ accountId: ids.account, expectedRevision: 2, kind: "deactivate_account" as const }))).rejects.toEqual(new WorkforceAdministrationFacadeError("conflict"));
  });

  it("closes access locally before disabling identity and restores through an explicit recovery port", async () => {
    const { dependencies, facade } = fixture();
    await facade.execute(input({ accountId: ids.account, expectedRevision: 2, kind: "deactivate_account" as const }));
    expect(dependencies.accounts.setStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "disabled" }));
    expect(dependencies.organization.closeEmployment).toHaveBeenCalledWith(expect.objectContaining({ factId: ids.employment }));
    expect(dependencies.identity.disableAccount).toHaveBeenCalled();

    await facade.execute(input({ accountId: ids.account, departmentId: ids.department, expectedRevision: 2, kind: "reactivate_account" as const, positionId: ids.position }));
    expect(dependencies.recovery.restore).toHaveBeenCalledWith(expect.objectContaining({ departmentId: ids.department, positionId: ids.position, workforcePersonId: ids.person }));
    expect(dependencies.credentialCeremonies.start).toHaveBeenCalledWith(expect.objectContaining({ kind: "recover" }));
  });

  it("starts reset ceremony without accepting or producing a password", async () => {
    const { dependencies, facade } = fixture();
    await expect(facade.execute(input({ accountId: ids.account, expectedRevision: 2, kind: "reset_password" as const }))).resolves.toMatchObject({ credentialRedirectUrl: "/auth/pc/credential-ceremony" });
    expect(dependencies.identity.revokeSessions).toHaveBeenCalled();
    expect(dependencies.credentialCeremonies.start).toHaveBeenCalledWith(expect.objectContaining({ kind: "reset" }));
  });

  it("releases only an unreleased historical phone after revision and target authorization checks", async () => {
    const { dependencies, facade } = fixture();
    await expect(facade.execute(input({ accountId: ids.account, expectedRevision: 2, kind: "release_phone" as const, phone: "+8613700000000" }))).resolves.toEqual({ replayed: false });
    expect(dependencies.accounts.releasePhone).toHaveBeenCalledWith(expect.objectContaining({
      accountId: ids.account,
      operationId: deriveAdministrationOperationId(ids.operation, "release-phone"),
      phone: "+8613700000000",
    }));
    expect(dependencies.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "release_phone", targetId: ids.account }));
    expect(JSON.stringify(vi.mocked(dependencies.audit.record).mock.calls)).not.toContain("+8613700000000");

    await expect(facade.execute(input({ accountId: ids.account, expectedRevision: 1, kind: "release_phone" as const, phone: "+8613700000000" }))).rejects.toEqual(new WorkforceAdministrationFacadeError("conflict"));
    await expect(facade.execute(input({ accountId: ids.account, expectedRevision: 2, kind: "release_phone" as const, phone: "+8613800000000" }))).rejects.toEqual(new WorkforceAdministrationFacadeError("conflict"));
  });

  it("does not let a CRM administrator release identifiers owned by another protected administrator", async () => {
    const { dependencies, facade } = fixture();
    vi.mocked(dependencies.grants.isSuperAdministrator).mockResolvedValue(false);
    vi.mocked(dependencies.grants.hasGrant).mockResolvedValue(true);
    await expect(facade.execute(input({ accountId: ids.account, expectedRevision: 2, kind: "release_phone" as const, phone: "+8613700000000" }))).rejects.toEqual(new WorkforceAdministrationFacadeError("forbidden"));
    expect(dependencies.accounts.releasePhone).not.toHaveBeenCalled();
  });

  it("allows only a super administrator to change an eligible Assignment-bound CRM grant", async () => {
    const { dependencies, facade } = fixture();
    await facade.execute(input({ accountId: ids.account, enabled: true, expectedRevision: 2, kind: "set_crm_administrator" as const }));
    expect(dependencies.grants.setGrant).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: ids.assignment, workforcePersonId: ids.person }));
    vi.mocked(dependencies.grants.isSuperAdministrator).mockResolvedValue(false);
    await expect(facade.execute(input({ accountId: ids.account, enabled: false, expectedRevision: 2, kind: "set_crm_administrator" as const }))).rejects.toEqual(new WorkforceAdministrationFacadeError("forbidden"));
  });

  it("creates and manages department and position facts through public services", async () => {
    const { dependencies, facade } = fixture();
    await facade.execute(input({ departmentId: ids.department, kind: "create_department" as const, name: "AI应用部" }));
    await facade.execute(input({ departmentId: ids.department, kind: "create_position" as const, name: "系统管理岗", positionId: ids.position }));
    await facade.execute(input({ departmentId: ids.department, expectedRevision: 1, kind: "deactivate_department" as const }));
    await facade.execute(input({ expectedRevision: 1, kind: "update_position" as const, name: "系统管理岗", positionId: ids.position }));
    expect(dependencies.organization.createOrganizationUnit).toHaveBeenCalled();
    expect(dependencies.organizationDirectory.createDepartment).toHaveBeenCalled();
    expect(dependencies.organization.createPosition).toHaveBeenCalled();
    expect(dependencies.organizationDirectory.createPosition).toHaveBeenCalled();
    expect(dependencies.organizationDirectory.setDepartmentActive).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(dependencies.organizationDirectory.updatePosition).toHaveBeenCalled();
  });

  it("returns joined views and exposes the system account only to a super administrator", async () => {
    const { dependencies, facade } = fixture();
    const system = { ...account, accountId: "20000000-0000-4000-8000-000000000011", workforcePersonId: ids.actorPerson };
    vi.mocked(dependencies.accounts.listAccounts).mockResolvedValue({ items: [account, system] });
    const result = await facade.load({ credential: "c".repeat(43), traceId });
    expect(result.accounts[0]).toMatchObject({ accountId: ids.account, departmentName: "AI应用部", positionName: "系统管理岗", releasablePhones: ["+8613700000000"] });
    expect(result.accounts[0]?.allowedActions).toEqual(expect.arrayContaining(["edit", "deactivate", "release_phone"]));
    expect(result.departments[0]?.departmentId).toBe(ids.department);
    expect(result.positions[0]?.positionId).toBe(ids.position);
    expect(result.systemAccount).toMatchObject({ accountId: system.accountId, allowedActions: [] });
    expect(dependencies.authorization.requireAllowed).toHaveBeenCalledWith(subject, { action: "read", resource: "platform.workforce-access.console" });
  });

  it("returns an authorized server page with combined account and organization filters while excluding system accounts", async () => {
    const { dependencies, facade } = fixture();
    const second = { ...account, accountId: "20000000-0000-4000-8000-000000000012", phone: "+8613900000000", username: "employee.two" };
    const system = { ...account, accountId: "20000000-0000-4000-8000-000000000011", workforcePersonId: ids.actorPerson };
    vi.mocked(dependencies.accounts.listAccounts).mockResolvedValue({ items: [account, second, system] });

    await expect(facade.listAccounts({
      credential: "c".repeat(43),
      query: { departmentId: ids.department, legalName: "测试", page: 1, pageSize: 1, phone: "+8613", positionId: ids.position, status: "active", username: "EMPLOYEE" },
      traceId,
    })).resolves.toMatchObject({ items: [{ accountId: ids.account, username: "employee.one" }], page: 1, pageSize: 1, total: 2 });
    expect(dependencies.authorization.requireAllowed).toHaveBeenCalledWith(subject, { action: "read", resource: "platform.workforce-access.console" });
  });

  it("exposes system-account edit only while the super administrator has a fresh reauthentication marker", async () => {
    const { dependencies, facade } = fixture();
    const system = { ...account, accountId: "20000000-0000-4000-8000-000000000011", workforcePersonId: ids.actorPerson };
    vi.mocked(dependencies.accounts.listAccounts).mockResolvedValue({ items: [system] });
    vi.mocked(dependencies.principals.resolve).mockResolvedValue({ actor, identitySubjectId: "keycloak-operator-subject", reauthenticated: true, subject });
    const result = await facade.load({ credential: "c".repeat(43), traceId });
    expect(result.systemAccount?.allowedActions).toEqual(["edit"]);
  });

  it("maps authorization, conflicts, and opaque dependency failures to stable facade errors", async () => {
    const denied = fixture();
    vi.mocked(denied.dependencies.authorization.requireAllowed).mockRejectedValue(Object.assign(new Error("private"), { code: "AUTHORIZATION_DENIED" }));
    await expect(denied.facade.load({ credential: "c".repeat(43), traceId })).rejects.toEqual(new WorkforceAdministrationFacadeError("forbidden"));
    const conflict = fixture();
    vi.mocked(conflict.dependencies.accounts.getAccount).mockRejectedValue(Object.assign(new Error("private"), { code: "revision_conflict" }));
    await expect(conflict.facade.execute(input({ accountId: ids.account, expectedRevision: 2, kind: "reset_password" as const }))).rejects.toEqual(new WorkforceAdministrationFacadeError("conflict"));
    const unavailable = fixture();
    vi.mocked(unavailable.dependencies.principals.resolve).mockRejectedValue(new Error("token and database details"));
    await expect(unavailable.facade.load({ credential: "c".repeat(43), traceId })).rejects.toEqual(new WorkforceAdministrationFacadeError("unavailable"));
  });

  it("returns the durable operation replay flag without repeating work", async () => {
    const { dependencies, facade } = fixture();
    dependencies.operations.execute = <T>(metadata: Readonly<{ fingerprint: string; operationId: string; traceId: string }>, work: () => Promise<Readonly<T>>) => {
      void metadata; void work;
      return Promise.resolve({ replayed: true, value: Object.freeze({}) as Readonly<T> });
    };
    await expect(facade.execute(input({ accountId: ids.account, expectedRevision: 2, kind: "reset_password" as const }))).resolves.toEqual({ replayed: true });
    expect(dependencies.credentialCeremonies.start).not.toHaveBeenCalled();
  });
});
