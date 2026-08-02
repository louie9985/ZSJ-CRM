import { describe, expect, it, vi } from "vitest";

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

    expect(transactionDepths).toEqual([1, 1]);
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

    expect(transaction).toBe(2);
    expect(statements.at(-1)).toContain("status='failed'");
    expect(statements.some((sql) => sql.includes("status='succeeded'"))).toBe(false);
  });
});
