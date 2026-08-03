import { describe, expect, it, vi } from "vitest";
import { createSameSiteWorkforceAdministrationPort } from "./same-site-workforce-administration-port";

describe("same-site workforce administration port", () => {
  it("starts a CSRF-bound reauthentication and follows only the returned redirect", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "c".repeat(32) }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(Response.json({ redirectUrl: "https://identity.example.test/authorize?prompt=login" }));
    const navigate = vi.fn();
    await createSameSiteWorkforceAdministrationPort(fetchPort, navigate).beginSystemAccountReauthentication?.();
    expect(fetchPort).toHaveBeenNthCalledWith(2, "/auth/pc/reauthentication?returnTo=%2Fcrm%2Fworkforce-administration", expect.objectContaining({
      headers: { Accept: "application/json", "X-CSRF-Token": "c".repeat(32) }, method: "POST",
    }));
    expect(navigate).toHaveBeenCalledWith("https://identity.example.test/authorize?prompt=login");
  });

  it("loads a bounded management snapshot", async () => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accounts: [{ accountId: "account-1", allowedActions: ["release_phone", "retry_identity_sync"], crmAdministrator: false, latestIdentitySync: { action: "synchronize_login_identifiers", completedAt: "2026-08-02T00:00:05.000Z", errorCode: "keycloak_administration_unavailable", operationId: "40000000-0000-4000-8000-000000000001", requestedAt: "2026-08-02T00:00:00.000Z", status: "failed" }, legalName: "员工", releasablePhones: ["+8613700000000"], revision: 0, status: "active", username: "user.one" }],
      departments: [{ allowedActions: [], departmentId: "department-1", name: "AI应用部", revision: 0, status: "active" }],
      positions: [{ allowedActions: [], departmentId: "department-1", name: "系统管理岗", positionId: "position-1", revision: 0, status: "active" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(createSameSiteWorkforceAdministrationPort(fetchPort).load()).resolves.toMatchObject({ accounts: [{ latestIdentitySync: { errorCode: "keycloak_administration_unavailable", status: "failed" }, releasablePhones: ["+8613700000000"], username: "user.one" }], departments: [{ name: "AI应用部" }], positions: [{ name: "系统管理岗" }] });
  });

  it("encodes server-side account filters and validates the paged response", async () => {
    const fetchPort = vi.fn().mockResolvedValue(Response.json({
      items: [{ accountId: "account-1", allowedActions: ["edit"], crmAdministrator: true, departmentId: "department-1", departmentName: "AI应用部", legalName: "员工", phone: "+8613700000000", positionId: "position-1", positionName: "系统管理岗", releasablePhones: [], revision: 3, status: "active", username: "user.one" }],
      page: 2,
      pageSize: 20,
      total: 21,
    }));

    await expect(createSameSiteWorkforceAdministrationPort(fetchPort).listAccounts({
      departmentId: "department-1",
      legalName: "员工 一",
      page: 2,
      pageSize: 20,
      phone: "+86137",
      positionId: "position-1",
      status: "active",
      username: "User.One",
    })).resolves.toMatchObject({ items: [{ crmAdministrator: true, username: "user.one" }], page: 2, pageSize: 20, total: 21 });

    expect(fetchPort).toHaveBeenCalledWith(
      "/workforce-administration/accounts?page=2&pageSize=20&departmentId=department-1&legalName=%E5%91%98%E5%B7%A5+%E4%B8%80&phone=%2B86137&positionId=position-1&status=active&username=User.One",
      { credentials: "same-origin", headers: { Accept: "application/json" } },
    );
  });

  it("fails closed on an unknown server-computed account action", async () => {
    const fetchPort = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accounts: [{ accountId: "account-1", allowedActions: ["become_super_administrator"], crmAdministrator: false, legalName: "员工", releasablePhones: [], revision: 0, status: "active", username: "user.one" }],
      departments: [], positions: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(createSameSiteWorkforceAdministrationPort(fetchPort).load()).rejects.toThrow("workforce_actions_invalid");
  });

  it("gets CSRF before sending a password-free command", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "c".repeat(32) }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ credentialRedirectUrl: "/auth/credential-ceremony/opaque", replayed: false }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await createSameSiteWorkforceAdministrationPort(fetchPort).execute({ accountId: "account-1", expectedRevision: 0, kind: "reset_password" });
    expect(result).toEqual({ credentialRedirectUrl: "/auth/credential-ceremony/opaque" });
    const request = fetchPort.mock.calls[1]?.[1] as RequestInit;
    expect(request.body).toBe(JSON.stringify({ accountId: "account-1", expectedRevision: 0, kind: "reset_password" }));
    if (typeof request.body !== "string") throw new Error("string_body_expected");
    const body: unknown = JSON.parse(request.body);
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("temporaryPassword");
  });

  it("sends an explicitly selected historical phone with revision and fresh idempotency metadata", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "c".repeat(32) }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ replayed: false }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await createSameSiteWorkforceAdministrationPort(fetchPort).execute({ accountId: "account-1", expectedRevision: 7, kind: "release_phone", phone: "+8613700000000" });
    const request = fetchPort.mock.calls[1]?.[1] as RequestInit;
    expect(request.body).toBe(JSON.stringify({ accountId: "account-1", expectedRevision: 7, kind: "release_phone", phone: "+8613700000000" }));
    expect((request.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("retries only by failed operation reference without resubmitting identity data", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) }))
      .mockResolvedValueOnce(Response.json({ replayed: false }));
    const command = { accountId: "10000000-0000-4000-8000-000000000001", expectedRevision: 7, failedOperationId: "40000000-0000-4000-8000-000000000001", kind: "retry_identity_sync" as const };
    await createSameSiteWorkforceAdministrationPort(fetchPort).execute(command);
    const request = fetchPort.mock.calls[1]?.[1] as RequestInit;
    expect(request.body).toBe(JSON.stringify(command));
    expect(request.body).not.toMatch(/username|phone|keycloak/iu);
  });
});
