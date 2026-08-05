import { describe, expect, it } from "vitest";

import type { FormPersistenceResult, FormPersistenceRuntime } from "@ai-crm/crm-form-schema";

import { createWalkingSkeletonFormSubmissionPostgresStore } from "./walking-skeleton-form-submission-postgres-store.js";

const row = Object.freeze({ actor_id: "subject:synthetic-hash", assignment_id: "71000000-0000-4000-8000-000000000007", content_digest: "a".repeat(64), content_version_id: "93000000-0000-4000-8000-000000000002", display_name: "synthetic.txt", file_id: "93000000-0000-4000-8000-000000000001", media_type: "text/plain", operation_id: "81000000-0000-4000-8000-000000000001", release_version: 1, size_bytes: "24", submission_fingerprint: "b".repeat(64), submission_reference: "submission.83000000-0000-4000-8000-000000000001", submitted_at: "2026-08-02T00:00:00.000Z", trace_id: "4bf92f3577b34da6a3ce929d0e0e4736", workforce_person_id: "71000000-0000-4000-8000-000000000001" });
const input = Object.freeze({ actor: Object.freeze({ actorId: "subject:synthetic-hash", assignmentId: "71000000-0000-4000-8000-000000000007", workforcePersonId: "71000000-0000-4000-8000-000000000001" }), auditId: "83000000-0000-4000-8000-000000000002", authorizationDecisionId: "82000000-0000-4000-8000-000000000001", eventId: "83000000-0000-4000-8000-000000000003", fingerprint: row.submission_fingerprint, receipt: Object.freeze({ fileReference: Object.freeze({ contentVersionId: row.content_version_id, displayName: row.display_name, fileId: row.file_id, mediaType: row.media_type, sizeBytes: 24, version: 1 as const }), operationId: row.operation_id, reference: Object.freeze({ contentDigest: row.content_digest, definitionId: "crm.synthetic.task-completion" as const, releaseVersion: 1 as const, version: 1 as const }), submissionReference: row.submission_reference, submittedAt: row.submitted_at, traceId: row.trace_id, version: 1 as const }), traceparent: `00-${row.trace_id}-00f067aa0ba902b7-01` });

function runtime(failAudit = false): { readonly committed: string[]; readonly executed: string[]; readonly runtime: FormPersistenceRuntime } {
  let transaction: string[] | undefined;
  const committed: string[] = [];
  const executed: string[] = [];
  const execute = <Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<FormPersistenceResult<Row>> => {
    executed.push(sql);
    if (sql.includes("where operation_id=$1")) return Promise.resolve({ rowCount: 0, rows: [] });
    if (sql.startsWith("insert into audit.records") && failAudit) return Promise.reject(new Error("audit unavailable"));
    if (sql.startsWith("insert into")) transaction?.push(`${sql}\n${JSON.stringify(values)}`);
    if (sql.startsWith("insert into e2e_walking_skeleton.form_submission_command_receipts")) return Promise.resolve({ rowCount: 1, rows: [row as Row] });
    if (sql.includes("where submission_reference=$1")) return Promise.resolve({ rowCount: 1, rows: [row as Row] });
    return Promise.resolve({ rowCount: 1, rows: [] });
  };
  return {
    committed,
    executed,
    runtime: {
      execute,
      async withTransaction<T>(work: () => Promise<T>): Promise<T> {
        transaction = [];
        try { const result = await work(); committed.push(...transaction); return result; }
        finally { transaction = undefined; }
      },
    },
  };
}

describe("Walking Skeleton Form submission PostgreSQL store", () => {
  it("commits receipt, Outbox, and succeeded Audit together and reads by server reference", async () => {
    const target = runtime();
    const store = createWalkingSkeletonFormSubmissionPostgresStore(target.runtime);
    await expect(store.accept(input)).resolves.toMatchObject({ replayed: false, submissionReference: row.submission_reference });
    expect(target.committed.some((sql) => sql.includes("form_submission_command_receipts"))).toBe(true);
    expect(target.committed.some((sql) => sql.includes("form_submission_command_outbox"))).toBe(true);
    expect(target.committed.some((sql) => sql.includes("audit.records"))).toBe(true);
    expect(target.committed.some((sql) => sql.includes("authenticated_subject") && sql.includes(input.actor.actorId) && sql.includes(input.actor.workforcePersonId) && sql.includes(input.actor.assignmentId))).toBe(true);
    expect(target.executed.some((sql) => /for\s+update/iu.test(sql))).toBe(false);
    await expect(store.getBySubmissionReference(row.submission_reference)).resolves.toMatchObject({ actor: input.actor, operationId: row.operation_id, submissionReference: row.submission_reference });
  });

  it("rolls back receipt and Outbox when succeeded Audit persistence fails", async () => {
    const target = runtime(true);
    await expect(createWalkingSkeletonFormSubmissionPostgresStore(target.runtime).accept(input)).rejects.toThrow("audit unavailable");
    expect(target.committed).toEqual([]);
  });
});
