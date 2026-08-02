import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryOrganizationDirectoryStore } from "./directory-memory-store.js";
import { OrganizationDirectoryService } from "./directory-service.js";

const at = "2026-08-02T00:00:00.000Z";
const metadata = () => ({ actor: { actorId: "synthetic-admin", actorType: "system" as const }, operationId: randomUUID(), reason: "organization directory fixture", traceId: "trace-directory" });
const allow = { authorize: () => Promise.resolve() };

describe("OrganizationDirectoryService", () => {
  it("builds, moves, and renames a department tree without cycles", async () => {
    const service = new OrganizationDirectoryService(new InMemoryOrganizationDirectoryStore(), allow); const root = randomUUID(); const first = randomUUID(); const second = randomUUID();
    await service.createDepartment({ ...metadata(), name: "ZSJ", organizationUnitId: root, rootLocked: true, updatedAt: at });
    await service.createDepartment({ ...metadata(), name: "AI应用部", organizationUnitId: first, parentOrganizationUnitId: root, updatedAt: at });
    await service.createDepartment({ ...metadata(), name: "销售部", organizationUnitId: second, parentOrganizationUnitId: root, updatedAt: at });
    await expect(service.updateDepartment({ ...metadata(), expectedRevision: 0, organizationUnitId: root, parentOrganizationUnitId: first, updatedAt: at })).rejects.toMatchObject({ code: "entity_conflict" });
    const moved = await service.updateDepartment({ ...metadata(), expectedRevision: 0, name: "CRM应用部", organizationUnitId: first, parentOrganizationUnitId: second, updatedAt: at });
    expect(moved).toMatchObject({ name: "CRM应用部", parentOrganizationUnitId: second, revision: 1 });
    expect((await service.listDepartmentTree())[0]?.children[0]?.children[0]?.organizationUnitId).toBe(first);
  });

  it("rejects duplicate names and referenced lifecycle changes", async () => {
    const store = new InMemoryOrganizationDirectoryStore(); const service = new OrganizationDirectoryService(store, allow); const root = randomUUID(); const child = randomUUID(); const position = randomUUID();
    await service.createDepartment({ ...metadata(), name: "ZSJ", organizationUnitId: root, rootLocked: true, updatedAt: at });
    await service.createDepartment({ ...metadata(), name: "AI应用部", organizationUnitId: child, parentOrganizationUnitId: root, updatedAt: at });
    await expect(service.createDepartment({ ...metadata(), name: "AI应用部", organizationUnitId: randomUUID(), parentOrganizationUnitId: root, updatedAt: at })).rejects.toMatchObject({ code: "entity_conflict" });
    await service.createPosition({ ...metadata(), name: "系统管理岗", organizationUnitId: child, positionId: position, updatedAt: at });
    store.markActiveAssignmentReference({ organizationUnitId: child, positionId: position });
    await expect(service.setPositionActive({ ...metadata(), active: false, expectedRevision: 0, positionId: position, updatedAt: at })).rejects.toMatchObject({ code: "entity_conflict" });
    await expect(service.setDepartmentActive({ ...metadata(), active: false, expectedRevision: 0, organizationUnitId: child, updatedAt: at })).rejects.toMatchObject({ code: "entity_conflict" });
  });

  it("maintains person profile revisions", async () => {
    const service = new OrganizationDirectoryService(new InMemoryOrganizationDirectoryStore(), allow); const person = randomUUID();
    await expect(service.upsertPersonProfile({ ...metadata(), realName: "张三", updatedAt: at, workforcePersonId: person })).resolves.toMatchObject({ revision: 0 });
    await expect(service.upsertPersonProfile({ ...metadata(), expectedRevision: 2, realName: "张三丰", updatedAt: at, workforcePersonId: person })).rejects.toMatchObject({ code: "entity_conflict" });
    await expect(service.upsertPersonProfile({ ...metadata(), expectedRevision: 0, realName: "张三丰", updatedAt: at, workforcePersonId: person })).resolves.toMatchObject({ realName: "张三丰", revision: 1 });
  });
});
