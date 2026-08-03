import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runMigrations } from "@ai-crm/database";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaWorkforceAccessStore, type WorkforceAccessPersistenceRuntime } from "./postgres-store.js";
import { WorkforceAccessService } from "./service.js";

const urlFile = process.env.TEST_WORKFORCE_ACCESS_DATABASE_URL_FILE;
const suite = describe.skipIf(!urlFile);
suite("PostgreSQL workforce access store", () => {
  let pool: Pool; let runtime: Runtime; let closePool = (): Promise<void> => Promise.resolve();
  beforeAll(async () => {
    if (!urlFile) throw new Error("TEST_WORKFORCE_ACCESS_DATABASE_URL_FILE is required.");
    const connectionString = (await readFile(resolve(urlFile), "utf8")).trim();
    await runMigrations(connectionString, [resolve(import.meta.dirname, "../../../database/migrations"), resolve(import.meta.dirname, "../../organization/migrations"), resolve(import.meta.dirname, "../migrations")]);
    pool = new Pool({ connectionString, max: 3 }); closePool = () => pool.end(); runtime = new Runtime(pool);
  });
  afterAll(() => closePool());
  it("persists identity history, revisions, and idempotent receipts atomically", async () => {
    const service = new WorkforceAccessService(createPrismaWorkforceAccessStore(runtime), { authorize: () => Promise.resolve() });
    const personId = randomUUID(); const at = "2026-08-02T00:00:00.000Z";
    await pool.query("insert into organization.workforce_people (workforce_person_id,recorded_at) values ($1,$2)", [personId, at]);
    const accountId = randomUUID(); const operationId = randomUUID(); const actor = { actorId: "integration", actorType: "system" as const };
    const created = await service.createAccount({ accountId, actor, createdAt: at, operationId, phone: "138-0000-0000", reason: "integration", traceId: "trace-integration", username: "Admin.User", workforcePersonId: personId });
    await expect(service.createAccount({ accountId, actor, createdAt: at, operationId, phone: "138-0000-0000", reason: "integration", traceId: "trace-integration", username: "Admin.User", workforcePersonId: personId })).resolves.toEqual(created);
    await service.updateLoginIdentifiers({ accountId, actor, expectedRevision: 0, operationId: randomUUID(), phone: "13900000000", reason: "integration", traceId: "trace-integration", updatedAt: at });
    const keycloakUserId = randomUUID();
    await service.linkKeycloakUser({ accountId, actor, expectedRevision: 1, keycloakUserId, operationId: randomUUID(), reason: "integration", traceId: "trace-integration", updatedAt: at });
    await expect(service.getSubjectAccountByKeycloakUserId(keycloakUserId)).resolves.toEqual({ keycloakUserId, status: "provisioning", workforcePersonId: personId });
    expect(await service.listIdentifierHistory(accountId)).toHaveLength(3);
    const syncOperationId = randomUUID();
    const syncCommand = { accountId, action: "synchronize_login_identifiers" as const, actor, operationId: syncOperationId, reason: "integration", requestedAt: at, traceId: "trace-integration" };
    await expect(service.beginIdentitySync(syncCommand)).resolves.toMatchObject({ operationId: syncOperationId, status: "pending" });
    await expect(service.beginIdentitySync(syncCommand)).resolves.toMatchObject({ operationId: syncOperationId, status: "pending" });
    await service.finishIdentitySync({ accountId, actor, completedAt: "2026-08-02T00:00:01.000Z", errorCode: "keycloak_administration_unavailable", operationId: syncOperationId, reason: "integration", status: "failed", traceId: "trace-integration" });
    await expect(service.getAccount(accountId)).resolves.toMatchObject({ latestIdentitySync: { errorCode: "keycloak_administration_unavailable", operationId: syncOperationId, status: "failed" } });
    const count = await pool.query<{ count: string }>("select count(*)::text count from workforce_access.operations where account_id=$1", [accountId]);
    expect(count.rows[0]?.count).toBe("3");
  });
});

class Runtime implements WorkforceAccessPersistenceRuntime {
  readonly #context = new AsyncLocalStorage<PoolClient>();
  constructor(private readonly pool: Pool) {}
  async execute<Row>(sql: string, values?: readonly unknown[]) { const result = await (this.#context.getStore() ?? this.pool).query(sql, values as unknown[] | undefined); return { rowCount: result.rowCount ?? 0, rows: result.rows as Row[] }; }
  async withTransaction<T>(work: () => Promise<T>): Promise<T> { const client = await this.pool.connect(); try { await client.query("begin"); const value = await this.#context.run(client, work); await client.query("commit"); return value; } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); } }
}
