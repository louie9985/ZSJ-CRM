import { describe, expect, it, vi } from "vitest";

import { createDurableIdentityAdministrationPort } from "./durable-identity.js";

const accountId = "20000000-0000-4000-8000-000000000001";
const keycloakUserId = "30000000-0000-4000-8000-000000000001";
const operationId = "40000000-0000-4000-8000-000000000001";
const traceId = "1".repeat(32);

describe("durable workforce identity administration", () => {
  it("keeps disabled user creation synchronous and submits stable trace-linked synchronization jobs", async () => {
    const createDisabledAccount = vi.fn(() => Promise.resolve({ keycloakUserId }));
    const submitJob = vi.fn((envelope: unknown) => { void envelope; return Promise.resolve({ jobId: operationId, status: "queued" as const }); });
    const port = createDurableIdentityAdministrationPort({ clock: () => new Date("2026-08-02T00:00:00.000Z"), direct: { createDisabledAccount }, eventing: { submitJob } });

    await expect(port.createDisabledAccount({ accountId, operationId, traceId, username: "employee.one" })).resolves.toEqual({ keycloakUserId });
    expect(submitJob).not.toHaveBeenCalled();

    await port.synchronizeLoginIdentifiers({ accountId, keycloakUserId, operationId, phone: "+8613800000000", traceId, username: "employee.one" });
    expect(submitJob).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: operationId,
      idempotencyKey: `workforce-keycloak-sync/${operationId}`,
      jobId: operationId,
      jobType: "workforce-access.keycloak-sync.v1",
      requestedAt: "2026-08-02T00:00:00.000Z",
      payload: { accountId, action: "synchronize_login_identifiers", keycloakUserId, operationId, phone: "+8613800000000", username: "employee.one" },
    }));
    const submitted: unknown = submitJob.mock.calls[0]?.[0];
    expect(typeof submitted === "object" && submitted !== null ? Reflect.get(submitted, "traceparent") : undefined).toMatch(/^00-1{32}-[0-9a-f]{16}-01$/u);
  });

  it("uses separate idempotent jobs for disabling and revoking sessions", async () => {
    const submitJob = vi.fn((envelope: unknown) => { void envelope; return Promise.resolve({ jobId: operationId, status: "queued" as const }); });
    const port = createDurableIdentityAdministrationPort({ direct: { createDisabledAccount: vi.fn() }, eventing: { submitJob } });
    await port.disableAccount({ accountId, keycloakUserId, operationId, traceId });
    await port.revokeSessions({ accountId, keycloakUserId, operationId, traceId });
    expect(submitJob.mock.calls.map(([envelope]) => (envelope as { payload: { action: string } }).payload.action)).toEqual(["disable", "revoke_sessions"]);
  });

  it("links a controlled retry to the failed identity operation without reusing its Job ID", async () => {
    const submitJob = vi.fn((envelope: unknown) => { void envelope; return Promise.resolve({ jobId: operationId, status: "queued" as const }); });
    const port = createDurableIdentityAdministrationPort({ direct: { createDisabledAccount: vi.fn() }, eventing: { submitJob } });
    const failedOperationId = "40000000-0000-4000-8000-000000000002";
    await port.disableAccount({ accountId, keycloakUserId, operationId, retryOfOperationId: failedOperationId, traceId });
    const submitted = submitJob.mock.calls[0]?.[0] as { readonly jobId: string; readonly payload: Readonly<Record<string, unknown>> } | undefined;
    expect(submitted?.jobId).toBe(operationId);
    expect(submitted?.payload).toMatchObject({ operationId, retryOfOperationId: failedOperationId });
  });
});
