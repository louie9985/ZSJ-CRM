import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryOrganizationStore } from "./memory-store.js";
import { OrganizationService } from "./service.js";

const at = "2026-07-26T00:00:00.000Z";
const later = "2026-08-01T00:00:00.000Z";
const ids = {
  assignmentA: "00000000-0000-4000-8000-000000000007",
  assignmentB: "00000000-0000-4000-8000-000000000009",
  employment: "00000000-0000-4000-8000-000000000002",
  person: "00000000-0000-4000-8000-000000000001",
  placement: "00000000-0000-4000-8000-000000000005",
  positionA: "00000000-0000-4000-8000-000000000006",
  positionB: "00000000-0000-4000-8000-000000000008",
  unit: "00000000-0000-4000-8000-000000000004",
};
const metadata = (operationId = randomUUID()) => ({ actor: { actorId: "synthetic-admin", actorType: "system" as const }, operationId, reason: "organization acceptance fixture", traceId: "trace-organization" });
const allow = { authorize: () => Promise.resolve() };

describe("OrganizationService", () => {
  let service: OrganizationService;
  beforeEach(() => { service = new OrganizationService(createMemoryOrganizationStore(), allow); });

  it("resolves a workforce person directly and requires active employment", async () => {
    await expect(service.resolveWorkforcePersonContext(ids.person, at)).rejects.toMatchObject({ code: "employment_not_active" });
    await seed(service);
    await expect(service.resolveWorkforcePersonContext(ids.person, at)).resolves.toMatchObject({ workforcePersonId: ids.person, assignments: [{ assignmentId: ids.assignmentA }] });
  });

  it("returns multiple active assignments and filters only an explicit selection", async () => {
    await seed(service, true);
    const context = await service.resolveWorkforcePersonContext(ids.person, at);
    expect(context.assignments.map(({ assignmentId }) => assignmentId)).toEqual([ids.assignmentA, ids.assignmentB]);
    await expect(service.resolveWorkforcePersonContext(ids.person, at, ids.assignmentB)).resolves.toMatchObject({ assignments: [{ assignmentId: ids.assignmentB }] });
    await expect(service.resolveWorkforcePersonContext(ids.person, at, randomUUID())).rejects.toMatchObject({ code: "assignment_not_active" });
  });

  it("closing one assignment does not imply departure", async () => {
    await seed(service, true);
    await service.closeAssignment({ ...metadata(), effectiveTo: later, factId: ids.assignmentA });
    await expect(service.resolveWorkforcePersonContext(ids.person, later)).resolves.toMatchObject({ assignments: [{ assignmentId: ids.assignmentB }] });
  });

  it("closing employment fails access closed while preserving earlier history", async () => {
    await seed(service);
    await service.closeEmployment({ ...metadata(), effectiveTo: later, factId: ids.employment });
    await expect(service.resolveWorkforcePersonContext(ids.person, later)).rejects.toMatchObject({ code: "employment_not_active" });
    await expect(service.resolveWorkforcePersonContext(ids.person, at)).resolves.toMatchObject({ workforcePersonId: ids.person });
  });

  it("replays the same operation and rejects changed content", async () => {
    const operationId = randomUUID();
    const command = { ...metadata(operationId), recordedAt: at, workforcePersonId: ids.person };
    await service.createWorkforcePerson(command);
    await expect(service.createWorkforcePerson(command)).resolves.toBeUndefined();
    await expect(service.createWorkforcePerson({ ...command, workforcePersonId: randomUUID() })).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("rejects a scheduled hierarchy cycle", async () => {
    const root = randomUUID(); const child = randomUUID(); const rootPlacement = randomUUID();
    await service.createOrganizationUnit({ ...metadata(), effectiveFrom: at, organizationUnitId: root, placementId: rootPlacement });
    await service.createOrganizationUnit({ ...metadata(), effectiveFrom: at, organizationUnitId: child, parentOrganizationUnitId: root, placementId: randomUUID() });
    await service.closeOrganizationUnitPlacement({ ...metadata(), effectiveTo: later, factId: rootPlacement });
    await expect(service.createOrganizationUnitPlacement({ ...metadata(), effectiveFrom: later, organizationUnitId: root, parentOrganizationUnitId: child, placementId: randomUUID() })).rejects.toMatchObject({ code: "organization_hierarchy_cycle" });
  });
});

async function seed(service: OrganizationService, secondAssignment = false): Promise<void> {
  await service.createWorkforcePerson({ ...metadata(), recordedAt: at, workforcePersonId: ids.person });
  await service.createEmployment({ ...metadata(), effectiveFrom: at, employmentId: ids.employment, workforcePersonId: ids.person });
  await service.createOrganizationUnit({ ...metadata(), effectiveFrom: at, organizationUnitId: ids.unit, placementId: ids.placement });
  await service.createPosition({ ...metadata(), effectiveFrom: at, organizationUnitId: ids.unit, positionId: ids.positionA });
  await service.createAssignment({ ...metadata(), assignmentId: ids.assignmentA, effectiveFrom: at, employmentId: ids.employment, organizationUnitId: ids.unit, positionId: ids.positionA, workforcePersonId: ids.person });
  if (secondAssignment) {
    await service.createPosition({ ...metadata(), effectiveFrom: at, organizationUnitId: ids.unit, positionId: ids.positionB });
    await service.createAssignment({ ...metadata(), assignmentId: ids.assignmentB, effectiveFrom: at, employmentId: ids.employment, organizationUnitId: ids.unit, positionId: ids.positionB, workforcePersonId: ids.person });
  }
}
