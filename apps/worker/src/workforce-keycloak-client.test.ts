import { describe, expect, it, vi } from "vitest";

import { createWorkforceKeycloakClient, WorkforceKeycloakClientError } from "./workforce-keycloak-client.js";

const accountId = "20000000-0000-4000-8000-000000000001";
const keycloakUserId = "30000000-0000-4000-8000-000000000001";
const operationId = "40000000-0000-4000-8000-000000000001";
const traceId = "1".repeat(32);
const token = () => Response.json({ access_token: "t".repeat(64) });

const options = (fetchPort: (input: string, init?: RequestInit) => Promise<Response>) => ({ adminBaseUrl: "http://127.0.0.1:8080", clientId: "ai-crm-workforce-sync-worker", clientSecret: "s".repeat(43), fetch: fetchPort, realm: "ai-crm-dev", timeoutMs: 1_000 });

describe("Worker Keycloak client", () => {
  it("disables with a minimal representation and revokes sessions", async () => {
    const fetchPort = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(undefined, { status: 204 })).mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(undefined, { status: 204 }));
    const client = createWorkforceKeycloakClient(options(fetchPort));
    const common = { accountId, keycloakUserId, operationId, traceId };
    await client.disable(common, new AbortController().signal);
    expect(fetchPort.mock.calls[1]?.[1]).toMatchObject({ body: "{\"enabled\":false}", method: "PUT" });
    expect(fetchPort.mock.calls[3]?.[1]).toMatchObject({ method: "POST" });
  });

  it("preserves provider attributes while synchronizing only reviewed identifiers", async () => {
    const fetchPort = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(Response.json({ attributes: { retained: ["yes"] }, username: "old" })).mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(undefined, { status: 204 }));
    const client = createWorkforceKeycloakClient(options(fetchPort));
    await client.synchronizeLoginIdentifiers({ accountId, keycloakUserId, operationId, phone: "+8613800000000", traceId, username: "employee.one" }, new AbortController().signal);
    const requestBody = (fetchPort.mock.calls[3]?.[1] as RequestInit | undefined)?.body;
    if (typeof requestBody !== "string") throw new Error("expected_string_body");
    const body = requestBody;
    expect(JSON.parse(body)).toEqual({ attributes: { retained: ["yes"], ai_crm_account_id: [accountId], phone_login_key: ["+8613800000000"] }, username: "employee.one" });
  });

  it("classifies only transient provider responses as retryable without exposing provider bodies", async () => {
    const unavailable = createWorkforceKeycloakClient(options(vi.fn().mockResolvedValue(new Response("provider secret", { status: 503 }))));
    await expect(unavailable.disable({ accountId, keycloakUserId, operationId, traceId }, new AbortController().signal))
      .rejects.toEqual(expect.objectContaining({ code: "keycloak_administration_unavailable", retryable: true }));

    const denied = createWorkforceKeycloakClient(options(vi.fn().mockResolvedValue(new Response("provider secret", { status: 401 }))));
    await expect(denied.disable({ accountId, keycloakUserId, operationId, traceId }, new AbortController().signal))
      .rejects.toEqual(expect.objectContaining({ code: "keycloak_administration_unavailable", retryable: false }));

    expect(new WorkforceKeycloakClientError("keycloak_administration_unavailable", true).message).not.toContain("provider secret");
  });
});
