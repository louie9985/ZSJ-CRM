import { describe, expect, it, vi } from "vitest";
import { createSameSiteWorkbenchPort } from "./same-site-workbench-port";

describe("same-site workbench port", () => {
  it("parses an Assignment-free system administrator bootstrap", async () => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: "ready", fixture: false,
      applicationIds: ["crm"],
      context: { accountKind: "system_administrator", displayName: "ZSJ系统管理员", sessionScope: "opaque-session-scope" },
      counts: { files: 0, forms: 0, notifications: 0, tasks: 0 }, collections: {},
      navigationIds: ["crm.workforce-administration"],
      workspaceProfileId: "crm.workspace.unconfigured",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await createSameSiteWorkbenchPort(fetchPort).bootstrap();
    expect(result).toMatchObject({ kind: "ready", applicationIds: ["crm"], context: { accountKind: "system_administrator", displayName: "ZSJ系统管理员" }, navigationIds: ["crm.workforce-administration"], workspaceProfileId: "crm.workspace.unconfigured" });
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

  it("begins login by navigating to the reviewed PC BFF authorization entry", () => {
    const fetchPort = vi.fn();
    const locationPort = { assign: vi.fn() };
    createSameSiteWorkbenchPort(fetchPort, locationPort).beginLogin("/crm/tasks?status=open");
    expect(locationPort.assign).toHaveBeenCalledWith("/auth/pc/login?returnTo=%2Fcrm%2Ftasks%3Fstatus%3Dopen");
    expect(fetchPort).not.toHaveBeenCalled();
  });

  it("bounds login return paths before leaving the workbench origin", () => {
    const locationPort = { assign: vi.fn() };
    createSameSiteWorkbenchPort(vi.fn(), locationPort).beginLogin("https://outside.invalid/steal");
    expect(locationPort.assign).toHaveBeenCalledWith("/auth/pc/login?returnTo=%2Fapplications");
  });

  it.each([
    [401, "signed-out"],
    [403, "forbidden"],
    [503, "maintenance"],
  ] as const)("maps bootstrap status %s without conflating authentication, authorization, and availability", async (status, kind) => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(createSameSiteWorkbenchPort(fetchPort).bootstrap()).resolves.toEqual({ kind });
  });

  it("uses a CSRF-protected JSON logout response before starting top-level provider logout", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(43) }))
      .mockResolvedValueOnce(Response.json({ redirectUrl: "https://identity.example.test/logout" }));
    const locationPort = { assign: vi.fn() };

    await expect(createSameSiteWorkbenchPort(fetchPort, locationPort).logout()).resolves.toEqual({ kind: "logged-out" });
    expect(fetchPort).toHaveBeenNthCalledWith(2, "/auth/pc/logout", {
      credentials: "same-origin",
      headers: { Accept: "application/json", "X-CSRF-Token": "c".repeat(43) },
      method: "POST",
    });
    expect(locationPort.assign).toHaveBeenCalledWith("https://identity.example.test/logout");
  });

  it("completes local-only and already-absent logout idempotently", async () => {
    const absentFetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(createSameSiteWorkbenchPort(absentFetch, { assign: vi.fn() }).logout()).resolves.toEqual({ kind: "logged-out" });

    const localFetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(43) }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(createSameSiteWorkbenchPort(localFetch, { assign: vi.fn() }).logout()).resolves.toEqual({ kind: "logged-out" });
  });

  it("rejects an unsafe provider logout redirect after the local session is cleared", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(43) }))
      .mockResolvedValueOnce(Response.json({ redirectUrl: "javascript:alert(1)" }));
    const locationPort = { assign: vi.fn() };

    await expect(createSameSiteWorkbenchPort(fetchPort, locationPort).logout()).rejects.toThrow("workbench_logout_response_invalid");
    expect(locationPort.assign).not.toHaveBeenCalled();
  });
});
