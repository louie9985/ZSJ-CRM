import { describe, expect, it, vi } from "vitest";
import { createSameSiteWorkbenchPort } from "./same-site-workbench-port";

describe("same-site workbench port", () => {
  it("submits local credentials without exposing them outside the request body", async () => {
    const fetchPort = vi.fn().mockResolvedValue(Response.json({ kind: "ready" }));
    await expect(createSameSiteWorkbenchPort(fetchPort).login("employee.one", "Password-1!")).resolves.toBe("authenticated");
    expect(fetchPort).toHaveBeenCalledWith("/auth/pc/login", {
      body: JSON.stringify({ identifier: "employee.one", password: "Password-1!" }),
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      method: "POST",
    });
    const request = fetchPort.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.stringify(request?.headers)).not.toContain("Password-1!");
  });

  it.each([[401, "invalid"], [403, "security-rejected"], [429, "rate-limited"], [503, "unavailable"]] as const)("maps login status %s to %s", async (status, result) => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(createSameSiteWorkbenchPort(fetchPort).login("employee.one", "Password-1!")).resolves.toBe(result);
  });

  it("parses an Assignment-free system administrator bootstrap", async () => {
    const fetchPort = vi.fn().mockResolvedValue(Response.json({
      kind: "ready", fixture: false,
      context: { accountKind: "system_administrator", displayName: "ZSJ系统管理员", sessionScope: "opaque-session-scope" },
      counts: { files: 0, forms: 0, notifications: 0, tasks: 0 }, collections: {},
      navigationIds: ["crm.workforce-administration"], workspaceProfileId: "crm.workspace.unconfigured",
    }));
    const result = await createSameSiteWorkbenchPort(fetchPort).bootstrap();
    expect(result).toMatchObject({ kind: "ready", context: { accountKind: "system_administrator" } });
    if (result.kind !== "ready") throw new Error("ready_expected");
    expect(result.context.assignmentReference).toBeUndefined();
  });

  it("fails closed on invalid or repeated navigation ids", async () => {
    const response = (navigationIds: string[]) => Response.json({
      kind: "ready", fixture: false,
      context: { accountKind: "workforce", displayName: "Employee", sessionScope: "opaque-session-scope" },
      counts: {}, collections: {}, navigationIds,
    });
    await expect(createSameSiteWorkbenchPort(vi.fn().mockResolvedValue(response(["https://outside.invalid"]))).bootstrap()).rejects.toThrow("workbench_navigation_invalid");
    await expect(createSameSiteWorkbenchPort(vi.fn().mockResolvedValue(response(["crm.tasks", "crm.tasks"]))).bootstrap()).rejects.toThrow("workbench_navigation_invalid");
  });

  it.each([[401, "signed-out"], [403, "forbidden"], [503, "maintenance"]] as const)("maps bootstrap status %s to %s", async (status, kind) => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(createSameSiteWorkbenchPort(fetchPort).bootstrap()).resolves.toEqual({ kind });
  });

  it("gets CSRF and clears the local session without a provider redirect", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(43) }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(createSameSiteWorkbenchPort(fetchPort).logout()).resolves.toEqual({ kind: "logged-out" });
    expect(fetchPort).toHaveBeenNthCalledWith(2, "/auth/pc/logout", {
      credentials: "same-origin", headers: { Accept: "application/json", "X-CSRF-Token": "c".repeat(43) }, method: "POST",
    });
  });

  it("treats an already absent session as logged out", async () => {
    const fetchPort = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(createSameSiteWorkbenchPort(fetchPort).logout()).resolves.toEqual({ kind: "logged-out" });
    expect(fetchPort).toHaveBeenNthCalledWith(2, "/auth/pc/logout", { credentials: "same-origin", headers: { Accept: "application/json" }, method: "POST" });
  });
});
