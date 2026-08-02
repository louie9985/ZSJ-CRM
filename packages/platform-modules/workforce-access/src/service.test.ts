import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryWorkforceAccessStore } from "./memory-store.js";
import { WorkforceAccessService } from "./service.js";

const at = "2026-08-02T00:00:00.000Z";
const metadata = (operationId = randomUUID()) => ({ actor: { actorId: "synthetic-admin", actorType: "system" as const }, operationId, reason: "account acceptance fixture", traceId: "trace-account" });
const allow = { authorize: () => Promise.resolve() };

describe("WorkforceAccessService", () => {
  it("normalizes usernames and phones without retaining a password", async () => {
    const service = new WorkforceAccessService(new InMemoryWorkforceAccessStore(), allow);
    const account = await service.createAccount({ ...metadata(), accountId: randomUUID(), createdAt: at, phone: "+86 138-0000-0000", username: "Admin.User" });
    expect(account).toMatchObject({ phone: "+8613800000000", status: "provisioning", usernameNormalized: "admin.user" });
    expect(account).not.toHaveProperty("password");
  });

  it("permanently reserves historical usernames and requires explicit phone release", async () => {
    const service = new WorkforceAccessService(new InMemoryWorkforceAccessStore(), allow);
    const firstId = randomUUID();
    await service.createAccount({ ...metadata(), accountId: firstId, createdAt: at, phone: "13800000000", username: "first.user" });
    const update = { ...metadata(), accountId: firstId, expectedRevision: 0, phone: "13900000000", updatedAt: at, username: "renamed.user" };
    await service.updateLoginIdentifiers(update);
    await expect(service.updateLoginIdentifiers(update)).resolves.toMatchObject({ revision: 1 });
    await expect(service.createAccount({ ...metadata(), accountId: randomUUID(), createdAt: at, username: "FIRST.USER" })).rejects.toMatchObject({ code: "login_identifier_occupied" });
    await expect(service.createAccount({ ...metadata(), accountId: randomUUID(), createdAt: at, phone: "13800000000", username: "second.user" })).rejects.toMatchObject({ code: "login_identifier_occupied" });
    await service.releasePhone({ ...metadata(), accountId: firstId, phone: "13800000000", releasedAt: at });
    await expect(service.createAccount({ ...metadata(), accountId: randomUUID(), createdAt: at, phone: "13800000000", username: "second.user" })).resolves.toMatchObject({ phone: "13800000000" });
  });

  it("enforces revisions, state transitions, authorization, and idempotency", async () => {
    const store = new InMemoryWorkforceAccessStore(); const service = new WorkforceAccessService(store, allow); const accountId = randomUUID(); const operationId = randomUUID();
    const command = { ...metadata(operationId), accountId, createdAt: at, username: "admin-user" };
    await service.createAccount(command); await expect(service.createAccount(command)).resolves.toMatchObject({ accountId });
    await expect(service.setStatus({ ...metadata(), accountId, expectedRevision: 2, status: "credential_pending", updatedAt: at })).rejects.toMatchObject({ code: "revision_conflict" });
    await expect(service.setStatus({ ...metadata(), accountId, expectedRevision: 0, status: "active", updatedAt: at })).rejects.toMatchObject({ code: "state_transition_invalid" });
    const pending = await service.setStatus({ ...metadata(), accountId, expectedRevision: 0, status: "credential_pending", updatedAt: at });
    expect(pending.revision).toBe(1);
    const denied = new WorkforceAccessService(store, { authorize: () => Promise.reject(new Error("denied")) });
    await expect(denied.setStatus({ ...metadata(), accountId, expectedRevision: 1, status: "active", updatedAt: at })).rejects.toThrow("denied");
  });

  it("projects identity synchronization outcomes and permits only controlled retry lineage", async () => {
    const service = new WorkforceAccessService(new InMemoryWorkforceAccessStore(), allow);
    const accountId = randomUUID();
    await service.createAccount({ ...metadata(), accountId, createdAt: at, username: "sync.user" });
    const failedOperationId = randomUUID();
    const pending = await service.beginIdentitySync({ ...metadata(failedOperationId), accountId, action: "synchronize_login_identifiers", requestedAt: at });
    expect(pending).toMatchObject({ accountId, operationId: failedOperationId, status: "pending" });
    expect(await service.getAccount(accountId)).toMatchObject({ latestIdentitySync: { operationId: failedOperationId, status: "pending" } });
    const failed = await service.finishIdentitySync({ ...metadata(failedOperationId), accountId, completedAt: "2026-08-02T00:00:01.000Z", errorCode: "keycloak_administration_unavailable", status: "failed" });
    expect(failed).toMatchObject({ errorCode: "keycloak_administration_unavailable", status: "failed" });
    await expect(service.beginIdentitySync({ ...metadata(failedOperationId), accountId, action: "synchronize_login_identifiers", requestedAt: at })).resolves.toEqual(failed);
    await expect(service.finishIdentitySync({ ...metadata(failedOperationId), accountId, completedAt: "2026-08-02T00:00:02.000Z", errorCode: "keycloak_administration_unavailable", status: "failed" })).resolves.toEqual(failed);
    const retryOperationId = randomUUID();
    const retry = await service.beginIdentitySync({ ...metadata(retryOperationId), accountId, action: "synchronize_login_identifiers", requestedAt: "2026-08-02T00:00:03.000Z", retryOfOperationId: failedOperationId });
    expect(retry).toMatchObject({ retryOfOperationId: failedOperationId, status: "pending" });
    expect(retry).not.toHaveProperty("username");
    expect(retry).not.toHaveProperty("phone");
    await expect(service.beginIdentitySync({ ...metadata(randomUUID()), accountId, action: "disable", requestedAt: "2026-08-02T00:00:04.000Z", retryOfOperationId: failedOperationId })).rejects.toMatchObject({ code: "state_transition_invalid" });
    await expect(service.beginIdentitySync({ ...metadata(randomUUID()), accountId, action: "synchronize_login_identifiers", requestedAt: "2026-08-02T00:00:04.000Z", retryOfOperationId: failedOperationId })).rejects.toMatchObject({ code: "entity_conflict" });
    await expect(service.finishIdentitySync({ ...metadata(retryOperationId), accountId, completedAt: "2026-08-02T00:00:05.000Z", errorCode: "identity_sync_failed", status: "succeeded" })).rejects.toMatchObject({ code: "input_invalid" });
    await service.finishIdentitySync({ ...metadata(retryOperationId), accountId, completedAt: "2026-08-02T00:00:05.000Z", status: "succeeded" });
    expect(await service.getAccount(accountId)).toMatchObject({ latestIdentitySync: { operationId: retryOperationId, status: "succeeded" } });
  });
});
