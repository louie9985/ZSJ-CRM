import { createHash, randomUUID } from "node:crypto";

import { createAuditService, createPrismaAuditStore, type AuditService, type RecordAuditCommand } from "@ai-crm/platform-audit";
import type { FileReference } from "@ai-crm/platform-file-center";

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
  readonly inboxCount: number;
  readonly outboxTraceCount: number;
  readonly submissionCount: number;
}

export interface MainChainEvidence {
  readonly audit: AuditService;
  inspect(traceId: string, traceparent: string): Promise<DurableEvidenceSnapshot>;
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
    async inspect(traceId: string, traceparent: string) {
      const [audits, auditFacts, inbox, outbox, submissions] = await Promise.all([
        runtime.execute<CountRow>("select count(*)::text as count from audit.records where trace_id=$1", [traceId]),
        runtime.execute<CountRow>("select count(*)::text as count from audit.records where trace_id=$1 and ((operation_id=$2 and action='form.submission.validate' and result='failed' and reason_code='inactive_release' and resource_type='form_definition') or (operation_id=$3 and action='form.submission.validate' and result='succeeded' and reason_code='synthetic_e2e' and resource_type='form_submission'))", [traceId, auditOperationId("form:inactive-validation", "failed"), auditOperationId("form:submission-validation", "succeeded")]),
        runtime.execute<CountRow>("select count(*)::text as count from platform_eventing.inbox_receipts where (message_id=$1 and consumer=$3) or (message_id=$2 and consumer=$4)", ["91000000-0000-4000-8000-000000000001", "92000000-0000-4000-8000-000000000001", "tests.walking-skeleton-source.v1", "tests.notification-intent.v1"]),
        runtime.execute<CountRow>("select count(*)::text as count from platform_eventing.outbox_messages where traceparent=$1 and status='published' and message_kind='job' and message_version=1 and ((message_id=$2 and message_type='tests.walking-skeleton.source-command') or (message_id=$3 and message_type='platform.notifications.intent-submit'))", [traceparent, "91000000-0000-4000-8000-000000000001", "92000000-0000-4000-8000-000000000001"]),
        runtime.execute<CountRow>("select count(*)::text as count from e2e_walking_skeleton.form_submissions where trace_id=$1 and traceparent=$2", [traceId, traceparent]),
      ]);
      return Object.freeze({ auditCount: count(audits.rows[0]), auditFactCount: count(auditFacts.rows[0]), inboxCount: count(inbox.rows[0]), outboxTraceCount: count(outbox.rows[0]), submissionCount: count(submissions.rows[0]) });
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
