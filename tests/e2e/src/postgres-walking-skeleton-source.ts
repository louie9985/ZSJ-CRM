import { createHash } from "node:crypto";

import type { TaskLifecycleEvent } from "@ai-crm/platform-task-center";

import {
  WalkingSkeletonSourceError,
  walkingSkeletonSourceType,
  type WalkingSkeletonActorContext,
  type WalkingSkeletonActorContextResolver,
  type WalkingSkeletonSourceAudit,
  type WalkingSkeletonSourceAuthorization,
  type WalkingSkeletonSourceCommand,
  type WalkingSkeletonSourceReceipt,
  type WalkingSkeletonSourceState,
} from "./walking-skeleton-source.js";
import { requireE2ePostgresRuntime, type E2ePostgresRuntime } from "./postgres-runtime.js";

interface SourceStateRow {
  readonly actor_context_reference: string;
  readonly assignee_reference: string;
  readonly source_task_id: string;
  readonly source_version: number;
  readonly status: "completed" | "open";
  readonly workflow_task_id: string;
}

interface SourceReceiptRow {
  readonly command_fingerprint: string;
  readonly lifecycle_event: unknown;
  readonly source_command_id: string;
}

const stableId = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function persistenceFailure(error: unknown): WalkingSkeletonSourceError {
  return (error as { readonly code?: string }).code === "23505"
    ? new WalkingSkeletonSourceError("source_state_conflict")
    : new WalkingSkeletonSourceError("source_storage_unavailable", true);
}

function validStableId(value: string): boolean {
  return stableId.test(value);
}

function validateState(state: WalkingSkeletonSourceState): void {
  const raw = state as unknown as Readonly<Record<string, unknown>>;
  if (!validStableId(state.actorContextReference)
    || !validStableId(state.assigneeReference)
    || !validStableId(state.sourceTaskId)
    || !validStableId(state.workflowTaskId)
    || !Number.isSafeInteger(state.sourceVersion)
    || state.sourceVersion < 1
    || (raw["status"] !== "open" && raw["status"] !== "completed")) {
    throw new WalkingSkeletonSourceError("source_state_conflict");
  }
}

function validateCommand(command: WalkingSkeletonSourceCommand, idempotencyKey: string): void {
  const raw = command as unknown as Readonly<Record<string, unknown>>;
  if (raw["action"] !== "complete"
    || raw["sourceType"] !== walkingSkeletonSourceType
    || !uuid.test(command.commandId)
    || !uuid.test(command.workflowCompletionEventId)
    || !validStableId(command.actorContextReference)
    || !validStableId(command.sourceTaskId)
    || !validStableId(command.workflowTaskId)
    || !Number.isSafeInteger(command.expectedSourceVersion)
    || command.expectedSourceVersion < 1
    || !validStableId(idempotencyKey)
    || idempotencyKey.length < 8
    || idempotencyKey.length > 128
    || (command.formSubmissionReference !== undefined && !validStableId(command.formSubmissionReference))
    || (command.fileReferences?.length ?? 0) > 20
    || command.fileReferences?.some((reference) => !validStableId(reference)) === true
    || new Set(command.fileReferences).size !== (command.fileReferences?.length ?? 0)) {
    throw new WalkingSkeletonSourceError("source_command_invalid");
  }
}

function validateActor(actor: WalkingSkeletonActorContext): WalkingSkeletonActorContext {
  if (!validStableId(actor.principalId)
    || actor.activeAssignmentIds.length > 100
    || actor.activeAssignmentIds.some((id) => !validStableId(id))) {
    throw new WalkingSkeletonSourceError("source_actor_context_invalid");
  }
  return actor;
}

function fingerprint(command: WalkingSkeletonSourceCommand): string {
  return createHash("sha256").update(JSON.stringify({
    action: command.action,
    actorContextReference: command.actorContextReference,
    commandId: command.commandId,
    expectedSourceVersion: command.expectedSourceVersion,
    fileReferences: [...(command.fileReferences ?? [])],
    formSubmissionReference: command.formSubmissionReference ?? null,
    sourceTaskId: command.sourceTaskId,
    sourceType: command.sourceType,
    workflowCompletionEventId: command.workflowCompletionEventId,
    workflowTaskId: command.workflowTaskId,
  })).digest("hex");
}

function mapState(row: SourceStateRow): WalkingSkeletonSourceState {
  return Object.freeze({
    actorContextReference: row.actor_context_reference,
    assigneeReference: row.assignee_reference,
    sourceTaskId: row.source_task_id,
    sourceVersion: row.source_version,
    status: row.status,
    workflowTaskId: row.workflow_task_id,
  });
}

function parseLifecycleEvent(value: unknown): TaskLifecycleEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new WalkingSkeletonSourceError("source_state_conflict");
  const event = value as Partial<TaskLifecycleEvent>;
  const deepLink = (value as Readonly<Record<string, unknown>>)["deepLink"];
  if (!uuid.test(event.eventId ?? "")
    || event.sourceType !== walkingSkeletonSourceType
    || !validStableId(event.sourceTaskId ?? "")
    || !validStableId(event.assigneeReference ?? "")
    || event.status !== "completed"
    || !Number.isSafeInteger(event.sourceVersion)
    || (event.sourceVersion ?? 0) < 2
    || typeof event.occurredAt !== "string"
    || Number.isNaN(Date.parse(event.occurredAt))
    || typeof deepLink !== "object"
    || deepLink === null
    || !validStableId((deepLink as Readonly<Record<string, string>>)["appId"] ?? "")
    || !validStableId((deepLink as Readonly<Record<string, string>>)["routeId"] ?? "")) {
    throw new WalkingSkeletonSourceError("source_state_conflict");
  }
  return Object.freeze(event as TaskLifecycleEvent);
}

function receipt(row: SourceReceiptRow): WalkingSkeletonSourceReceipt {
  if (!uuid.test(row.source_command_id)) throw new WalkingSkeletonSourceError("source_state_conflict");
  return Object.freeze({ lifecycleEvent: parseLifecycleEvent(row.lifecycle_event), sourceCommandId: row.source_command_id, status: "accepted" });
}

export function createPostgresWalkingSkeletonSource(options: {
  readonly audit: WalkingSkeletonSourceAudit;
  readonly authorization: WalkingSkeletonSourceAuthorization;
  readonly clock?: () => Date;
  readonly resolver: WalkingSkeletonActorContextResolver;
  readonly runtime: E2ePostgresRuntime;
}) {
  const db = requireE2ePostgresRuntime(options.runtime);
  const clock = options.clock ?? (() => new Date());

  const getState = async (sourceTaskId: string): Promise<WalkingSkeletonSourceState> => {
    if (!validStableId(sourceTaskId)) throw new WalkingSkeletonSourceError("source_command_invalid");
    try {
      const result = await db.execute<SourceStateRow>(
        "select actor_context_reference,assignee_reference,source_task_id,source_version,status,workflow_task_id from e2e_walking_skeleton.source_tasks where source_task_id=$1",
        [sourceTaskId],
      );
      const row = result.rows[0];
      if (row === undefined) throw new WalkingSkeletonSourceError("source_state_not_found");
      return mapState(row);
    } catch (error) {
      if (error instanceof WalkingSkeletonSourceError) throw error;
      throw persistenceFailure(error);
    }
  };

  return Object.freeze({
    async canAccept(command: WalkingSkeletonSourceCommand): Promise<boolean> {
      validateCommand(command, "validation-only");
      try {
        const result = await db.execute<{ readonly acceptable: boolean }>(
          `select exists(select 1 from e2e_walking_skeleton.source_tasks where source_task_id=$1 and status='open' and source_version=$2 and actor_context_reference=$3 and workflow_task_id=$4) acceptable`,
          [command.sourceTaskId, command.expectedSourceVersion, command.actorContextReference, command.workflowTaskId],
        );
        return result.rows[0]?.acceptable === true;
      } catch (error) {
        throw persistenceFailure(error);
      }
    },
    async complete(input: { readonly command: WalkingSkeletonSourceCommand; readonly idempotencyKey: string }): Promise<WalkingSkeletonSourceReceipt> {
      validateCommand(input.command, input.idempotencyKey);
      const commandHash = fingerprint(input.command);
      let existing;
      try {
        existing = await db.execute<SourceReceiptRow>(
          "select command_fingerprint,lifecycle_event,source_command_id from e2e_walking_skeleton.source_command_receipts where idempotency_key=$1",
          [input.idempotencyKey],
        );
      } catch (error) {
        throw persistenceFailure(error);
      }
      if (existing.rows[0] !== undefined) {
        if (existing.rows[0].command_fingerprint !== commandHash) throw new WalkingSkeletonSourceError("source_command_conflict");
        return receipt(existing.rows[0]);
      }

      const actor = validateActor(await options.resolver.resolve(input.command.actorContextReference));
      const authorizedState = await getState(input.command.sourceTaskId);
      if (!actor.activeAssignmentIds.includes(authorizedState.assigneeReference)) {
        throw new WalkingSkeletonSourceError("source_operation_denied");
      }
      const decision = await options.authorization.authorize({ actor, operation: "source_complete", sourceTaskId: input.command.sourceTaskId });
      if (!validStableId(decision.decisionId)) throw new WalkingSkeletonSourceError("source_actor_context_invalid");
      const referenceId = `${walkingSkeletonSourceType}:${input.command.sourceTaskId}`;
      if (!decision.allowed) {
        await options.audit.record({ decisionId: decision.decisionId, errorCode: "source_operation_denied", operation: "source_complete", phase: "failed", referenceId });
        throw new WalkingSkeletonSourceError("source_operation_denied");
      }
      await options.audit.record({ decisionId: decision.decisionId, operation: "source_complete", phase: "attempted", referenceId });

      try {
        const accepted = await db.withTransaction(async () => {
          await db.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", [`source-command:${input.idempotencyKey}`]);
          const replay = await db.execute<SourceReceiptRow>(
            "select command_fingerprint,lifecycle_event,source_command_id from e2e_walking_skeleton.source_command_receipts where idempotency_key=$1",
            [input.idempotencyKey],
          );
          if (replay.rows[0] !== undefined) {
            if (replay.rows[0].command_fingerprint !== commandHash) throw new WalkingSkeletonSourceError("source_command_conflict");
            return receipt(replay.rows[0]);
          }
          const current = await db.execute<SourceStateRow>(
            "select actor_context_reference,assignee_reference,source_task_id,source_version,status,workflow_task_id from e2e_walking_skeleton.source_tasks where source_task_id=$1 for update",
            [input.command.sourceTaskId],
          );
          const state = current.rows[0];
          if (state === undefined) throw new WalkingSkeletonSourceError("source_state_not_found");
          if (state.status !== "open"
            || state.source_version !== input.command.expectedSourceVersion
            || state.actor_context_reference !== input.command.actorContextReference
            || state.workflow_task_id !== input.command.workflowTaskId
            || !actor.activeAssignmentIds.includes(state.assignee_reference)) {
            throw new WalkingSkeletonSourceError("source_state_conflict");
          }
          const lifecycleEvent: TaskLifecycleEvent = Object.freeze({
            assigneeReference: state.assignee_reference,
            deepLink: Object.freeze({ appId: "platform.synthetic", routeId: "platform.synthetic.detail" }),
            eventId: input.command.workflowCompletionEventId,
            occurredAt: clock().toISOString(),
            sourceTaskId: state.source_task_id,
            sourceType: walkingSkeletonSourceType,
            sourceVersion: state.source_version + 1,
            status: "completed",
          });
          const updated = await db.execute(
            "update e2e_walking_skeleton.source_tasks set source_version=source_version+1,status='completed',updated_at=$4 where source_task_id=$1 and source_version=$2 and status='open' and workflow_task_id=$3",
            [state.source_task_id, state.source_version, state.workflow_task_id, lifecycleEvent.occurredAt],
          );
          if (updated.rowCount !== 1) throw new WalkingSkeletonSourceError("source_state_conflict");
          await db.execute(
            "insert into e2e_walking_skeleton.source_command_receipts (idempotency_key,command_fingerprint,source_command_id,source_task_id,lifecycle_event,created_at) values ($1,$2,$3,$4,$5::jsonb,$6)",
            [input.idempotencyKey, commandHash, input.command.commandId, state.source_task_id, JSON.stringify(lifecycleEvent), lifecycleEvent.occurredAt],
          );
          await options.audit.record({ decisionId: decision.decisionId, operation: "source_complete", phase: "succeeded", referenceId });
          return Object.freeze({ lifecycleEvent, sourceCommandId: input.command.commandId, status: "accepted" as const });
        });
        return accepted;
      } catch (error) {
        const failure = error instanceof WalkingSkeletonSourceError ? error : persistenceFailure(error);
        await options.audit.record({ decisionId: decision.decisionId, errorCode: failure.code, operation: "source_complete", phase: "failed", referenceId });
        throw failure;
      }
    },
    getState,
    async register(state: WalkingSkeletonSourceState): Promise<void> {
      validateState(state);
      try {
        await db.execute(
          "insert into e2e_walking_skeleton.source_tasks (source_task_id,workflow_task_id,actor_context_reference,assignee_reference,source_version,status) values ($1,$2,$3,$4,$5,$6)",
          [state.sourceTaskId, state.workflowTaskId, state.actorContextReference, state.assigneeReference, state.sourceVersion, state.status],
        );
      } catch (error) {
        throw persistenceFailure(error);
      }
    },
  });
}
