import { createHash, randomUUID } from "node:crypto";

import { createAuditService, createPrismaAuditStore, type AuditRecord, type AuditService, type RecordAuditCommand } from "@ai-crm/crm-audit";
import type { FileReference } from "@ai-crm/crm-file-center";

import type { E2ePostgresRuntime } from "./postgres-runtime.js";

export interface DurableSubmissionInput {
  readonly contentDigest: string;
  readonly definitionId: string;
  readonly fileReference: FileReference;
  readonly releaseVersion: number;
  readonly submissionReference: string;
  readonly traceId: string;
  readonly traceparent: string;
}

export interface DurableEvidenceSnapshot {
  readonly auditCount: number;
  readonly auditFactCount: number;
  readonly taskAuditFactCount: number;
  readonly inboxCount: number;
  readonly outboxTraceCount: number;
  readonly submissionCount: number;
}

export interface MainChainEvidence {
  readonly audit: AuditService;
  readCorrelatedAuditRecords(traceId: string): Promise<readonly AuditRecord[]>;
  inspect(traceId: string, traceparent: string, fileReference?: FileReference): Promise<DurableEvidenceSnapshot>;
  saveSubmission(input: DurableSubmissionInput): Promise<{ readonly replayed: boolean }>;
}

interface CountRow { readonly count: string }
interface SubmissionRow { readonly submission_fingerprint: string }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(input: DurableSubmissionInput): string {
  const semantic = {
    contentDigest: input.contentDigest,
    definitionId: input.definitionId,
    fileReference: input.fileReference,
    releaseVersion: input.releaseVersion,
    submissionReference: input.submissionReference,
  };
  return createHash("sha256").update(canonical(semantic)).digest("hex");
}

function count(row: CountRow | undefined): number {
  const value = Number(row?.count ?? "0");
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("e2e_durable_evidence_count_invalid");
  return value;
}

export function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "8";
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export function auditOperationId(source: string, result: RecordAuditCommand["result"]): string {
  return stableUuid(`${source}:${result}`);
}

export function createPostgresMainChainEvidence(runtime: E2ePostgresRuntime): MainChainEvidence {
  const audit = createAuditService(
    createPrismaAuditStore(runtime),
    { authorize: () => Promise.resolve({ allowed: true, decisionId: stableUuid("e2e.audit.read-sensitive") }) },
    { fieldPolicies: {}, id: randomUUID },
  );
  return Object.freeze({
    audit,
    async readCorrelatedAuditRecords(traceId: string) {
      const result = await runtime.execute<{ readonly audit_id: string }>("select audit_id from audit.records where trace_id=$1 and (((action='form.submission.validate' or action='form.submission.accept') and result='succeeded' and resource_type='form_submission') or (action='task.task_complete' and result='succeeded' and resource_type='task_projection')) order by action", [traceId]);
      return Promise.all(result.rows.map(({ audit_id: recordId }, index) => audit.readSensitive({
        actor: { actorId: "system.e2e-audit-verifier", actorType: "system" },
        operationId: stableUuid(`e2e.audit-correlation-read:${traceId}:${String(index)}`),
        reason: "walking skeleton correlation verification",
        recordId,
        traceId,
      })));
    },
    async inspect(traceId: string, traceparent: string, fileReference?: FileReference) {
      const [audits, auditFacts, taskAuditFacts, inbox, outbox, submissions] = await Promise.all([
        runtime.execute<CountRow>("select count(*)::text as count from audit.records where trace_id=$1", [traceId]),
        runtime.execute<CountRow>("select count(*)::text as count from audit.records where trace_id=$1 and ((operation_id=$2 and action='form.submission.validate' and result='failed' and reason_code='inactive_release' and resource_type='form_definition') or ((operation_id=$3 and action='form.submission.validate') or action='form.submission.accept') and result='succeeded' and reason_code='synthetic_e2e' and resource_type='form_submission')", [traceId, auditOperationId("form:inactive-validation", "failed"), auditOperationId("form:submission-validation", "succeeded")]),
        runtime.execute<CountRow>("select count(*)::text as count from audit.records where trace_id=$1 and action='task.task_complete' and result='succeeded' and reason_code='synthetic_e2e' and resource_type='task_projection' and resource_id='tests.walking-skeleton:source-task.main-chain-synthetic'", [traceId]),
        runtime.execute<CountRow>("select count(*)::text as count from crm_eventing.inbox_receipts where (message_id=$1 and consumer=$3) or (message_id=$2 and consumer=$4)", ["91000000-0000-4000-8000-000000000001", "92000000-0000-4000-8000-000000000001", "tests.walking-skeleton-source.v1", "tests.notification-intent.v1"]),
        runtime.execute<CountRow>("select count(*)::text as count from crm_eventing.outbox_messages where traceparent=$1 and status='published' and message_kind='job' and message_version=1 and ((message_id=$2 and message_type='tests.walking-skeleton.source-command') or (message_id=$3 and message_type='crm.notifications.intent-submit'))", [traceparent, "91000000-0000-4000-8000-000000000001", "92000000-0000-4000-8000-000000000001"]),
        fileReference === undefined
          ? runtime.execute<CountRow>("select sum(entry_count)::text as count from (select count(*) entry_count from e2e_walking_skeleton.form_submissions where trace_id=$1 union all select count(*) entry_count from e2e_walking_skeleton.form_submission_command_receipts where trace_id=$1) evidence", [traceId])
          : runtime.execute<CountRow>("select sum(entry_count)::text as count from (select count(*) entry_count from e2e_walking_skeleton.form_submissions where trace_id=$1 and file_id=$2 and content_version_id=$3 and file_reference_version=$4 and display_name=$5 and media_type is not distinct from $6 and size_bytes is not distinct from $7 union all select count(*) entry_count from e2e_walking_skeleton.form_submission_command_receipts where trace_id=$1 and file_id=$2 and content_version_id=$3 and file_reference_version=$4 and display_name=$5 and media_type is not distinct from $6 and size_bytes is not distinct from $7) evidence", [traceId, fileReference.fileId, fileReference.contentVersionId, fileReference.version, fileReference.displayName, fileReference.mediaType ?? null, fileReference.sizeBytes ?? null]),
      ]);
      return Object.freeze({ auditCount: count(audits.rows[0]), auditFactCount: count(auditFacts.rows[0]), taskAuditFactCount: count(taskAuditFacts.rows[0]), inboxCount: count(inbox.rows[0]), outboxTraceCount: count(outbox.rows[0]), submissionCount: count(submissions.rows[0]) });
    },
    async saveSubmission(input: DurableSubmissionInput) {
      const digest = fingerprint(input);
      return runtime.withTransaction(async () => {
        await runtime.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", [input.submissionReference]);
        const prior = await runtime.execute<SubmissionRow>("select submission_fingerprint from e2e_walking_skeleton.form_submissions where submission_reference=$1", [input.submissionReference]);
        if (prior.rows[0] !== undefined) {
          if (prior.rows[0].submission_fingerprint !== digest) throw new Error("e2e_submission_conflict");
          return Object.freeze({ replayed: true });
        }
        await runtime.execute("insert into e2e_walking_skeleton.form_submissions (submission_reference,submission_fingerprint,definition_id,release_version,content_digest,file_id,content_version_id,file_reference_version,display_name,media_type,size_bytes,trace_id,traceparent) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [input.submissionReference, digest, input.definitionId, input.releaseVersion, input.contentDigest, input.fileReference.fileId, input.fileReference.contentVersionId, input.fileReference.version, input.fileReference.displayName, input.fileReference.mediaType ?? null, input.fileReference.sizeBytes ?? null, input.traceId, input.traceparent]);
        return Object.freeze({ replayed: false });
      });
    },
  });
}
