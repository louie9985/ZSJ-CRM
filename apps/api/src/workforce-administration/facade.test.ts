/* eslint-disable @typescript-eslint/unbound-method -- Asserted methods are fixture-owned spies. */
import { describe, expect, it, vi } from "vitest";

import { WorkforceAdministrationFacadeError } from "../platform-http/workforce-administration-http.js";
import { createWorkforceAdministrationFacade } from "./facade.js";
import type { AccountRecord, WorkforceAdministrationDependencies } from "./types.js";

const ids = Object.freeze({
  actorAccount: "20000000-0000-4000-8000-000000000001",
  actorPerson: "20000000-0000-4000-8000-000000000002",
  assignment: "20000000-0000-4000-8000-000000000003",
  department: "20000000-0000-4000-8000-000000000004",
  employment: "20000000-0000-4000-8000-000000000005",
  operation: "20000000-0000-4000-8000-000000000006",
  ordinaryAccount: "20000000-0000-4000-8000-000000000007",
  ordinaryPerson: "20000000-0000-4000-8000-000000000008",
  otherSystemAccount: "20000000-0000-4000-8000-000000000009",
  otherSystemPerson: "20000000-0000-4000-8000-00000000000a",
  position: "20000000-0000-4000-8000-00000000000b",
});
const now = "2026-08-04T00:00:00.000Z";
const traceId = "1234567890abcdef1234567890abcdef";

function account(accountId: string, workforcePersonId: string, username: string): AccountRecord {
  return Object.freeze({ accountId, createdAt: now, revision: 2, securityRevision: 1, status: "active", updatedAt: now, username, usernameNormalized: username, workforcePersonId });
}

function fixture() {
  const actorAccount = account(ids.actorAccount, ids.actorPerson, "system.admin");
  const ordinaryAccount = account(ids.ordinaryAccount, ids.ordinaryPerson, "employee.one");
  const otherSystemAccount = account(ids.otherSystemAccount, ids.otherSystemPerson, "system.other");
  let reauthenticated = false;
  const records = [actorAccount, ordinaryAccount, otherSystemAccount];
  const dependencies = {
    accounts: {
      createAccount: vi.fn(),
      getAccount: vi.fn((accountId: string) => Promise.resolve(records.find((item) => item.accountId === accountId) ?? ordinaryAccount)),
      listAccounts: vi.fn(() => Promise.resolve({ items: records })),
      listIdentifierHistory: vi.fn(() => Promise.resolve([])),
      releasePhone: vi.fn(),
      setStatus: vi.fn(),
      updateLoginIdentifiers: vi.fn(() => Promise.resolve({ ...actorAccount, revision: 3 })),
    },
    audit: { record: vi.fn(() => Promise.resolve()) },
    authorization: { requireAllowed: vi.fn(() => Promise.resolve({})) },
    clock: () => new Date(now),
    credentials: { create: vi.fn(), get: vi.fn(), replace: vi.fn() },
    operations: { async execute<T>(_input: Readonly<Record<string, string>>, work: () => Promise<Readonly<T>>) { return { replayed: false, value: await work() }; } },
    organization: {
      closeAssignment: vi.fn(), closeEmployment: vi.fn(), createAssignment: vi.fn(), createEmployment: vi.fn(),
      createOrganizationUnit: vi.fn(), createPosition: vi.fn(), createWorkforcePerson: vi.fn(),
      resolveWorkforcePersonContext: vi.fn((workforcePersonId: string) => Promise.resolve({ assignments: [{ assignmentId: ids.assignment, employmentId: ids.employment, organizationUnitId: ids.department, positionId: ids.position }], employmentIds: [ids.employment], resolvedAt: now, workforcePersonId })),
    },
    organizationDirectory: {
      createDepartment: vi.fn(), createPosition: vi.fn(),
      getPersonProfile: vi.fn((workforcePersonId: string) => Promise.resolve({ realName: workforcePersonId === ids.ordinaryPerson ? "Employee One" : "System Administrator", revision: 1, updatedAt: now, workforcePersonId })),
      listDepartmentTree: vi.fn(() => Promise.resolve([{ active: true, children: [], name: "Platform", normalizedName: "platform", organizationUnitId: ids.department, revision: 1, rootLocked: true, updatedAt: now }])),
      listPositions: vi.fn(() => Promise.resolve([{ active: true, name: "Member", normalizedName: "member", organizationUnitId: ids.department, positionId: ids.position, revision: 1, updatedAt: now }])),
      setDepartmentActive: vi.fn(), setPositionActive: vi.fn(), updateDepartment: vi.fn(), updatePosition: vi.fn(),
      upsertPersonProfile: vi.fn((command: Readonly<{ realName: string; workforcePersonId: string }>) => Promise.resolve({ realName: command.realName, revision: 2, updatedAt: now, workforcePersonId: command.workforcePersonId })),
    },
    principals: { resolve: vi.fn(() => Promise.resolve({
      accountId: ids.actorAccount,
      actor: { actorId: "account:system-admin", actorType: "authenticated_subject" as const, assignmentId: ids.assignment },
      reauthenticated,
      subject: { activeAssignmentIds: [ids.assignment], selectedAssignmentId: ids.assignment, workforcePersonId: ids.actorPerson },
    })) },
    roles: {
      grant: vi.fn(),
      listActive: vi.fn((workforcePersonId: string) => Promise.resolve(workforcePersonId === ids.ordinaryPerson
        ? [{ assignmentId: ids.assignment, grantId: "30000000-0000-4000-8000-000000000001", grantedAt: now, roleKey: "application_user" as const, workforcePersonId }]
        : [{ grantId: "30000000-0000-4000-8000-000000000002", grantedAt: now, roleKey: "system_administrator" as const, workforcePersonId }])),
      revoke: vi.fn(),
    },
    transactions: { lockSystemAdministratorSet: vi.fn(), run: <T>(work: () => Promise<T>) => work() },
  } as unknown as WorkforceAdministrationDependencies;
  return {
    actorAccount,
    dependencies,
    facade: createWorkforceAdministrationFacade(dependencies),
    ordinaryAccount,
    otherSystemAccount,
    setReauthenticated(value: boolean) { reauthenticated = value; },
  };
}

const executeInput = (command: Parameters<ReturnType<typeof createWorkforceAdministrationFacade>["execute"]>[0]["command"]) => ({ command, credential: "c".repeat(43), operationId: ids.operation, traceId });

describe("workforce administration system-account isolation", () => {
  it("excludes every system administrator from ordinary pages and exposes only the actor's system account", async () => {
    const { facade } = fixture();
    const page = await facade.listAccounts({ credential: "c".repeat(43), query: { page: 1, pageSize: 20 }, traceId });
    expect(page.items.map(({ accountId }) => accountId)).toEqual([ids.ordinaryAccount]);

    const snapshot = await facade.load({ credential: "c".repeat(43), traceId });
    expect(snapshot.accounts.map(({ accountId }) => accountId)).toEqual([ids.ordinaryAccount]);
    expect(snapshot.systemAccount).toMatchObject({ accountId: ids.actorAccount, allowedActions: ["edit"] });
  });

  it("rejects ordinary edits of system accounts and system edits targeting another administrator", async () => {
    const { facade, otherSystemAccount, setReauthenticated } = fixture();
    setReauthenticated(true);
    const fields = { accountId: otherSystemAccount.accountId, expectedRevision: otherSystemAccount.revision, legalName: "Other Administrator", username: otherSystemAccount.username };
    await expect(facade.execute(executeInput({ ...fields, departmentId: ids.department, kind: "update_account", positionId: ids.position }))).rejects.toEqual(new WorkforceAdministrationFacadeError("forbidden"));
    await expect(facade.execute(executeInput({ ...fields, kind: "update_system_account" }))).rejects.toEqual(new WorkforceAdministrationFacadeError("forbidden"));
  });

  it("updates only the freshly reauthenticated actor's own system account", async () => {
    const { actorAccount, dependencies, facade, setReauthenticated } = fixture();
    const command = { accountId: actorAccount.accountId, expectedRevision: actorAccount.revision, kind: "update_system_account" as const, legalName: "Primary Administrator", username: "system.primary" };
    await expect(facade.execute(executeInput(command))).rejects.toEqual(new WorkforceAdministrationFacadeError("forbidden"));
    setReauthenticated(true);
    await expect(facade.execute(executeInput(command))).resolves.toEqual({ replayed: false });
    expect(dependencies.accounts.updateLoginIdentifiers).toHaveBeenCalledWith(expect.objectContaining({ accountId: ids.actorAccount, username: "system.primary" }));
  });
});
