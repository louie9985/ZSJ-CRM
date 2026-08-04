import { describe, expect, it, vi } from "vitest";

import type { DatabaseRuntime } from "@ai-crm/database";
import { createDurableAdministrationOperationPort } from "./durable-operation.js";

const operationId = "40000000-0000-4000-8000-000000000001";
const traceId = "1".repeat(32);

describe("durable administration operation", () => {
  it("commits business work and the successful operation result in one ambient transaction", async () => {
    const statements: string[] = [];
    const transactionDepths: number[] = [];
    let depth = 0;
    const database = {
      execute: vi.fn((sql: string) => {
        statements.push(sql);
        if (sql.startsWith("insert into workforce_access.operations")) return Promise.resolve({ rowCount: 1, rows: [] });
        return Promise.resolve({ rowCount: 1, rows: [] });
      }),
      withTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
        depth += 1;
        transactionDepths.push(depth);
        try { return await work(); }
        finally { depth -= 1; }
      },
    };
    const businessWork = vi.fn(() => {
      expect(depth).toBe(1);
      return Promise.resolve(Object.freeze({ credentialRedirectUrl: "/credential/continue" }));
    });

    await expect(createDurableAdministrationOperationPort(database).execute({ fingerprint: "a".repeat(64), operationId, traceId }, businessWork))
      .resolves.toEqual({ replayed: false, value: { credentialRedirectUrl: "/credential/continue" } });

    expect(transactionDepths).toEqual([1]);
    expect(businessWork).toHaveBeenCalledOnce();
    expect(statements.at(-1)).toContain("status='succeeded'");
  });

  it("records a stable failure only after the business transaction rolls back", async () => {
    const statements: string[] = [];
    let transaction = 0;
    const database = {
      execute: vi.fn((sql: string) => {
        statements.push(sql);
        if (sql.startsWith("insert into workforce_access.operations")) return Promise.resolve({ rowCount: 1, rows: [] });
        return Promise.resolve({ rowCount: 1, rows: [] });
      }),
      withTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
        transaction += 1;
        return work();
      },
    };

    await expect(createDurableAdministrationOperationPort(database).execute(
      { fingerprint: "b".repeat(64), operationId, traceId },
      () => Promise.reject(new Error("synthetic_failure")),
    )).rejects.toThrow("synthetic_failure");

    expect(transaction).toBe(1);
    expect(statements.at(-1)).toContain("status='failed'");
    expect(statements.some((sql) => sql.includes("status='succeeded'"))).toBe(false);
  });

  it("serializes the same operation so concurrent callers execute business work once", async () => {
    let transactionTail = Promise.resolve();
    let row: { fingerprint: string; result: unknown; status: "failed" | "pending" | "succeeded" } | undefined;
    const execute = <Row>(sql: string, parameters?: readonly unknown[]): Promise<Readonly<{ rowCount: number; rows: readonly Row[] }>> => {
        if (sql.startsWith("insert into workforce_access.operations") && sql.includes("'pending'")) {
          if (row !== undefined) return Promise.resolve({ rowCount: 0, rows: [] });
          row = { fingerprint: parameters?.[1] as string, result: null, status: "pending" };
          return Promise.resolve({ rowCount: 1, rows: [] });
        }
        if (sql.startsWith("select fingerprint")) return Promise.resolve({ rowCount: row === undefined ? 0 : 1, rows: (row === undefined ? [] : [row]) as unknown as readonly Row[] });
        if (sql.includes("status='succeeded'")) row = { fingerprint: row?.fingerprint ?? "", result: JSON.parse(parameters?.[1] as string), status: "succeeded" };
        return Promise.resolve({ rowCount: 1, rows: [] });
      };
    const database: Pick<DatabaseRuntime, "execute" | "withTransaction"> = {
      execute,
      withTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
        const previous = transactionTail;
        let releaseTransaction = (): void => undefined;
        transactionTail = new Promise<void>((resolve) => { releaseTransaction = resolve; });
        await previous;
        try { return await work(); }
        finally { releaseTransaction(); }
      },
    };
    const businessWork = vi.fn(() => Promise.resolve({ credentialRedirectUrl: "/credential/continue" }));
    const port = createDurableAdministrationOperationPort(database);

    const [first, second] = await Promise.all([
      port.execute({ fingerprint: "c".repeat(64), operationId, traceId }, businessWork),
      port.execute({ fingerprint: "c".repeat(64), operationId, traceId }, businessWork),
    ]);

    expect(businessWork).toHaveBeenCalledOnce();
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
  });
});
