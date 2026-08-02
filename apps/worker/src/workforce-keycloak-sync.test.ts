import { EventingError, type ValidatedMessage } from "@ai-crm/platform-eventing-outbox";
import type { FinishIdentitySyncCommand } from "@ai-crm/platform-workforce-access";
import { describe, expect, it, vi } from "vitest";

import { WorkforceKeycloakClientError } from "./workforce-keycloak-client.js";
import { classifyWorkforceKeycloakSyncError, createWorkforceKeycloakSyncMessageHandler, createWorkforceKeycloakSyncRabbitBinding } from "./workforce-keycloak-sync.js";

const accountId = "20000000-0000-4000-8000-000000000001";
const operationId = "40000000-0000-4000-8000-000000000001";
const keycloakUserId = "30000000-0000-4000-8000-000000000001";

function message(action: string, extra: Record<string, unknown> = {}): ValidatedMessage {
  const envelope = { jobId: operationId, jobType: "workforce-access.keycloak-sync.v1", jobVersion: 1, source: "urn:ai-crm:workforce-access", idempotencyKey: `workforce-keycloak-sync/${operationId}`, requestedAt: "2026-08-02T00:00:00.000Z", correlationId: operationId, policy: { maxAttempts: 3, backoffSeconds: [5, 30], timeoutMs: 10000, failureDisposition: "isolate" }, payload: { accountId, action, keycloakUserId, operationId, ...extra }, traceparent: `00-${"1".repeat(32)}-${"2".repeat(16)}-01` } as const;
  return { availableAt: new Date(envelope.requestedAt), correlationId: operationId, envelope, messageId: operationId, messageKind: "job", messageType: envelope.jobType, messageVersion: 1, occurredAt: new Date(envelope.requestedAt), payloadSha256: "a".repeat(64), producer: envelope.source, serialized: JSON.stringify(envelope), traceparent: envelope.traceparent };
}

const account = (overrides: Record<string, unknown> = {}) => ({ accountId, createdAt: "2026-08-02T00:00:00.000Z", keycloakUserId, revision: 1, status: "active" as const, updatedAt: "2026-08-02T00:00:00.000Z", username: "employee.one", usernameNormalized: "employee.one", workforcePersonId: "50000000-0000-4000-8000-000000000001", ...overrides });

describe("workforce Keycloak sync job", () => {
  it("rechecks authoritative identifiers before synchronizing and propagates the trace", async () => {
    const synchronizeLoginIdentifiers = vi.fn(() => Promise.resolve());
    const revokeSessions = vi.fn(() => Promise.resolve());
    const handler = createWorkforceKeycloakSyncMessageHandler({ getAccount: vi.fn(() => Promise.resolve(account({ phone: "+8613800000000" }))) }, { disable: vi.fn(), revokeSessions, synchronizeLoginIdentifiers });
    const job = message("synchronize_login_identifiers", { phone: "+8613800000000", username: "employee.one" });
    await expect(handler.recheckAuthoritativeState?.(job, new AbortController().signal)).resolves.toBe(true);
    await handler.handle(job, new AbortController().signal);
    expect(synchronizeLoginIdentifiers).toHaveBeenCalledWith(expect.objectContaining({ accountId, operationId, traceId: "1".repeat(32) }), expect.any(AbortSignal));
    expect(revokeSessions).toHaveBeenCalledWith(expect.objectContaining({ accountId, operationId }), expect.any(AbortSignal));
  });

  it("disables the identity before revoking all sessions in the same retryable job", async () => {
    const order: string[] = [];
    const handler = createWorkforceKeycloakSyncMessageHandler({ getAccount: vi.fn(() => Promise.resolve(account({ status: "disabled" }))) }, {
      disable: vi.fn(() => { order.push("disable"); return Promise.resolve(); }),
      revokeSessions: vi.fn(() => { order.push("revoke"); return Promise.resolve(); }),
      synchronizeLoginIdentifiers: vi.fn(),
    });
    const job = message("disable");
    await expect(handler.recheckAuthoritativeState?.(job, new AbortController().signal)).resolves.toBe(true);
    await handler.handle(job, new AbortController().signal);
    expect(order).toEqual(["disable", "revoke"]);
  });

  it("rejects a stale job and accepts disable only after local access is closed", async () => {
    const getAccount = vi.fn(() => Promise.resolve(account({ phone: "+8613900000000" })));
    const handler = createWorkforceKeycloakSyncMessageHandler({ getAccount }, { disable: vi.fn(), revokeSessions: vi.fn(), synchronizeLoginIdentifiers: vi.fn() });
    await expect(handler.recheckAuthoritativeState?.(message("synchronize_login_identifiers", { phone: "+8613800000000", username: "employee.one" }), new AbortController().signal)).resolves.toBe(false);
    await expect(handler.recheckAuthoritativeState?.(message("disable"), new AbortController().signal)).resolves.toBe(false);
    getAccount.mockResolvedValue(account({ status: "disabled" }));
    await expect(handler.recheckAuthoritativeState?.(message("disable"), new AbortController().signal)).resolves.toBe(true);
    await expect(handler.recheckAuthoritativeState?.(message("revoke_sessions"), new AbortController().signal)).resolves.toBe(true);
  });

  it("retries only transient Keycloak and Eventing failures", () => {
    expect(classifyWorkforceKeycloakSyncError(new WorkforceKeycloakClientError("keycloak_administration_unavailable", true))).toBe("retryable");
    expect(classifyWorkforceKeycloakSyncError(new WorkforceKeycloakClientError("entity_conflict", false))).toBe("terminal");
    expect(classifyWorkforceKeycloakSyncError(new EventingError("eventing_handler_timeout", true))).toBe("retryable");
    expect(classifyWorkforceKeycloakSyncError(new EventingError("eventing_invalid_input", true))).toBe("terminal");
    expect(classifyWorkforceKeycloakSyncError(new Error("unknown"))).toBe("terminal");
  });

  it("records durable success, supersession, and terminal failure before acknowledging delivery", async () => {
    const finishIdentitySync = vi.fn((command: FinishIdentitySyncCommand) => Promise.resolve({
      accountId,
      action: "disable" as const,
      completedAt: command.completedAt,
      ...(command.errorCode === undefined ? {} : { errorCode: command.errorCode }),
      operationId,
      requestedAt: "2026-08-02T00:00:00.000Z",
      status: command.status,
      traceId: "1".repeat(32),
    }));
    const accounts = {
      finishIdentitySync,
      getAccount: vi.fn(() => Promise.resolve(account())),
      getIdentitySyncOperation: vi.fn(() => Promise.resolve({ accountId, action: "disable" as const, operationId, requestedAt: "2026-08-02T00:00:00.000Z", status: "pending" as const, traceId: "1".repeat(32) })),
    };
    const binding = createWorkforceKeycloakSyncRabbitBinding(accounts, { disable: vi.fn(), revokeSessions: vi.fn(), synchronizeLoginIdentifiers: vi.fn() }, () => new Date("2026-08-02T00:00:05.000Z"));

    await binding.onConsumed?.({ attempt: 1, messageId: operationId, messageKind: "job", result: { status: "completed" } });
    await binding.onConsumed?.({ attempt: 1, messageId: operationId, messageKind: "job", result: { reason: "authoritative_state_rejected", status: "skipped" } });
    await binding.onIsolated?.({ attempt: 3, category: "attempts_exhausted", jobId: operationId });

    expect(finishIdentitySync).toHaveBeenNthCalledWith(1, expect.objectContaining({ accountId, completedAt: "2026-08-02T00:00:05.000Z", operationId, status: "succeeded", traceId: "1".repeat(32) }));
    expect(finishIdentitySync).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: "superseded" }));
    expect(finishIdentitySync).toHaveBeenNthCalledWith(3, expect.objectContaining({ errorCode: "eventing_handler_timeout", status: "failed" }));
    expect(JSON.stringify(finishIdentitySync.mock.calls)).not.toMatch(/employee\.one|8613|keycloakUserId/iu);
  });

  it("does not swallow a durable result write failure", async () => {
    const accounts = {
      finishIdentitySync: vi.fn(() => Promise.reject(new Error("database unavailable"))),
      getAccount: vi.fn(() => Promise.resolve(account())),
      getIdentitySyncOperation: vi.fn(() => Promise.resolve({ accountId, action: "disable" as const, operationId, requestedAt: "2026-08-02T00:00:00.000Z", status: "pending" as const, traceId: "1".repeat(32) })),
    };
    const binding = createWorkforceKeycloakSyncRabbitBinding(accounts, { disable: vi.fn(), revokeSessions: vi.fn(), synchronizeLoginIdentifiers: vi.fn() });
    await expect(binding.onIsolated?.({ attempt: 3, category: "terminal_failure", jobId: operationId })).rejects.toThrow("database unavailable");
  });
});
