import { describe, expect, it, vi } from "vitest";

import { createKeycloakAdministrationPorts } from "./keycloak-administration.js";

const userId = "30000000-0000-4000-8000-000000000001";
const accountId = "20000000-0000-4000-8000-000000000001";
const operationId = "40000000-0000-4000-8000-000000000001";

function options(fetchPort: (input: string, init?: RequestInit) => Promise<Response>) {
  return {
    adminBaseUrl: "http://127.0.0.1:8080",
    clientId: "ai-crm-workforce-provisioner",
    clientSecret: "s".repeat(43),
    fetch: fetchPort,
    publicRealmBasePath: "/realms/ai-crm-dev",
    realm: "ai-crm-dev",
    returnUri: "http://127.0.0.1:8088/workforce-administration/credential-callback",
    timeoutMs: 1_000,
  };
}

const token = (): Response => Response.json({ access_token: "t".repeat(64) });

describe("Keycloak workforce administration adapter", () => {
  it("creates a disabled account without a password", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(undefined, { headers: { location: `http://keycloak/admin/realms/ai-crm-dev/users/${userId}` }, status: 201 }));
    const ports = createKeycloakAdministrationPorts(options(fetchPort));
    await expect(ports.identity.createDisabledAccount({ accountId, operationId, phone: "+8613800000000", traceId: "1".repeat(32), username: "employee.one" })).resolves.toEqual({ keycloakUserId: userId });
    const request = fetchPort.mock.calls[3]?.[1] as RequestInit | undefined;
    expect(request?.method).toBe("POST");
    expect(request?.body).toContain('"enabled":false');
    expect(request?.body).not.toContain("password");
  });

  it("replays a matching disabled Keycloak user without creating a duplicate", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(Response.json([{ attributes: { ai_crm_account_id: [accountId], phone_login_key: ["+8613800000000"] }, enabled: false, id: userId, username: "employee.one" }]));
    const ports = createKeycloakAdministrationPorts(options(fetchPort));
    await expect(ports.identity.createDisabledAccount({ accountId, operationId, phone: "+8613800000000", traceId: "1".repeat(32), username: "employee.one" })).resolves.toEqual({ keycloakUserId: userId });
    expect(fetchPort).toHaveBeenCalledTimes(2);
  });

  it("binds a short-lived ceremony to the target and operator using only a digest", async () => {
    const fetchPort = vi.fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(Response.json({ attributes: { ai_crm_account_id: [accountId] }, enabled: false, id: userId, username: "employee.one" }))
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(undefined, { status: 204 }));
    const ports = createKeycloakAdministrationPorts(options(fetchPort));
    const result = await ports.credentialCeremonies.start({ accountId, keycloakUserId: userId, kind: "create", operationId, operatorSubjectId: "operator-subject", traceId: "1".repeat(32) });
    expect(result.redirectUrl).toMatch(/^\/realms\/ai-crm-dev\/ai-crm-credential-ceremony\//u);
    const ceremony = new URL(result.redirectUrl, "http://127.0.0.1").searchParams.get("ceremony");
    expect(ceremony).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const request = fetchPort.mock.calls[3]?.[1] as RequestInit | undefined;
    const body = typeof request?.body === "string" ? request.body : "";
    expect(body).toContain("ai_crm_credential_secret_hash");
    expect(body).not.toContain(ceremony ?? "missing");
    expect(body).not.toContain("password");
  });

  it("fails closed when Keycloak token acquisition fails", async () => {
    const ports = createKeycloakAdministrationPorts(options(vi.fn().mockResolvedValue(new Response(undefined, { status: 503 }))));
    await expect(ports.identity.revokeSessions({ accountId, keycloakUserId: userId, operationId, traceId: "1".repeat(32) })).rejects.toThrow("keycloak_administration_unavailable");
  });
});
