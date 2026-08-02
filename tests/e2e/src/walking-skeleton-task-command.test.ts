import { describe, expect, it } from "vitest";

import type { E2ePostgresRuntime, E2ePostgresResult } from "./postgres-runtime.js";
import { createWalkingSkeletonTaskCommandStore } from "./walking-skeleton-task-command.js";

describe("Walking Skeleton Task command receipt", () => {
  it("replays the first receipt under a new trace without re-resolving causal evidence", async () => {
    let stored: Record<string, unknown> | undefined;
    let submissionLookups = 0;
    const executed: string[] = [];
    const runtime: E2ePostgresRuntime = {
      async execute<Row>(sql: string, values: readonly unknown[] = []): Promise<E2ePostgresResult<Row>> {
        await Promise.resolve();
        executed.push(sql);
        if (sql.startsWith("select pg_advisory")) return { rowCount: 0, rows: [] };
        if (sql.includes("from e2e_walking_skeleton.task_command_requests where idempotency_key=$1")) {
          return { rowCount: stored === undefined ? 0 : 1, rows: (stored === undefined ? [] : [stored]) as unknown as Row[] };
        }
        if (sql.includes("from e2e_walking_skeleton.form_submission_command_receipts receipt")) {
          submissionLookups += 1;
          return { rowCount: 1, rows: [{ submission_reference: values[0] }] as Row[] };
        }
        if (sql.startsWith("insert into e2e_walking_skeleton.task_command_requests")) {
          stored = {
            active_assignment_ids: values[8] as string[], actor_id: String(values[6]), command_fingerprint: String(values[2]), idempotency_key: String(values[1]),
            source_command_id: String(values[11]), source_task_id: String(values[5]), source_type: String(values[4]),
            submission_reference: String(values[3]), trace_id: String(values[9]), traceparent: String(values[10]),
            workforce_person_id: String(values[7]),
          };
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`unexpected_sql:${sql}`);
      },
      withTransaction: async <T>(work: () => Promise<T>) => work(),
    };
    const store = createWalkingSkeletonTaskCommandStore(runtime);
    const command = {
      actor: { activeAssignmentIds: ["71000000-0000-4000-8000-000000000007"], principalId: "subject.synthetic", workforcePersonId: "71000000-0000-4000-8000-000000000001" },
      idempotencyKey: "task-complete.browser-causal-0001", sourceCommandReference: "submission.83000000-0000-4000-8000-000000000001",
      sourceTaskId: "source-task.main-chain-synthetic", sourceType: "tests.walking-skeleton",
    };
    const firstTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const first = await store.accept({ command, traceId: firstTraceId, traceparent: `00-${firstTraceId}-00f067aa0ba902b7-01` });
    const retryTraceId = "5bf92f3577b34da6a3ce929d0e0e4736";
    const replay = await store.accept({ command, traceId: retryTraceId, traceparent: `00-${retryTraceId}-10f067aa0ba902b7-01` });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(submissionLookups).toBe(1);
    expect(executed.some((sql) => /for\s+update/iu.test(sql))).toBe(false);
    await expect(store.get(command.idempotencyKey)).resolves.toMatchObject({ actor: { activeAssignmentIds: command.actor.activeAssignmentIds }, traceId: firstTraceId });
  });
});
