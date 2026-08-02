import { createHash, randomUUID } from "node:crypto";

import type { TaskCommandResult, CompleteTaskCommand } from "@ai-crm/platform-task-center";

import type { E2ePostgresRuntime } from "./postgres-runtime.js";

const TRACE_ID = /^(?!0{32})[0-9a-f]{32}$/u;
const TRACEPARENT = /^00-((?!0{32})[0-9a-f]{32})-(?!0{16})[0-9a-f]{16}-0[01]$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface WalkingSkeletonTaskCommandRequest extends CompleteTaskCommand {
  readonly submissionReference: string;
  readonly traceId: string;
  readonly traceparent: string;
}

interface CommandRow {
  readonly active_assignment_ids: readonly string[];
  readonly actor_id: string;
  readonly command_fingerprint: string;
  readonly idempotency_key: string;
  readonly source_command_id: string;
  readonly source_task_id: string;
  readonly source_type: string;
  readonly submission_reference: string;
  readonly trace_id: string;
  readonly traceparent: string;
  readonly workforce_person_id: string;
}

interface SubmissionRow { readonly submission_reference: string }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function request(row: CommandRow): WalkingSkeletonTaskCommandRequest {
  return Object.freeze({
    actor: Object.freeze({ activeAssignmentIds: Object.freeze([...row.active_assignment_ids]), principalId: row.actor_id, workforcePersonId: row.workforce_person_id }),
    idempotencyKey: row.idempotency_key,
    sourceTaskId: row.source_task_id,
    sourceType: row.source_type,
    sourceCommandReference: row.submission_reference,
    submissionReference: row.submission_reference,
    traceId: row.trace_id,
    traceparent: row.traceparent,
  });
}

export function createWalkingSkeletonTaskCommandStore(runtime: E2ePostgresRuntime): Readonly<{
  accept(input: Readonly<{ readonly command: CompleteTaskCommand; readonly traceId: string; readonly traceparent: string }>): Promise<TaskCommandResult & { readonly replayed: boolean; readonly submissionReference: string }>;
  get(idempotencyKey: string): Promise<WalkingSkeletonTaskCommandRequest | undefined>;
}> {
  return Object.freeze({
    accept(input) {
      const workforcePersonId = input.command.actor.workforcePersonId;
      const activeAssignmentIds = input.command.actor.activeAssignmentIds;
      const sourceCommandReference = input.command.sourceCommandReference;
      const traceId = TRACEPARENT.exec(input.traceparent)?.[1];
      if (workforcePersonId === undefined || !UUID.test(workforcePersonId) || activeAssignmentIds === undefined || activeAssignmentIds.length === 0 || activeAssignmentIds.some((value) => !UUID.test(value)) || sourceCommandReference === undefined || sourceCommandReference.length > 255 || traceId !== input.traceId || !TRACE_ID.test(input.traceId)) throw new Error("e2e_task_command_context_invalid");
      return runtime.withTransaction(async () => {
        await runtime.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", [`task-command:${input.command.idempotencyKey}`]);
        const prior = await runtime.execute<CommandRow>("select active_assignment_ids,actor_id,command_fingerprint,idempotency_key,source_command_id,source_task_id,source_type,submission_reference,trace_id,traceparent,workforce_person_id from e2e_walking_skeleton.task_command_requests where idempotency_key=$1", [input.command.idempotencyKey]);
        const existing = prior.rows[0];
        const fingerprint = createHash("sha256").update(canonical({ actor: input.command.actor, idempotencyKey: input.command.idempotencyKey, sourceTaskId: input.command.sourceTaskId, sourceType: input.command.sourceType, sourceCommandReference })).digest("hex");
        if (existing !== undefined) {
          if (existing.command_fingerprint !== fingerprint) throw new Error("e2e_task_command_conflict");
          return Object.freeze({ replayed: true, sourceCommandId: existing.source_command_id, status: "accepted" as const, submissionReference: existing.submission_reference });
        }
        const submissions = await runtime.execute<SubmissionRow>("select receipt.submission_reference from e2e_walking_skeleton.form_submission_command_receipts receipt join audit.records audit on audit.resource_type='form_submission' and audit.resource_id=receipt.submission_reference and audit.action='form.submission.accept' and audit.result='succeeded' where receipt.submission_reference=$1 and receipt.trace_id=$2 and receipt.actor_id=$3 and receipt.workforce_person_id=$4 and audit.actor_id=receipt.actor_id and audit.workforce_person_id=receipt.workforce_person_id", [sourceCommandReference, input.traceId, input.command.actor.principalId, workforcePersonId]);
        if (submissions.rows.length !== 1) throw new Error("e2e_task_submission_receipt_unavailable");
        const submissionReference = submissions.rows[0]?.submission_reference;
        if (submissionReference === undefined) throw new Error("e2e_task_submission_receipt_unavailable");
        const operationId = randomUUID();
        const sourceCommandId = randomUUID();
        await runtime.execute("insert into e2e_walking_skeleton.task_command_requests(operation_id,idempotency_key,command_fingerprint,submission_reference,source_type,source_task_id,actor_id,workforce_person_id,active_assignment_ids,trace_id,traceparent,source_command_id,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())", [operationId, input.command.idempotencyKey, fingerprint, submissionReference, input.command.sourceType, input.command.sourceTaskId, input.command.actor.principalId, workforcePersonId, [...activeAssignmentIds], input.traceId, input.traceparent, sourceCommandId]);
        return Object.freeze({ replayed: false, sourceCommandId, status: "accepted" as const, submissionReference });
      });
    },
    async get(idempotencyKey) {
      const result = await runtime.execute<CommandRow>("select active_assignment_ids,actor_id,command_fingerprint,idempotency_key,source_command_id,source_task_id,source_type,submission_reference,trace_id,traceparent,workforce_person_id from e2e_walking_skeleton.task_command_requests where idempotency_key=$1", [idempotencyKey]);
      const row = result.rows[0];
      return row === undefined ? undefined : request(row);
    },
  });
}
