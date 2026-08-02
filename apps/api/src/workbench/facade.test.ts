import { describe, expect, it, vi } from "vitest";

import { createWorkbenchBootstrapFacade, type WorkbenchFacadeDependencies } from "./facade.js";
import type { WorkforceContext } from "@ai-crm/platform-organization";

const personId = "11111111-1111-4111-8111-111111111111";
const assignmentId = "22222222-2222-4222-8222-222222222222";

function dependencies(superAdministrator: boolean, assignments: WorkforceContext["assignments"] = []): WorkbenchFacadeDependencies {
  return {
    accountKinds: { isSuperAdministrator: vi.fn().mockResolvedValue(superAdministrator) },
    directory: { getPersonProfile: vi.fn().mockResolvedValue({ realName: superAdministrator ? "ZSJ系统管理员" : "普通员工" }) },
    principals: { resolve: vi.fn().mockResolvedValue({
      actorId: "subject:opaque",
      workforce: { assignments, employmentIds: ["33333333-3333-4333-8333-333333333333"], resolvedAt: "2026-08-02T00:00:00.000Z", subject: { issuer: "https://issuer", subject: "subject" }, workforcePersonId: personId },
    }) },
    registry: { loadRegistry: vi.fn().mockResolvedValue({
      applications: [],
      navigation: [{ applicationId: "crm", enabled: true, navigationId: "crm.workforce-administration", order: 10, routeId: "crm.workforce-administration" }],
      routes: [], version: 1,
    }), resolveDeepLink: vi.fn() },
  };
}

describe("workbench bootstrap facade", () => {
  it("allows a system administrator without an Assignment", async () => {
    const facade = createWorkbenchBootstrapFacade(dependencies(true));
    const result = await facade.load({ credential: "a".repeat(43), traceId: "1".repeat(32) });
    expect(result).toMatchObject({
      accountKind: "system_administrator",
      displayName: "ZSJ系统管理员",
      navigationIds: ["crm.workforce-administration"],
    });
    expect(result.sessionScope).toMatch(/^session:[0-9a-f]{32}$/u);
  });

  it("returns the sole active Assignment for a workforce account", async () => {
    const facade = createWorkbenchBootstrapFacade(dependencies(false, [{ assignmentId, employmentId: "33333333-3333-4333-8333-333333333333", organizationUnitId: "44444444-4444-4444-8444-444444444444", positionId: "55555555-5555-4555-8555-555555555555" }]));
    await expect(facade.load({ credential: "b".repeat(43), traceId: "2".repeat(32) })).resolves.toMatchObject({ accountKind: "workforce", assignmentReference: assignmentId });
  });
});
