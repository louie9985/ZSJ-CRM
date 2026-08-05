import { describe, expect, it } from "vitest";

import { auditOperationId, createPostgresMainChainEvidence, stableUuid, type DurableSubmissionInput } from "./durable-evidence.js";
import type { E2ePostgresResult, E2ePostgresRuntime } from "./postgres-runtime.js";

const input: DurableSubmissionInput = Object.freeze({
  contentDigest: "a".repeat(64),
  definitionId: "crm.synthetic.form",
  fileReference: Object.freeze({ contentVersionId: "00000000-0000-4000-8000-000000000002", displayName: "synthetic.txt", fileId: "00000000-0000-4000-8000-000000000001", mediaType: "text/plain", sizeBytes: 9, version: 1 }),
  releaseVersion: 1,
  submissionReference: "submission.synthetic-0001",
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
});

class Runtime implements E2ePostgresRuntime {
  private fingerprint: string | undefined;

  execute<Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = []): Promise<E2ePostgresResult<Row>> {
    if (sql.startsWith("select pg_advisory")) return Promise.resolve({ rowCount: 1, rows: [] });
    if (sql.startsWith("select submission_fingerprint")) {
      return Promise.resolve({ rowCount: this.fingerprint === undefined ? 0 : 1, rows: this.fingerprint === undefined ? [] : [{ submission_fingerprint: this.fingerprint } as Row] });
    }
    if (sql.startsWith("insert into e2e_walking_skeleton.form_submissions")) {
      this.fingerprint = String(values[1]);
      return Promise.resolve({ rowCount: 1, rows: [] });
    }
    if (sql.includes("operation_id=$2")) return Promise.resolve({ rowCount: 1, rows: [{ count: "2" } as Row] });
    if (sql.includes("action='task.task_complete'")) return Promise.resolve({ rowCount: 1, rows: [{ count: "1" } as Row] });
    if (sql.includes("from audit.records")) return Promise.resolve({ rowCount: 1, rows: [{ count: "12" } as Row] });
    if (sql.includes("from crm_eventing.inbox_receipts")) return Promise.resolve({ rowCount: 1, rows: [{ count: "2" } as Row] });
    if (sql.includes("from crm_eventing.outbox_messages")) return Promise.resolve({ rowCount: 1, rows: [{ count: "2" } as Row] });
    if (sql.includes("from e2e_walking_skeleton.form_submissions")) return Promise.resolve({ rowCount: 1, rows: [{ count: "1" } as Row] });
    throw new Error(`unexpected_sql:${sql}`);
  }

  withTransaction<T>(work: () => Promise<T>): Promise<T> { return work(); }
}

describe("durable main-chain evidence", () => {
  it("persists one stable submission reference and replays identical input", async () => {
    const evidence = createPostgresMainChainEvidence(new Runtime());
    await expect(evidence.saveSubmission(input)).resolves.toEqual({ replayed: false });
    await expect(evidence.saveSubmission(input)).resolves.toEqual({ replayed: true });
    await expect(evidence.saveSubmission({ ...input, traceId: "abcdefabcdefabcdefabcdefabcdefab", traceparent: "00-abcdefabcdefabcdefabcdefabcdefab-11f067aa0ba902b7-00" })).resolves.toEqual({ replayed: true });
    await expect(evidence.saveSubmission({ ...input, releaseVersion: 2 })).rejects.toThrow("e2e_submission_conflict");
  });

  it("reports durable submission, Outbox, Inbox, and Audit correlation counts", async () => {
    const evidence = createPostgresMainChainEvidence(new Runtime());
    await expect(evidence.inspect(input.traceId, input.traceparent)).resolves.toEqual({ auditCount: 12, auditFactCount: 2, taskAuditFactCount: 1, inboxCount: 2, outboxTraceCount: 2, submissionCount: 1 });
    expect(stableUuid("same")).toBe(stableUuid("same"));
    expect(auditOperationId("operation", "failed")).not.toBe(auditOperationId("operation", "succeeded"));
  });
});
