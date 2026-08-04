import { describe, expect, it, vi } from "vitest";

import type { AuthorizationPolicyPublisher, AuthorizationPolicySnapshot } from "@ai-crm/platform-authorization";
import { backfillActiveCrmApplicationGrants, createAuthorizationGrantPort } from "./authorization-grants.js";

const personId = "11111111-1111-4111-8111-111111111111";
const assignmentId = "22222222-2222-4222-8222-222222222222";
const roleId = "33333333-3333-4333-8333-333333333333";
const applicationRoleId = "77777777-7777-4777-8777-777777777777";
const operationId = "44444444-4444-4444-8444-444444444444";

function policy(grants: AuthorizationPolicySnapshot["grants"] = []): AuthorizationPolicySnapshot {
  return { grants, permissions: [{ action: "manage", applicationId: "crm", code: "crm.workforce:manage", resource: "crm.workforce", scopeDimensions: [] }, { action: "access", applicationId: "crm", code: "crm.application:access", resource: "crm.application", scopeDimensions: [] }, { action: "read", applicationId: "platform", code: "platform.workbench.shell:read", resource: "platform.workbench.shell", scopeDimensions: [] }], roles: [{ displayName: "CRM系统管理员", permissions: [{ permissionCode: "crm.workforce:manage", scope: { terms: [{ kind: "all" }], version: 1 } }], roleId, roleKey: "crm.system-administrator" }, { displayName: "CRM基础访问用户", permissions: ["crm.application:access", "platform.workbench.shell:read"].map((permissionCode) => ({ permissionCode, scope: { terms: [{ kind: "all" as const }], version: 1 as const } })), roleId: applicationRoleId, roleKey: "crm.application-user" }], schemaVersion: 2, superAdministratorGrants: [{ grantId: "55555555-5555-4555-8555-555555555555", validFrom: "2026-08-01T00:00:00.000Z", workforcePersonId: personId }], version: "current" };
}

function fixture(initial = policy(), resolveActiveAssignmentIds = vi.fn().mockResolvedValue([assignmentId])) {
  const publisher = { publish: vi.fn().mockResolvedValue({}) };
  return {
    port: createAuthorizationGrantPort({ clock: () => new Date("2026-08-02T00:00:00.000Z"), publisher, resolveActiveAssignmentIds, store: { currentVersion: vi.fn().mockResolvedValue("current"), load: vi.fn().mockResolvedValue(initial) } }),
    publisher,
  };
}

describe("authorization grant port", () => {
  it("collects all active accounts before invoking one controlled backfill publication", async () => {
    const backfillApplicationGrants = vi.fn().mockResolvedValue({ grantedAccountIds: ["account-a"] });
    const listAccounts = vi.fn()
      .mockResolvedValueOnce({ items: [{ accountId: "account-a", revision: 1, status: "active", username: "account-a", workforcePersonId: personId }], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [] });
    await expect(backfillActiveCrmApplicationGrants({ accounts: { listAccounts }, grants: { backfillApplicationGrants }, operationId })).resolves.toEqual({ grantedAccountIds: ["account-a"] });
    expect(backfillApplicationGrants).toHaveBeenCalledOnce();
    expect(backfillApplicationGrants).toHaveBeenCalledWith({ accounts: [{ accountId: "account-a", workforcePersonId: personId }], operationId });
  });
  it("reads independent super administrator grants", async () => {
    await expect(fixture().port.isSuperAdministrator(personId)).resolves.toBe(true);
  });

  it("publishes an assignment-bound CRM grant with an exact previous version", async () => {
    const { port, publisher } = fixture(policy(), vi.fn().mockResolvedValue([]));
    await port.setGrant({ actor: { actorId: "subject:opaque", actorType: "authenticated_subject" }, assignmentId, enabled: true, operationId, traceId: "1".repeat(32), workforcePersonId: personId });
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    const command = publisher.publish.mock.calls[0]?.[0] as { contractVersion?: string; expectedPreviousVersion?: string; snapshot?: AuthorizationPolicySnapshot } | undefined;
    expect(command?.contractVersion).toBe("authorization-policy.v2");
    expect(command?.expectedPreviousVersion).toBe("current");
    expect(command?.snapshot?.version).toBe(operationId);
    expect(command?.snapshot?.grants).toEqual([expect.objectContaining({ roleId, subject: { assignmentId, kind: "assignment" } })]);
  });

  it("closes the active grant instead of deleting history", async () => {
    const existing = { grantId: "66666666-6666-4666-8666-666666666666", roleId, subject: { assignmentId, kind: "assignment" as const }, validFrom: "2026-08-01T00:00:00.000Z" };
    const { port, publisher } = fixture(policy([existing]));
    await port.setGrant({ actor: { actorId: "subject:opaque", actorType: "authenticated_subject" }, assignmentId, enabled: false, operationId, traceId: "1".repeat(32), workforcePersonId: personId });
    const command = publisher.publish.mock.calls[0]?.[0] as { snapshot?: AuthorizationPolicySnapshot } | undefined;
    expect(command?.snapshot?.grants[0]).toEqual({ ...existing, validTo: "2026-08-02T00:00:00.000Z" });
  });

  it("revokes the administrator Grant without closing base application access", async () => {
    const administrator = { grantId: "66666666-6666-4666-8666-666666666666", roleId, subject: { assignmentId, kind: "assignment" as const }, validFrom: "2026-08-01T00:00:00.000Z" };
    const application = { grantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", roleId: applicationRoleId, subject: { assignmentId, kind: "assignment" as const }, validFrom: "2026-08-01T00:00:00.000Z" };
    const { port, publisher } = fixture(policy([administrator, application]));
    await port.setGrant({ actor: { actorId: "subject:opaque", actorType: "authenticated_subject" }, assignmentId, enabled: false, operationId, traceId: "1".repeat(32), workforcePersonId: personId });
    const grants = (publisher.publish.mock.calls[0]?.[0] as { snapshot: AuthorizationPolicySnapshot }).snapshot.grants;
    expect(grants).toContainEqual({ ...administrator, validTo: "2026-08-02T00:00:00.000Z" });
    expect(grants).toContainEqual(application);
  });

  it("publishes the fixed application-user grant on the exact Assignment", async () => {
    const { port, publisher } = fixture();
    await port.setApplicationGrant({ assignmentId, enabled: true, operationId, workforcePersonId: personId });
    const command = publisher.publish.mock.calls[0]?.[0] as { snapshot?: AuthorizationPolicySnapshot } | undefined;
    expect(command?.snapshot?.grants).toContainEqual(expect.objectContaining({ roleId: applicationRoleId, subject: { assignmentId, kind: "assignment" } }));
  });

  it("moves application access in one immutable policy publication", async () => {
    const nextAssignmentId = "88888888-8888-4888-8888-888888888888";
    const existing = { grantId: "99999999-9999-4999-8999-999999999999", roleId: applicationRoleId, subject: { assignmentId, kind: "assignment" as const }, validFrom: "2026-08-01T00:00:00.000Z" };
    const { port, publisher } = fixture(policy([existing]));
    await port.moveApplicationGrant({ assignmentId: nextAssignmentId, closeAssignmentIds: [assignmentId], operationId, workforcePersonId: personId });
    expect(publisher.publish).toHaveBeenCalledOnce();
    const grants = (publisher.publish.mock.calls[0]?.[0] as { snapshot: AuthorizationPolicySnapshot }).snapshot.grants;
    expect(grants).toContainEqual({ ...existing, validTo: "2026-08-02T00:00:00.000Z" });
    expect(grants).toContainEqual(expect.objectContaining({ roleId: applicationRoleId, subject: { assignmentId: nextAssignmentId, kind: "assignment" } }));
  });

  it("preflights every backfill account before publishing and reports stable account ids", async () => {
    const { port, publisher } = fixture(policy(), vi.fn().mockResolvedValue([]));
    await expect(port.backfillApplicationGrants({ accounts: [{ accountId: "account-stable", workforcePersonId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }], operationId })).rejects.toMatchObject({ accountIds: ["account-stable"], code: "crm_application_grant_preflight_failed" });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("backfills every eligible account in one immutable publication and is idempotent on repetition", async () => {
    const secondPersonId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const secondAssignmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    let current = policy();
    const publisher = { publish: vi.fn<AuthorizationPolicyPublisher["publish"]>((command) => {
      current = command.snapshot;
      return Promise.resolve({} as Awaited<ReturnType<AuthorizationPolicyPublisher["publish"]>>);
    }) };
    const port = createAuthorizationGrantPort({
      clock: () => new Date("2026-08-02T00:00:00.000Z"),
      publisher,
      resolveActiveAssignmentIds: vi.fn((targetPersonId: string) => Promise.resolve(targetPersonId === personId ? [assignmentId] : [secondAssignmentId])),
      store: { currentVersion: vi.fn(() => Promise.resolve(current.version)), load: vi.fn(() => Promise.resolve(current)) },
    });
    const accounts = [{ accountId: "account-b", workforcePersonId: secondPersonId }, { accountId: "account-a", workforcePersonId: personId }];

    await expect(port.backfillApplicationGrants({ accounts, operationId })).resolves.toEqual({ grantedAccountIds: ["account-a", "account-b"] });
    await expect(port.backfillApplicationGrants({ accounts, operationId })).resolves.toEqual({ grantedAccountIds: [] });

    expect(publisher.publish).toHaveBeenCalledOnce();
    const command = publisher.publish.mock.calls[0]?.[0];
    expect(command?.snapshot.grants.filter((grant) => grant.roleId === applicationRoleId)).toHaveLength(2);
  });

  it("excludes only the no-Assignment ZSJ super administrator while granting eligible CRM administrators", async () => {
    const crmAdministratorPersonId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { port, publisher } = fixture(policy(), vi.fn((targetPersonId: string) => Promise.resolve(targetPersonId === personId ? [] : [assignmentId])));
    await expect(port.backfillApplicationGrants({
      accounts: [
        { accountId: "zsj-system-administrator", workforcePersonId: personId },
        { accountId: "crm-administrator", workforcePersonId: crmAdministratorPersonId },
      ],
      operationId,
    })).resolves.toEqual({ grantedAccountIds: ["crm-administrator"] });
    const grants = (publisher.publish.mock.calls[0]?.[0] as { snapshot: AuthorizationPolicySnapshot }).snapshot.grants;
    expect(grants).toContainEqual(expect.objectContaining({ roleId: applicationRoleId, subject: { assignmentId, kind: "assignment" } }));
  });

  it("propagates a policy concurrency conflict without retrying against or overwriting a newer version", async () => {
    const conflict = new Error("authorization_publication_conflict");
    const publisher = { publish: vi.fn().mockRejectedValue(conflict) };
    const initial = policy();
    const port = createAuthorizationGrantPort({
      clock: () => new Date("2026-08-02T00:00:00.000Z"),
      publisher,
      resolveActiveAssignmentIds: vi.fn().mockResolvedValue([assignmentId]),
      store: { currentVersion: vi.fn().mockResolvedValue(initial.version), load: vi.fn().mockResolvedValue(initial) },
    });

    await expect(port.backfillApplicationGrants({ accounts: [{ accountId: "account-a", workforcePersonId: personId }], operationId })).rejects.toBe(conflict);
    expect(publisher.publish).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ expectedPreviousVersion: "current" }));
    expect(initial.grants).toEqual([]);
  });
});
