import { describe, expect, it, vi } from "vitest";

import { createWorkbenchHttpAdapter, type WorkbenchBootstrapFacade } from "./workbench-http.js";

const credential = "a".repeat(43);
const traceId = "1".repeat(32);

function facade(result: object): WorkbenchBootstrapFacade {
  return { load: vi.fn().mockResolvedValue(result) } as WorkbenchBootstrapFacade;
}

describe("workbench HTTP adapter", () => {
  it("returns an Assignment-free system administrator bootstrap", async () => {
    const adapter = createWorkbenchHttpAdapter(facade({
      accountKind: "system_administrator",
      displayName: "ZSJ系统管理员",
      navigationIds: ["crm.workforce-administration"],
      sessionScope: "session:system:01",
      workspaceProfileId: "crm.workspace.unconfigured",
    }));
    await expect(adapter.bootstrap({ credential, traceId })).resolves.toMatchObject({
      body: {
        context: { accountKind: "system_administrator", displayName: "ZSJ系统管理员" },
        fixture: false,
        kind: "ready",
        navigationIds: ["crm.workforce-administration"],
        workspaceProfileId: "crm.workspace.unconfigured",
      },
      status: 200,
    });
  });

  it("retains the selected Assignment for a workforce account", async () => {
    const assignmentReference = "11111111-1111-4111-8111-111111111111";
    const adapter = createWorkbenchHttpAdapter(facade({
      accountKind: "workforce",
      assignmentReference,
      displayName: "CRM系统管理员",
      navigationIds: ["crm.workforce-administration"],
      sessionScope: "session:workforce:01",
    }));
    await expect(adapter.bootstrap({ credential, traceId })).resolves.toMatchObject({ body: { context: { assignmentReference } }, status: 200 });
  });

  it("fails closed for malformed facade output", async () => {
    const adapter = createWorkbenchHttpAdapter(facade({ accountKind: "system_administrator", displayName: "admin", navigationIds: ["UNKNOWN"], sessionScope: "session:system:01" }));
    await expect(adapter.bootstrap({ credential, traceId })).resolves.toMatchObject({ body: { code: "workbench_unavailable" }, diagnosticCode: "workbench_unhandled_failure", status: 503 });
  });

  it("maps inactive employment to forbidden without exposing details", async () => {
    const load = vi.fn().mockRejectedValue(Object.assign(new Error("private"), { code: "employment_not_active" }));
    const adapter = createWorkbenchHttpAdapter({ load });
    await expect(adapter.bootstrap({ credential, traceId })).resolves.toMatchObject({ body: { code: "workbench_forbidden" }, diagnosticCode: "employment_not_active", status: 403 });
  });

  it("maps a stale workforce account session to forbidden instead of maintenance", async () => {
    const load = vi.fn().mockRejectedValue(Object.assign(new Error("private"), { code: "workforce_account_not_found" }));
    const adapter = createWorkbenchHttpAdapter({ load });
    await expect(adapter.bootstrap({ credential, traceId })).resolves.toMatchObject({ body: { code: "workbench_forbidden" }, status: 403 });
  });

  it("maps an ambiguous organization context to forbidden", async () => {
    const load = vi.fn().mockRejectedValue(Object.assign(new Error("private"), { code: "organization_context_ambiguous" }));
    await expect(createWorkbenchHttpAdapter({ load }).bootstrap({ credential, traceId })).resolves.toMatchObject({ body: { code: "workbench_forbidden" }, status: 403 });
  });
});
