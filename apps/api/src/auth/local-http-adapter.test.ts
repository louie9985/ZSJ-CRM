import { describe, expect, it, vi } from "vitest";

import type { AccountAccessApplicationService, AccountSessionResult } from "./account-access-service.js";
import { BrowserSessionFailure } from "./errors.js";
import { createLocalAuthenticationHttpAdapter, parseSurfaceSessionCookie, validateLocalBrowserMutation } from "./local-http-adapter.js";

const credential = "a".repeat(43);
const csrfToken = "b".repeat(43);
const result: AccountSessionResult = { credential, view: { absoluteExpiresAt: "2026-08-04T08:00:00.000Z", accountId: "account", assignments: [], authenticatedAt: "2026-08-04T00:00:00.000Z", csrfToken, idleExpiresAt: "2026-08-04T00:30:00.000Z", roles: ["system_administrator"], surface: "pc" } };

function fixture() {
  const current = vi.fn(() => Promise.resolve(result.view));
  const logout = vi.fn(() => Promise.resolve());
  const service = {
    current,
    login: vi.fn(() => Promise.resolve(result)),
    logout,
    reauthenticate: vi.fn(() => Promise.resolve(result)),
    selectAssignment: vi.fn(() => Promise.resolve(result)),
  } as unknown as AccountAccessApplicationService;
  return { adapter: createLocalAuthenticationHttpAdapter({ allowedOrigins: { "internal-h5": "https://h5.example.test", "part-time": "https://part-time.example.test", pc: "https://crm.example.test" }, clock: () => Date.parse("2026-08-04T00:00:00.000Z"), service }), current, logout };
}

describe("local authentication HTTP adapter", () => {
  it("sets the independent hardened PC cookie without returning the credential in the body", async () => {
    const { adapter } = fixture();
    const response = await adapter.login("pc", { identifier: "user", origin: "https://crm.example.test", password: "Password-1!", sourceAddress: "192.0.2.1" });
    expect(response.status).toBe(200);
    expect(response.headers["Set-Cookie"]).toBe(`__Host-ai_crm_pc_session=${credential}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
    expect(JSON.stringify(response.body)).not.toContain(credential);
  });

  it("keeps PC and internal H5 cookies isolated", () => {
    expect(parseSurfaceSessionCookie("pc", `__Host-ai_crm_internal_h5_session=${credential}`)).toBeUndefined();
    expect(parseSurfaceSessionCookie("internal-h5", `__Host-ai_crm_internal_h5_session=${credential}`)).toBe(credential);
  });

  it("rejects one surface origin on the other surface login", async () => {
    const { adapter } = fixture();
    const response = await adapter.login("pc", { identifier: "user", origin: "https://h5.example.test", password: "Password-1!", sourceAddress: "192.0.2.1" });
    expect(response.status).toBe(403);
    expect(response.body).toEqual(expect.objectContaining({ code: "authentication_csrf_rejected" }));
  });

  it("fails mutations closed on missing origin or a mismatched CSRF token", () => {
    expect(() => { validateLocalBrowserMutation({ allowedOrigin: "https://crm.example.test", csrfToken, sessionCsrfToken: csrfToken }); }).toThrow(BrowserSessionFailure);
    expect(() => { validateLocalBrowserMutation({ allowedOrigin: "https://crm.example.test", csrfToken: "c".repeat(43), origin: "https://crm.example.test", sessionCsrfToken: csrfToken }); }).toThrow(BrowserSessionFailure);
  });

  it("clears an invalid Session Cookie during idempotent logout", async () => {
    const { adapter, current, logout } = fixture();
    current.mockRejectedValueOnce(new BrowserSessionFailure("authentication_required"));
    const response = await adapter.logout("pc", { cookie: `__Host-ai_crm_pc_session=${credential}`, origin: "https://crm.example.test" });
    expect(response.status).toBe(204);
    expect(response.headers["Set-Cookie"]).toContain("Max-Age=0");
    expect(logout).toHaveBeenCalledWith("pc", credential, undefined);
  });

  it("does not clear a cookie when an unauthenticated logout request is cross-site", async () => {
    const { adapter } = fixture();
    const response = await adapter.logout("pc", {});
    expect(response.status).toBe(403);
    expect(response.headers["Set-Cookie"]).toBeUndefined();
  });
});
