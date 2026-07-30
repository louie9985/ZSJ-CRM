import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(import.meta.dirname, "../migrations");

describe("E2E durable-store migration", () => {
  it("is versioned, additive, test-scoped, and accompanied by review metadata", async () => {
    const [sql, metadataText] = await Promise.all([
      readFile(resolve(migrationDirectory, "0000000016_e2e_walking_skeleton_durable_stores.sql"), "utf8"),
      readFile(resolve(migrationDirectory, "0000000016_e2e_walking_skeleton_durable_stores.meta.json"), "utf8"),
    ]);
    const metadata = JSON.parse(metadataText) as Readonly<Record<string, unknown>>;

    expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS e2e_walking_skeleton");
    expect(sql).toContain("REVOKE ALL ON SCHEMA e2e_walking_skeleton FROM PUBLIC");
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE)\b/iu);
    expect(metadata).toMatchObject({ destructive: false, moduleOwner: "tests/e2e" });
    expect(metadata["recovery"]).toEqual(expect.any(String));
    expect(metadata["forwardFix"]).toEqual(expect.any(String));
  });
});
