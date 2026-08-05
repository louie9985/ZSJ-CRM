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

  it("adds submission, W3C trace, and durable Audit evidence without storing submitted bodies", async () => {
    const [sql, metadataText] = await Promise.all([
      readFile(resolve(migrationDirectory, "0000000017_e2e_submission_trace_audit_evidence.sql"), "utf8"),
      readFile(resolve(migrationDirectory, "0000000017_e2e_submission_trace_audit_evidence.meta.json"), "utf8"),
    ]);
    const metadata = JSON.parse(metadataText) as Readonly<Record<string, unknown>>;

    expect(sql).toContain("CREATE TABLE e2e_walking_skeleton.form_submissions");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON audit.operation_receipts");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON crm_task_center.task_projections, crm_task_center.task_commands");
    expect(sql).toContain("GRANT DELETE ON crm_task_center.task_commands");
    expect(sql).toContain("substring(traceparent FROM 4 FOR 32) = trace_id");
    expect(sql).toContain("substring(traceparent FROM 37 FOR 16) <> repeat('0', 16)");
    expect(sql).not.toContain("substring(traceparent FROM 4 FOR 32) <> trace_id");
    expect(sql).not.toContain("substring(traceparent FROM 37 FOR 16) = repeat('0', 16)");
    const validTrace = (traceId: string, traceparent: string): boolean => /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u.test(traceparent)
      && traceId !== "0".repeat(32)
      && traceparent.slice(3, 35) === traceId
      && traceparent.slice(36, 52) !== "0".repeat(16);
    expect(validTrace("4bf92f3577b34da6a3ce929d0e0e4736", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBe(true);
    expect(validTrace("abcdefabcdefabcdefabcdefabcdefab", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBe(false);
    expect(validTrace("4bf92f3577b34da6a3ce929d0e0e4736", "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01")).toBe(false);
    expect(sql).not.toMatch(/submission_(?:body|data|payload)|file_(?:body|bytes|content)/iu);
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE)\b/iu);
    expect(metadata).toMatchObject({ destructive: false, moduleOwner: "tests/e2e" });
  });

  it("adds the test-scoped transactional Form receipt and linked Task request without submitted data", async () => {
    const [sql, metadataText] = await Promise.all([
      readFile(resolve(migrationDirectory, "0000000018_e2e_form_submission_command_receipts.sql"), "utf8"),
      readFile(resolve(migrationDirectory, "0000000018_e2e_form_submission_command_receipts.meta.json"), "utf8"),
    ]);
    const metadata = JSON.parse(metadataText) as Readonly<Record<string, unknown>>;
    expect(sql).toContain("CREATE TABLE e2e_walking_skeleton.form_submission_command_receipts");
    expect(sql).toContain("CREATE TABLE e2e_walking_skeleton.form_submission_command_outbox");
    expect(sql).toContain("CREATE TABLE e2e_walking_skeleton.task_command_requests");
    expect(sql).toContain("REFERENCES e2e_walking_skeleton.form_submission_command_receipts(submission_reference)");
    expect(sql).not.toMatch(/submission_(?:body|data|payload)|file_(?:body|bytes|content)/iu);
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE)\b/iu);
    expect(metadata).toMatchObject({ destructive: false, moduleOwner: "tests/e2e" });
  });
});
