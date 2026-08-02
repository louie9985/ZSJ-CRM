import { describe, expect, it, vi } from "vitest";
import { createSameSiteWorkbenchPort } from "./same-site-workbench-port";

describe("same-site workbench port", () => {
  it("parses an Assignment-free system administrator bootstrap", async () => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: "ready", fixture: false,
      context: { accountKind: "system_administrator", displayName: "ZSJ系统管理员", sessionScope: "opaque-session-scope" },
      counts: { files: 0, forms: 0, notifications: 0, tasks: 0 }, collections: {},
      navigationIds: ["crm.workforce-administration"],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await createSameSiteWorkbenchPort(fetchPort).bootstrap();
    expect(result).toMatchObject({ kind: "ready", context: { accountKind: "system_administrator", displayName: "ZSJ系统管理员" }, navigationIds: ["crm.workforce-administration"] });
    if (result.kind !== "ready") throw new Error("ready_expected");
    expect(result.context.assignmentReference).toBeUndefined();
  });

  it("fails closed on an invalid navigation response", async () => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: "ready", fixture: false, context: { accountKind: "workforce", displayName: "Employee", sessionScope: "opaque-session-scope" },
      counts: {}, collections: {}, navigationIds: ["https://outside.invalid"],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(createSameSiteWorkbenchPort(fetchPort).bootstrap()).rejects.toThrow("workbench_navigation_invalid");
  });

  it("fails closed when the server repeats a navigation id", async () => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: "ready", fixture: false, context: { accountKind: "workforce", displayName: "Employee", sessionScope: "opaque-session-scope" },
      counts: {}, collections: {}, navigationIds: ["crm.workforce-administration", "crm.workforce-administration"],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(createSameSiteWorkbenchPort(fetchPort).bootstrap()).rejects.toThrow("workbench_navigation_invalid");
  });
});
