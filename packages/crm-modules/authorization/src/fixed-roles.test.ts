import { describe, expect, it, vi } from "vitest";

import { createFixedRoleAuthorizationService, createFixedRoleGrantStore, FIXED_ROLE_PERMISSION_BUNDLES, type FixedRoleGrant, type FixedRoleGrantStore } from "./fixed-roles.js";

class MemoryRoleStore implements FixedRoleGrantStore {
  public readonly grants: FixedRoleGrant[] = [];
  grant(input: Parameters<FixedRoleGrantStore["grant"]>[0]): Promise<void> { this.grants.push(input); return Promise.resolve(); }
  listActive(workforcePersonId: string): Promise<readonly FixedRoleGrant[]> { return Promise.resolve(this.grants.filter((grant) => grant.workforcePersonId === workforcePersonId)); }
  revoke(input: Parameters<FixedRoleGrantStore["revoke"]>[0]): Promise<void> { const index = this.grants.findIndex(({ grantId }) => grantId === input.grantId); if (index >= 0) this.grants.splice(index, 1); return Promise.resolve(); }
}

const permission = Object.freeze({ action: "read", resource: "crm.example.record" });
const subject = Object.freeze({ activeAssignmentIds: ["assignment-a"], selectedAssignmentId: "assignment-a", workforcePersonId: "person-a" });

describe("fixed role authorization", () => {
  it("unions global and only the selected active assignment roles", async () => {
    const store = new MemoryRoleStore();
    store.grants.push(
      { assignmentId: "assignment-a", grantId: "grant-a", grantedAt: "2026-01-01T00:00:00.000Z", roleKey: "application_user", workforcePersonId: "person-a" },
      { assignmentId: "assignment-b", grantId: "grant-b", grantedAt: "2026-01-01T00:00:00.000Z", roleKey: "crm_administrator", workforcePersonId: "person-a" },
    );
    const service = createFixedRoleAuthorizationService({ approvedPermissions: [permission], clock: () => new Date("2026-01-02T00:00:00.000Z"), rolePermissions: { application_user: [permission], crm_administrator: [] }, store });
    await expect(service.check(subject, permission)).resolves.toMatchObject({ allowed: true });
    await expect(service.check({ ...subject, selectedAssignmentId: "assignment-b" }, permission)).resolves.toMatchObject({ allowed: false });
  });

  it("gives system administrators global scope", async () => {
    const store = new MemoryRoleStore();
    store.grants.push({ grantId: "grant-system", grantedAt: "2026-01-01T00:00:00.000Z", roleKey: "system_administrator", workforcePersonId: "person-a" });
    const service = createFixedRoleAuthorizationService({ approvedPermissions: [permission], clock: () => new Date("2026-01-02T00:00:00.000Z"), rolePermissions: { application_user: [], crm_administrator: [] }, store });
    await expect(service.resolveDataScope({ activeAssignmentIds: [], workforcePersonId: "person-a" }, permission)).resolves.toMatchObject({ decision: { allowed: true }, scope: { terms: [{ kind: "all" }] } });
  });

  it("uses one grant snapshot for permission and data scope", async () => {
    const store = new MemoryRoleStore();
    store.grants.push({ grantId: "grant-system", grantedAt: "2026-01-01T00:00:00.000Z", roleKey: "system_administrator", workforcePersonId: "person-a" });
    let reads = 0;
    const listActive = store.listActive.bind(store);
    store.listActive = (workforcePersonId: string) => { reads += 1; return listActive(workforcePersonId); };
    const service = createFixedRoleAuthorizationService({ approvedPermissions: [permission], rolePermissions: { application_user: [], crm_administrator: [] }, store });
    await service.resolveDataScope(subject, permission);
    expect(reads).toBe(1);
  });

  it("uses one grant snapshot for a permission batch", async () => {
    const store = new MemoryRoleStore();
    store.grants.push({ assignmentId: "assignment-a", grantId: "grant-a", grantedAt: "2026-01-01T00:00:00.000Z", roleKey: "application_user", workforcePersonId: "person-a" });
    let reads = 0;
    const listActive = store.listActive.bind(store);
    store.listActive = (workforcePersonId: string) => { reads += 1; return listActive(workforcePersonId); };
    const service = createFixedRoleAuthorizationService({ approvedPermissions: [permission], rolePermissions: { application_user: [permission], crm_administrator: [] }, store });
    await service.batchCheck(subject, [permission, permission]);
    expect(reads).toBe(1);
  });

  it("does not implicitly grant a newly catalogued permission to application users", () => {
    expect(FIXED_ROLE_PERMISSION_BUNDLES.application_user).not.toContainEqual({ action: "manage", resource: "crm.workforce-access.console" });
  });

  it("rejects wildcard and unreviewed permissions at composition time", () => {
    expect(() => createFixedRoleAuthorizationService({ approvedPermissions: [{ action: "*", resource: "crm.example.record" }], rolePermissions: { application_user: [], crm_administrator: [] }, store: new MemoryRoleStore() })).toThrow("authorization_fixed_role_permission_invalid");
    expect(() => createFixedRoleAuthorizationService({ approvedPermissions: [permission], rolePermissions: { application_user: [{ action: "write", resource: "crm.example.record" }], crm_administrator: [] }, store: new MemoryRoleStore() })).toThrow("authorization_fixed_role_permission_unapproved");
  });

  it("does not query grants when resolving an unknown permission", async () => {
    const store = new MemoryRoleStore();
    const listActive = vi.fn(store.listActive.bind(store));
    store.listActive = listActive;
    const service = createFixedRoleAuthorizationService({ approvedPermissions: [permission], rolePermissions: { application_user: [], crm_administrator: [] }, store });
    await expect(service.resolveDataScope(subject, { action: "read", resource: "crm.unknown" })).resolves.toMatchObject({ decision: { allowed: false, reason: "unknown_permission" } });
    expect(listActive).not.toHaveBeenCalled();
  });

  it("accepts only an exact grant identity replay before scope convergence", async () => {
    const input = Object.freeze({
      assignmentId: "10000000-0000-4000-8000-000000000001",
      grantId: "20000000-0000-4000-8000-000000000001",
      grantedAt: "2026-08-04T00:00:00.000Z",
      operationId: "30000000-0000-4000-8000-000000000001",
      roleKey: "application_user" as const,
      workforcePersonId: "40000000-0000-4000-8000-000000000001",
    });
    const execute = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ assignment_id: input.assignmentId, grant_id: input.grantId, granted_at: input.grantedAt, operation_id: input.operationId, role_key: input.roleKey, workforce_person_id: input.workforcePersonId }] });
    await expect(createFixedRoleGrantStore({ execute }).grant(input)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);

    execute.mockReset()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ assignment_id: input.assignmentId, grant_id: input.grantId, granted_at: input.grantedAt, operation_id: input.operationId, role_key: "crm_administrator", workforce_person_id: input.workforcePersonId }] });
    await expect(createFixedRoleGrantStore({ execute }).grant(input)).rejects.toMatchObject({ name: "AuthorizationUnavailableError" });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
