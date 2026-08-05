import type { FormPersistenceRuntime } from "@ai-crm/crm-form-schema";

import {
  WalkingSkeletonFormSubmissionError,
  type WalkingSkeletonFormSubmissionReceipt,
  type WalkingSkeletonFormSubmissionStore,
  type WalkingSkeletonFormSubmissionStoreInput,
} from "./walking-skeleton-form-submission.js";

interface ReceiptRow {
  readonly actor_id: string; readonly assignment_id: string | null;
  readonly content_digest: string; readonly content_version_id: string; readonly display_name: string; readonly file_id: string;
  readonly media_type: string | null; readonly operation_id: string; readonly release_version: number; readonly size_bytes: string | null;
  readonly submission_fingerprint: string; readonly submission_reference: string; readonly submitted_at: string; readonly trace_id: string;
  readonly workforce_person_id: string;
}

const SUBMISSION_REFERENCE = /^submission\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DIGEST = /^[0-9a-f]{64}$/u;

function receipt(row: ReceiptRow, replayed: boolean): WalkingSkeletonFormSubmissionReceipt {
  if (row.release_version !== 1 || !DIGEST.test(row.content_digest) || !SUBMISSION_REFERENCE.test(row.submission_reference)) throw new WalkingSkeletonFormSubmissionError("submission_dependency_unavailable", true);
  return Object.freeze({
    fileReference: Object.freeze({ contentVersionId: row.content_version_id, displayName: row.display_name, fileId: row.file_id, ...(row.media_type === null ? {} : { mediaType: row.media_type }), ...(row.size_bytes === null ? {} : { sizeBytes: Number(row.size_bytes) }), version: 1 }),
    operationId: row.operation_id,
    reference: Object.freeze({ contentDigest: row.content_digest, definitionId: "crm.synthetic.task-completion", releaseVersion: 1, version: 1 }),
    replayed, submissionReference: row.submission_reference, submittedAt: new Date(row.submitted_at).toISOString(), traceId: row.trace_id, version: 1,
  });
}

const SELECT = "select operation_id,submission_reference,submission_fingerprint,actor_id,workforce_person_id,assignment_id,release_version,content_digest,file_id,content_version_id,display_name,media_type,size_bytes::text,trace_id,submitted_at from e2e_walking_skeleton.form_submission_command_receipts";

export function createWalkingSkeletonFormSubmissionPostgresStore(runtime: FormPersistenceRuntime): WalkingSkeletonFormSubmissionStore {
  return Object.freeze({
    accept(input: WalkingSkeletonFormSubmissionStoreInput): Promise<WalkingSkeletonFormSubmissionReceipt> {
      return runtime.withTransaction(async () => {
        await runtime.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", [`form-submission:${input.receipt.operationId}`]);
        const prior = await runtime.execute<ReceiptRow>(`${SELECT} where operation_id=$1`, [input.receipt.operationId]);
        const existing = prior.rows[0];
        if (existing !== undefined) {
          if (existing.submission_fingerprint !== input.fingerprint) throw new WalkingSkeletonFormSubmissionError("submission_conflict");
          return receipt(existing, true);
        }
        const inserted = await runtime.execute<ReceiptRow>(`insert into e2e_walking_skeleton.form_submission_command_receipts(operation_id,submission_reference,submission_fingerprint,actor_id,workforce_person_id,assignment_id,definition_id,release_version,content_digest,file_id,content_version_id,file_reference_version,display_name,media_type,size_bytes,trace_id,traceparent,submitted_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,$13,$14,$15,$16,$17) returning operation_id,submission_reference,submission_fingerprint,actor_id,workforce_person_id,assignment_id,release_version,content_digest,file_id,content_version_id,display_name,media_type,size_bytes::text,trace_id,submitted_at`, [input.receipt.operationId, input.receipt.submissionReference, input.fingerprint, input.actor.actorId, input.actor.workforcePersonId, input.actor.assignmentId ?? null, input.receipt.reference.definitionId, input.receipt.reference.releaseVersion, input.receipt.reference.contentDigest, input.receipt.fileReference.fileId, input.receipt.fileReference.contentVersionId, input.receipt.fileReference.displayName, input.receipt.fileReference.mediaType ?? null, input.receipt.fileReference.sizeBytes ?? null, input.receipt.traceId, input.traceparent, input.receipt.submittedAt]);
        await runtime.execute("insert into e2e_walking_skeleton.form_submission_command_outbox(event_id,submission_reference,event_type,trace_id,traceparent,occurred_at) values($1,$2,'tests.walking-skeleton.form-submission-accepted.v1',$3,$4,$5)", [input.eventId, input.receipt.submissionReference, input.receipt.traceId, input.traceparent, input.receipt.submittedAt]);
        await runtime.execute("insert into audit.records(audit_id,occurred_at,action,actor_id,actor_type,workforce_person_id,assignment_id,resource_type,resource_id,result,reason_code,trace_id,authorization_decision_id,operation_id,changes) values($1,$2,'form.submission.accept',$3,'authenticated_subject',$4,$5,'form_submission',$6,'succeeded','synthetic_e2e',$7,$8,$9,'[]'::jsonb)", [input.auditId, input.receipt.submittedAt, input.actor.actorId, input.actor.workforcePersonId, input.actor.assignmentId ?? null, input.receipt.submissionReference, input.receipt.traceId, input.authorizationDecisionId, input.receipt.operationId]);
        const row = inserted.rows[0];
        if (inserted.rowCount !== 1 || row === undefined) throw new Error("e2e_form_submission_insert_failed");
        return receipt(row, false);
      });
    },
    async getBySubmissionReference(submissionReference: string) {
      if (!SUBMISSION_REFERENCE.test(submissionReference)) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
      const result = await runtime.execute<ReceiptRow>(`${SELECT} where submission_reference=$1`, [submissionReference]);
      const row = result.rows[0];
      if (row === undefined) return undefined;
      const value = receipt(row, false);
      return Object.freeze({ actor: Object.freeze({ actorId: row.actor_id, ...(row.assignment_id === null ? {} : { assignmentId: row.assignment_id }), workforcePersonId: row.workforce_person_id }), fileReference: value.fileReference, operationId: value.operationId, reference: value.reference, submissionReference: value.submissionReference, submittedAt: value.submittedAt, traceId: value.traceId, version: value.version });
    },
  });
}
