import { describe, expect, it, vi } from "vitest";
import type { DatabaseRuntime } from "@ai-crm/database";

import { createPasswordCredentialPort, DUMMY_PASSWORD_HASH, hashPassword, validatePassword, verifyPassword, verifyPasswordOrDummy } from "./password-credentials.js";

describe("local password credentials", () => {
  it("hashes and verifies with the fixed Argon2id parameters", async () => {
    const encoded = await hashPassword("Correct Horse 9!");
    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/u);
    await expect(verifyPassword(encoded, "Correct Horse 9!")).resolves.toBe(true);
    await expect(verifyPassword(encoded, "wrong-password")).resolves.toBe(false);
  });

  it("runs the dummy verification path for a missing account", async () => {
    await expect(verifyPasswordOrDummy(undefined, "unknown-password")).resolves.toBe(false);
    await expect(verifyPassword(DUMMY_PASSWORD_HASH, "unknown-password")).resolves.toBe(false);
  });

  it("accepts only 8-64 printable ASCII characters", () => {
    expect(() => { validatePassword("12345678"); }).not.toThrow();
    expect(() => { validatePassword("short"); }).toThrow("input_invalid");
    expect(() => { validatePassword("password\n"); }).toThrow("input_invalid");
    expect(() => { validatePassword("密碼12345678"); }).toThrow("input_invalid");
  });

  it("replaces the hash and increments securityRevision in one transaction", async () => {
    let depth = 0;
    const execute = vi.fn((sql: string) => {
      expect(depth).toBe(1);
      if (sql.startsWith("update workforce_access.accounts")) return Promise.resolve({ rowCount: 1, rows: [{ security_revision: 3 }] });
      return Promise.resolve({ rowCount: 1, rows: [] });
    });
    const database = {
      execute,
      withTransaction: async <T>(work: () => Promise<T>) => { depth += 1; try { return await work(); } finally { depth -= 1; } },
    } as unknown as Pick<DatabaseRuntime, "execute" | "withTransaction">;
    const port = createPasswordCredentialPort(database);
    const passwordHash = await hashPassword("Replacement-password-1!");
    await expect(port.replace({ accountId: "10000000-0000-4000-8000-000000000001", expectedSecurityRevision: 2, passwordHash, updatedAt: "2026-08-04T00:00:00.000Z" }))
      .resolves.toEqual({ securityRevision: 3 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("resolves a numeric username when no phone identifier matches", async () => {
    const row = { account_id: "10000000-0000-4000-8000-000000000001", password_hash: DUMMY_PASSWORD_HASH, security_revision: 0, status: "active" as const, workforce_person_id: "10000000-0000-4000-8000-000000000002" };
    const execute = vi.fn((_sql: string, values: readonly unknown[]) => Promise.resolve({ rowCount: values[0] === "username" ? 1 : 0, rows: values[0] === "username" ? [row] : [] }));
    const port = createPasswordCredentialPort({ execute, withTransaction: vi.fn() } as unknown as Pick<DatabaseRuntime, "execute" | "withTransaction">);
    await expect(port.findByIdentifier("123456")).resolves.toMatchObject({ accountId: row.account_id });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
