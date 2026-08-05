import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { InMemoryWorkforceAccessStore } from "./memory-store.js";
import { WorkforceAccessService } from "./service.js";

const at = "2026-08-04T00:00:00.000Z";
const metadata = () => ({ actor: { actorId: randomUUID(), actorType: "system" as const }, operationId: randomUUID(), reason: "test", traceId: "0123456789abcdef0123456789abcdef" });

describe("workforce account directory", () => {
  it("creates an active account directly linked to one workforce person", async () => {
    const service = new WorkforceAccessService(new InMemoryWorkforceAccessStore(), { authorize: () => Promise.resolve() });
    const account = await service.createAccount({ ...metadata(), accountId: randomUUID(), createdAt: at, phone: "+8613800000000", username: "User.One", workforcePersonId: randomUUID() });
    expect(account).toMatchObject({ securityRevision: 0, status: "active", usernameNormalized: "user.one" });
    await expect(service.listIdentifierHistory(account.accountId)).resolves.toHaveLength(2);
  });

  it("supports only active and disabled state without intermediate provisioning", async () => {
    const service = new WorkforceAccessService(new InMemoryWorkforceAccessStore(), { authorize: () => Promise.resolve() });
    const created = await service.createAccount({ ...metadata(), accountId: randomUUID(), createdAt: at, username: "user.two", workforcePersonId: randomUUID() });
    const disabled = await service.setStatus({ ...metadata(), accountId: created.accountId, expectedRevision: 0, status: "disabled", updatedAt: at });
    expect(disabled).toMatchObject({ revision: 1, status: "disabled" });
  });

  it("replays an identifier update with the same command fingerprint after state changes", async () => {
    const service = new WorkforceAccessService(new InMemoryWorkforceAccessStore(), { authorize: () => Promise.resolve() });
    const created = await service.createAccount({ ...metadata(), accountId: randomUUID(), createdAt: at, username: "user.old", workforcePersonId: randomUUID() });
    const command = { ...metadata(), accountId: created.accountId, expectedRevision: 0, updatedAt: at, username: "user.new" };
    const first = await service.updateLoginIdentifiers(command);
    const replay = await service.updateLoginIdentifiers(command);
    expect(first).toEqual(replay);
    expect(replay).toMatchObject({ revision: 1, username: "user.new" });
  });
});
