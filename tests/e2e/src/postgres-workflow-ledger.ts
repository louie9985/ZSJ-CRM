import { randomUUID } from "node:crypto";

import {
  WorkflowError,
  type WorkflowCommandLedger,
  type WorkflowCommandResult,
  type WorkflowCommandStatus,
  type WorkflowOperation,
} from "@ai-crm/crm-workflow";

import { requireE2ePostgresRuntime, type E2ePostgresRuntime } from "./postgres-runtime.js";

interface LedgerRow {
  readonly command_fingerprint: string;
  readonly lease_expires_at: Date | string | null;
  readonly result_json: unknown;
  readonly source_revision: number | null;
  readonly status: "completed" | "reconciliation_required" | "running";
}

interface Claim {
  readonly leaseToken?: string;
  readonly replay?: Readonly<WorkflowCommandResult<unknown>>;
}

interface WorkflowLedgerInput {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  readonly operation: WorkflowOperation;
  readonly revisionScope?: string;
}

const operations: ReadonlySet<WorkflowOperation> = new Set([
  "definition_deploy",
  "process_cancel",
  "process_start",
  "task_claim",
  "task_complete",
  "task_release",
]);
const fingerprintPattern = /^[0-9a-f]{64}$/u;
const boundedKey = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/u;

function validate(input: WorkflowLedgerInput): void {
  if (!operations.has(input.operation)
    || !fingerprintPattern.test(input.fingerprint)
    || !boundedKey.test(input.idempotencyKey)
    || input.idempotencyKey.length > 128
    || (input.revisionScope !== undefined && !boundedKey.test(input.revisionScope))) {
    throw new WorkflowError("WORKFLOW_INVALID_INPUT");
  }
}

function result(row: LedgerRow): Readonly<WorkflowCommandResult<unknown>> {
  if (row.status !== "completed" || row.result_json === null || row.result_json === undefined) {
    throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED");
  }
  return Object.freeze({
    ...(row.source_revision === null ? {} : { sourceRevision: row.source_revision }),
    value: row.result_json,
  });
}

export function createPostgresWorkflowCommandLedger(options: {
  readonly clock?: () => Date;
  readonly leaseMs: number;
  readonly runtime: E2ePostgresRuntime;
}): WorkflowCommandLedger {
  if (!Number.isSafeInteger(options.leaseMs) || options.leaseMs < 1_000 || options.leaseMs > 300_000) {
    throw new WorkflowError("WORKFLOW_INVALID_INPUT");
  }
  const db = requireE2ePostgresRuntime(options.runtime);
  const clock = options.clock ?? (() => new Date());

  const read = (operation: WorkflowOperation, idempotencyKey: string) => db.execute<LedgerRow>(
    "select command_fingerprint,lease_expires_at,result_json,source_revision,status from e2e_walking_skeleton.workflow_command_ledger where operation=$1 and idempotency_key=$2",
    [operation, idempotencyKey],
  );

  return Object.freeze({
    async execute<T>(input: WorkflowLedgerInput, action: () => Promise<T>): Promise<Readonly<WorkflowCommandResult<T>>> {
      validate(input);
      const leaseToken = randomUUID();
      const now = clock();
      const expiresAt = new Date(now.getTime() + options.leaseMs);
      let claim: Claim;
      try {
        claim = await db.withTransaction(async () => {
          await db.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", [`workflow:${input.operation}:${input.idempotencyKey}`]);
          const existing = (await read(input.operation, input.idempotencyKey)).rows[0];
          if (existing !== undefined) {
            if (existing.command_fingerprint !== input.fingerprint) throw new WorkflowError("WORKFLOW_IDEMPOTENCY_CONFLICT");
            if (existing.status === "completed") return { replay: result(existing) };
            if (existing.status === "reconciliation_required") throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED");
            if (existing.lease_expires_at !== null && new Date(existing.lease_expires_at).getTime() > now.getTime()) {
              throw new WorkflowError("WORKFLOW_CONFLICT", { retryable: true });
            }
            const isolated = await db.execute(
              "update e2e_walking_skeleton.workflow_command_ledger set status='reconciliation_required',lease_token=null,lease_expires_at=null,updated_at=$3 where operation=$1 and idempotency_key=$2 and status='running' and lease_expires_at <= $3",
              [input.operation, input.idempotencyKey, now],
            );
            if (isolated.rowCount !== 1) throw new WorkflowError("WORKFLOW_CONFLICT", { retryable: true });
            throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED");
          }
          await db.execute(
            "insert into e2e_walking_skeleton.workflow_command_ledger (operation,idempotency_key,command_fingerprint,status,lease_token,lease_expires_at,created_at,updated_at) values ($1,$2,$3,'running',$4,$5,$6,$6)",
            [input.operation, input.idempotencyKey, input.fingerprint, leaseToken, expiresAt, now],
          );
          return { leaseToken };
        });
      } catch (error) {
        if (error instanceof WorkflowError) throw error;
        throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED", { cause: error });
      }
      if (claim.replay !== undefined) return claim.replay as Readonly<WorkflowCommandResult<T>>;
      if (claim.leaseToken === undefined) throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED");

      let value: T;
      try {
        value = await action();
      } catch (error) {
        try {
          if (error instanceof WorkflowError && error.code === "WORKFLOW_RECONCILIATION_REQUIRED") {
            await db.execute(
              "update e2e_walking_skeleton.workflow_command_ledger set status='reconciliation_required',lease_token=null,lease_expires_at=null,updated_at=$4 where operation=$1 and idempotency_key=$2 and lease_token=$3 and status='running'",
              [input.operation, input.idempotencyKey, claim.leaseToken, clock()],
            );
          } else {
            const released = await db.execute(
              "delete from e2e_walking_skeleton.workflow_command_ledger where operation=$1 and idempotency_key=$2 and lease_token=$3 and status='running'",
              [input.operation, input.idempotencyKey, claim.leaseToken],
            );
            if (released.rowCount !== 1) throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED");
          }
        } catch (persistenceError) {
          throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED", { cause: persistenceError });
        }
        throw error;
      }

      try {
        return await db.withTransaction(async () => {
          let sourceRevision: number | undefined;
          if (input.revisionScope !== undefined) {
            const revision = await db.execute<{ readonly source_revision: number }>(
              "insert into e2e_walking_skeleton.workflow_revisions (revision_scope,source_revision,updated_at) values ($1,1,$2) on conflict (revision_scope) do update set source_revision=e2e_walking_skeleton.workflow_revisions.source_revision+1,updated_at=excluded.updated_at returning source_revision",
              [input.revisionScope, clock()],
            );
            sourceRevision = revision.rows[0]?.source_revision;
            if (sourceRevision === undefined) throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED");
          }
          const persisted = await db.execute(
            "update e2e_walking_skeleton.workflow_command_ledger set status='completed',result_json=$4::jsonb,source_revision=$5,lease_token=null,lease_expires_at=null,updated_at=$6 where operation=$1 and idempotency_key=$2 and lease_token=$3 and status='running'",
            [input.operation, input.idempotencyKey, claim.leaseToken, JSON.stringify(value), sourceRevision ?? null, clock()],
          );
          if (persisted.rowCount !== 1) throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED");
          return Object.freeze({ ...(sourceRevision === undefined ? {} : { sourceRevision }), value });
        });
      } catch (error) {
        try {
          const isolated = await db.execute(
            "update e2e_walking_skeleton.workflow_command_ledger set status='reconciliation_required',lease_token=null,lease_expires_at=null,updated_at=$4 where operation=$1 and idempotency_key=$2 and lease_token=$3 and status='running'",
            [input.operation, input.idempotencyKey, claim.leaseToken, clock()],
          );
          if (isolated.rowCount !== 1) throw new Error("workflow_reconciliation_state_not_persisted");
        } catch (isolationError) {
          throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED", { cause: new AggregateError([error, isolationError]) });
        }
        throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED", { cause: error });
      }
    },
    async getStatus(input: { readonly idempotencyKey: string; readonly operation: WorkflowOperation }): Promise<WorkflowCommandStatus> {
      if (!operations.has(input.operation) || !boundedKey.test(input.idempotencyKey) || input.idempotencyKey.length > 128) {
        throw new WorkflowError("WORKFLOW_INVALID_INPUT");
      }
      try {
        return (await read(input.operation, input.idempotencyKey)).rows[0]?.status ?? "absent";
      } catch (error) {
        throw new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED", { cause: error });
      }
    },
  });
}
