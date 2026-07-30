import { describe, expect, it, vi } from "vitest";

import type { E2ePostgresResult, E2ePostgresRuntime } from "./postgres-runtime.js";
import { createPostgresWalkingSkeletonSource } from "./postgres-walking-skeleton-source.js";
import type { WalkingSkeletonSourceCommand, WalkingSkeletonSourceState } from "./walking-skeleton-source.js";

interface ReceiptRecord {
  command_fingerprint: string;
  lifecycle_event: unknown;
  source_command_id: string;
}

class SourceRuntime implements E2ePostgresRuntime {
  public readonly receipts = new Map<string, ReceiptRecord>();
  public readonly states = new Map<string, WalkingSkeletonSourceState>();

  public async execute<Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = []): Promise<E2ePostgresResult<Row>> {
    await Promise.resolve();
    if (sql.startsWith("select pg_advisory")) return this.result<Row>();
    if (sql.includes("source_command_receipts where")) {
      const item = this.receipts.get(values[0] as string);
      return this.result<Row>(item === undefined ? [] : [item]);
    }
    if (sql.startsWith("select exists")) {
      const state = this.states.get(values[0] as string);
      const acceptable = state?.status === "open"
        && state.sourceVersion === values[1]
        && state.actorContextReference === values[2]
        && state.workflowTaskId === values[3];
      return this.result<Row>([{ acceptable: Boolean(acceptable) }]);
    }
    if (sql.includes("from e2e_walking_skeleton.source_tasks where")) {
      const state = this.states.get(values[0] as string);
      return this.result<Row>(state === undefined ? [] : [{
        actor_context_reference: state.actorContextReference,
        assignee_reference: state.assigneeReference,
        source_task_id: state.sourceTaskId,
        source_version: state.sourceVersion,
        status: state.status,
        workflow_task_id: state.workflowTaskId,
      }]);
    }
    if (sql.startsWith("insert into e2e_walking_skeleton.source_tasks")) {
      const id = values[0] as string;
      if (this.states.has(id)) throw Object.assign(new Error("duplicate"), { code: "23505" });
      this.states.set(id, {
        sourceTaskId: id,
        workflowTaskId: values[1] as string,
        actorContextReference: values[2] as string,
        assigneeReference: values[3] as string,
        sourceVersion: values[4] as number,
        status: values[5] as "completed" | "open",
      });
      return this.result<Row>([], 1);
    }
    if (sql.startsWith("update e2e_walking_skeleton.source_tasks")) {
      const state = this.states.get(values[0] as string);
      if (state === undefined || state.sourceVersion !== values[1] || state.status !== "open" || state.workflowTaskId !== values[2]) return this.result<Row>();
      this.states.set(state.sourceTaskId, { ...state, sourceVersion: state.sourceVersion + 1, status: "completed" });
      return this.result<Row>([], 1);
    }
    if (sql.startsWith("insert into e2e_walking_skeleton.source_command_receipts")) {
      this.receipts.set(values[0] as string, {
        command_fingerprint: values[1] as string,
        source_command_id: values[2] as string,
        lifecycle_event: JSON.parse(values[4] as string) as unknown,
      });
      return this.result<Row>([], 1);
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }

  public async withTransaction<T>(work: () => Promise<T>): Promise<T> {
    const states = structuredClone(this.states);
    const receipts = structuredClone(this.receipts);
    try {
      return await work();
    } catch (error) {
      this.states.clear();
      states.forEach((value, key) => this.states.set(key, value));
      this.receipts.clear();
      receipts.forEach((value, key) => this.receipts.set(key, value));
      throw error;
    }
  }

  private result<Row>(rows: readonly unknown[] = [], rowCount = rows.length): E2ePostgresResult<Row> {
    return { rowCount, rows: rows as readonly Row[] };
  }
}

const state = (): WalkingSkeletonSourceState => ({
  actorContextReference: "actor-context:synthetic",
  assigneeReference: "assignment:synthetic",
  sourceTaskId: "source-task:synthetic",
  sourceVersion: 1,
  status: "open",
  workflowTaskId: "workflow-task:synthetic",
});

const command = (changes: Partial<WalkingSkeletonSourceCommand> = {}): WalkingSkeletonSourceCommand => ({
  action: "complete",
  actorContextReference: "actor-context:synthetic",
  commandId: "10000000-0000-5000-8000-000000000001",
  expectedSourceVersion: 1,
  sourceTaskId: "source-task:synthetic",
  sourceType: "tests.walking-skeleton",
  workflowCompletionEventId: "20000000-0000-5000-8000-000000000001",
  workflowTaskId: "workflow-task:synthetic",
  ...changes,
});

function fixture(runtime = new SourceRuntime()) {
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const source = createPostgresWalkingSkeletonSource({
    audit,
    authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision:synthetic" }) },
    clock: () => new Date("2026-07-30T08:00:00.000Z"),
    resolver: { resolve: () => Promise.resolve({ activeAssignmentIds: ["assignment:synthetic"], principalId: "principal:synthetic" }) },
    runtime,
  });
  return { audit, runtime, source };
}

describe("PostgreSQL Walking Skeleton source", () => {
  it("atomically persists source state and a stable duplicate receipt", async () => {
    const { audit, runtime, source } = fixture();
    await source.register(state());

    const first = await source.complete({ command: command(), idempotencyKey: "complete:synthetic" });
    const duplicate = await source.complete({ command: command(), idempotencyKey: "complete:synthetic" });

    expect(duplicate).toEqual(first);
    await expect(source.getState(state().sourceTaskId)).resolves.toMatchObject({ sourceVersion: 2, status: "completed" });
    expect(runtime.receipts).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it("rejects changed semantics for an existing idempotency key", async () => {
    const { source } = fixture();
    await source.register(state());
    await source.complete({ command: command(), idempotencyKey: "complete:synthetic" });

    await expect(source.complete({
      command: command({ workflowCompletionEventId: "20000000-0000-5000-8000-000000000002" }),
      idempotencyKey: "complete:synthetic",
    })).rejects.toMatchObject({ code: "source_command_conflict" });
  });

  it("rolls back state and receipt when success audit fails", async () => {
    const { audit, runtime, source } = fixture();
    await source.register(state());
    audit.record.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("audit unavailable")).mockResolvedValueOnce(undefined);

    await expect(source.complete({ command: command(), idempotencyKey: "complete:synthetic" })).rejects.toMatchObject({ code: "source_storage_unavailable", retryable: true });
    expect(runtime.receipts).toHaveLength(0);
    await expect(source.getState(state().sourceTaskId)).resolves.toMatchObject({ sourceVersion: 1, status: "open" });
  });

  it("fails closed for missing state and duplicate registration", async () => {
    const { source } = fixture();
    await expect(source.getState("source-task:missing")).rejects.toMatchObject({ code: "source_state_not_found" });
    await source.register(state());
    await expect(source.register(state())).rejects.toMatchObject({ code: "source_state_conflict" });
  });

  it("rejects an actor whose active assignments do not include the authoritative assignee", async () => {
    const runtime = new SourceRuntime();
    const source = createPostgresWalkingSkeletonSource({
      audit: { record: () => Promise.resolve() },
      authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision:synthetic" }) },
      resolver: { resolve: () => Promise.resolve({ activeAssignmentIds: ["assignment:other"], principalId: "principal:synthetic" }) },
      runtime,
    });
    await source.register(state());

    await expect(source.complete({ command: command(), idempotencyKey: "complete:synthetic" }))
      .rejects.toMatchObject({ code: "source_operation_denied" });
    await expect(source.getState(state().sourceTaskId)).resolves.toMatchObject({ sourceVersion: 1, status: "open" });
  });

  it("maps an unavailable persistence runtime to a bounded source error", async () => {
    const runtime: E2ePostgresRuntime = {
      execute: () => Promise.reject(new Error("postgres unavailable: sensitive detail")),
      withTransaction: (work) => work(),
    };
    const { source } = fixture(runtime as SourceRuntime);

    await expect(source.getState(state().sourceTaskId)).rejects.toMatchObject({ code: "source_storage_unavailable", message: "source_storage_unavailable", retryable: true });
  });
});
