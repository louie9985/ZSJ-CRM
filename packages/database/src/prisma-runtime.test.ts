import { describe, expect, it } from "vitest";
import { compileParameterizedSql, DatabasePersistenceError, PrismaDatabaseRuntime } from "./prisma-runtime.js";

const config = {
  applicationName: "ai_crm_test",
  connectionString: "postgresql://user:secret@localhost:5432/test_database",
  connectionTimeoutMs: 1_000,
  idleTimeoutMs: 10_000,
  maxConnections: 4,
  statementTimeoutMs: 5_000,
};

describe("Prisma persistence foundation", () => {
  it("compiles numbered PostgreSQL placeholders without interpolating values into SQL text", () => {
    const query = compileParameterizedSql("select $2::text second, $1::text first, $2::text repeated", ["alpha", "beta"]);
    expect(query.strings).toEqual(["select ", "::text second, ", "::text first, ", "::text repeated"]);
    expect(query.values).toEqual(["beta", "alpha", "beta"]);
  });

  it("fails closed when a placeholder has no separate binding", () => {
    expect(() => compileParameterizedSql("select $2", ["only-one"])).toThrow("SQL placeholder $2 has no binding");
    expect(() => compileParameterizedSql("select $1", ["first", "unexpected"])).toThrow("SQL has 2 bindings but requires 1");
  });

  it("does not treat PostgreSQL literals, comments, or dollar-quoted bodies as parameters", () => {
    const query = compileParameterizedSql("select '$2', E'\\'$8', \"$3\", $tag$ $4 $tag$, /* $5 /* $6 */ */ $1 -- $7\n", ["bound"]);
    expect(query.strings).toEqual(["select '$2', E'\\'$8', \"$3\", $tag$ $4 $tag$, /* $5 /* $6 */ */ ", " -- $7\n"]);
    expect(query.values).toEqual(["bound"]);
  });

  it("exposes a stable PostgreSQL-compatible code without leaking provider details", () => {
    const error = new DatabasePersistenceError("23505");
    expect(error).toMatchObject({ code: "23505", message: "The database operation failed." });
    expect("cause" in error).toBe(false);
  });

  it("normalizes raw-query and transaction provider errors while preserving rollback-only nested work", async () => {
    const client = {
      $disconnect: () => Promise.resolve(),
      $executeRaw: () => Promise.reject(Object.assign(new Error("provider unique violation"), { code: "P2002" })),
      $queryRaw: () => Promise.resolve([]),
      $transaction: <T>(work: (transaction: unknown) => Promise<T>) => work(client),
    };
    const runtime = new PrismaDatabaseRuntime(config, client as never);
    await expect(runtime.execute("insert into test values ($1)", ["synthetic"])).rejects.toMatchObject({ code: "23505", name: "DatabasePersistenceError" });
    await expect(runtime.withTransaction(async () => {
      await runtime.withTransaction(() => runtime.execute("insert into test values ($1)", ["synthetic"])).catch(() => undefined);
      return "incorrect-success";
    })).rejects.toMatchObject({ code: "23505", name: "DatabasePersistenceError" });
  });

  it("executes void-returning advisory locks without asking Prisma to deserialize them", async () => {
    const calls: string[] = [];
    const client = {
      $disconnect: () => Promise.resolve(),
      $executeRaw: () => { calls.push("execute"); return Promise.resolve(1); },
      $queryRaw: () => { calls.push("query"); return Promise.resolve([]); },
      $transaction: <T>(work: (transaction: unknown) => Promise<T>) => work(client),
    };
    const runtime = new PrismaDatabaseRuntime(config, client as never);

    await runtime.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", ["resource"]);
    await runtime.execute("select 1");

    expect(calls).toEqual(["execute", "query"]);
  });

  it("preserves a PostgreSQL SQLSTATE from Prisma raw-query metadata and hides unknown provider errors", async () => {
    const rawError = Object.assign(new Error("provider exclusion detail"), { code: "P2010", meta: { code: "23P01" } });
    const transactionError = Object.assign(new Error("provider transaction detail"), { code: "P2028" });
    const rawClient = {
      $disconnect: () => Promise.resolve(), $executeRaw: () => Promise.reject(rawError), $queryRaw: () => Promise.resolve([]),
      $transaction: <T>(work: (transaction: unknown) => Promise<T>) => work(rawClient),
    };
    const transactionClient = {
      $disconnect: () => Promise.resolve(), $executeRaw: () => Promise.resolve(0), $queryRaw: () => Promise.resolve([]),
      $transaction: () => Promise.reject(transactionError),
    };
    await expect(new PrismaDatabaseRuntime(config, rawClient as never).execute("insert into test values ($1)", ["synthetic"])).rejects.toMatchObject({ code: "23P01", message: "The database operation failed." });
    await expect(new PrismaDatabaseRuntime(config, transactionClient as never).withTransaction(() => Promise.resolve())).rejects.toMatchObject({ code: "database_operation_failed", message: "The database operation failed." });
  });

  it("does not claim active-query AbortSignal interruption support", () => {
    const runtime = new PrismaDatabaseRuntime(config, {
      $disconnect: () => Promise.resolve(), $executeRaw: () => Promise.resolve(0), $queryRaw: () => Promise.resolve([]),
      $transaction: <T>(work: (transaction: unknown) => Promise<T>) => work({}),
    } as never);
    expect(runtime).toMatchObject({ implementation: "prisma", queryInterruptionSupport: false });
    expect("abortSignalSupport" in runtime).toBe(false);
  });
});
