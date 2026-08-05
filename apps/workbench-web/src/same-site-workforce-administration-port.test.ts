import { describe, expect, it, vi } from "vitest";
import { createSameSiteWorkforceAdministrationPort } from "./same-site-workforce-administration-port";

describe("same-site workforce administration port", () => {
  it("reauthenticates with CSRF and keeps the password only in the JSON body", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(Response.json({ accountId: "account-1", csrfToken: "c".repeat(32) }))
      .mockResolvedValueOnce(Response.json({ accountId: "account-1", reauthenticatedUntil: "2099-08-04T00:05:00.000Z" }));
    await createSameSiteWorkforceAdministrationPort(fetchPort).reauthenticate("Current-password-1!");
    expect(fetchPort).toHaveBeenNthCalledWith(2, "/auth/pc/reauthentication", {
      body: JSON.stringify({ password: "Current-password-1!" }), credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": "c".repeat(32) }, method: "POST",
    });
    const request = fetchPort.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(JSON.stringify(request?.headers)).not.toContain("Current-password-1!");
  });

  it("loads the simplified account view", async () => {
    const fetchPort = vi.fn().mockResolvedValue(Response.json({
      accounts: [{ accountId: "account-1", allowedActions: ["release_phone"], crmAdministrator: false, legalName: "员工", releasablePhones: ["+8613700000000"], revision: 0, status: "active", username: "user.one" }],
      departments: [{ allowedActions: [], departmentId: "department-1", name: "AI应用部", revision: 0, status: "active" }],
      positions: [{ allowedActions: [], departmentId: "department-1", name: "系统管理岗", positionId: "position-1", revision: 0, status: "active" }],
    }));
    await expect(createSameSiteWorkforceAdministrationPort(fetchPort).load()).resolves.toMatchObject({ accounts: [{ releasablePhones: ["+8613700000000"], username: "user.one" }] });
  });

  it("encodes account filters and validates the paged response", async () => {
    const fetchPort = vi.fn().mockResolvedValue(Response.json({
      items: [{ accountId: "account-1", allowedActions: ["edit"], crmAdministrator: true, legalName: "员工", releasablePhones: [], revision: 3, status: "active", username: "user.one" }],
      page: 2, pageSize: 20, total: 21,
    }));
    await expect(createSameSiteWorkforceAdministrationPort(fetchPort).listAccounts({ page: 2, pageSize: 20, username: "User.One" })).resolves.toMatchObject({ page: 2, total: 21 });
    expect(fetchPort).toHaveBeenCalledWith("/workforce-administration/accounts?page=2&pageSize=20&username=User.One", { credentials: "same-origin", headers: { Accept: "application/json" } });
  });

  it("fails closed on an unknown server-computed account action", async () => {
    const fetchPort = vi.fn().mockResolvedValue(Response.json({ accounts: [{ accountId: "account-1", allowedActions: ["become_super_administrator"], crmAdministrator: false, legalName: "员工", releasablePhones: [], revision: 0, status: "active", username: "user.one" }], departments: [], positions: [] }));
    await expect(createSameSiteWorkforceAdministrationPort(fetchPort).load()).rejects.toThrow("workforce_actions_invalid");
  });

  it("sends password reset with CSRF, idempotency metadata, and an explicit replay result", async () => {
    const fetchPort = vi.fn().mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) })).mockResolvedValueOnce(Response.json({ replayed: false }));
    const command = { accountId: "account-1", expectedRevision: 0, kind: "reset_password" as const, password: "Replacement-password-2!" };
    await expect(createSameSiteWorkforceAdministrationPort(fetchPort).execute(command)).resolves.toEqual({ replayed: false });
    const request = fetchPort.mock.calls[1]?.[1] as RequestInit;
    expect(request.body).toBe(JSON.stringify(command));
    expect((request.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(JSON.stringify(request.headers)).not.toMatch(/Replacement-password/u);
  });

  it("preserves the local password-policy error code", async () => {
    const fetchPort = vi.fn().mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) })).mockResolvedValueOnce(Response.json({ code: "workforce_password_policy_violation" }, { status: 400 }));
    await expect(createSameSiteWorkforceAdministrationPort(fetchPort).execute({ accountId: "account-1", expectedRevision: 0, kind: "reset_password", password: "Test@123456" })).rejects.toThrow("workforce_password_policy_violation");
  });

  it("maps rejected session and reauthentication requests to stable errors", async () => {
    const unavailableSession = vi.fn().mockRejectedValue(new TypeError("network detail"));
    await expect(createSameSiteWorkforceAdministrationPort(unavailableSession).reauthenticate("Current-password-1!")).rejects.toThrow("workforce_session_unavailable");

    const unavailableReauthentication = vi.fn()
      .mockResolvedValueOnce(Response.json({ accountId: "account-1", csrfToken: "c".repeat(32) }))
      .mockRejectedValueOnce(new TypeError("network detail"));
    await expect(createSameSiteWorkforceAdministrationPort(unavailableReauthentication).reauthenticate("Current-password-1!")).rejects.toThrow("workforce_reauthentication_failed");
  });
});
