import { describe, expect, it, vi } from "vitest";
import {
  createTaskCenter,
  InMemoryTaskCenterStore,
  type TaskCenterStore,
  type TaskLifecycleEvent,
} from "@ai-crm/platform-task-center";

import {
  createWalkingSkeletonSource,
  createWalkingSkeletonTaskPorts,
  walkingSkeletonSourceType,
  type WalkingSkeletonSourceCommand,
} from "./walking-skeleton-source.js";

const ids = {
  command: "10000000-0000-4000-8000-000000000001",
  completion: "10000000-0000-4000-8000-000000000002",
} as const;

const command = (overrides: Partial<WalkingSkeletonSourceCommand> = {}): WalkingSkeletonSourceCommand => ({
  action: "complete",
  actorContextReference: "actor-context.synthetic",
  commandId: ids.command,
  expectedSourceVersion: 1,
  sourceTaskId: "source-task.synthetic",
  sourceType: walkingSkeletonSourceType,
  workflowCompletionEventId: ids.completion,
  workflowTaskId: "workflow-task.synthetic",
  ...overrides,
});
const complete = (source: ReturnType<typeof createWalkingSkeletonSource>, value = command(), idempotencyKey = "source-command.synthetic-0001") => source.complete({ command: value, idempotencyKey });

const setup = (allowed = true) => {
  const audits: unknown[] = [];
  const authorize = vi.fn(() => Promise.resolve({ allowed, decisionId: "decision.synthetic" }));
  const resolve = vi.fn(() => Promise.resolve({ activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" }));
  const source = createWalkingSkeletonSource({
    audit: { record: (record) => { audits.push(record); return Promise.resolve(); } },
    authorization: { authorize },
    clock: () => new Date("2026-07-30T00:00:00.000Z"),
    resolver: { resolve },
  });
  source.register({
    actorContextReference: "actor-context.synthetic",
    assigneeReference: "assignment.synthetic",
    sourceTaskId: "source-task.synthetic",
    sourceVersion: 1,
    status: "open",
    workflowTaskId: "workflow-task.synthetic",
  });
  return { audits, authorize, resolve, source };
};

describe("Walking Skeleton authoritative source", () => {
  it("resolves actor context, reauthorizes, checks current state, and returns one stable receipt", async () => {
    const { audits, authorize, resolve, source } = setup();
    const [first, concurrent] = await Promise.all([complete(source), complete(source)]);
    const repeated = await complete(source);

    expect(concurrent).toEqual(first);
    expect(repeated).toEqual(first);
    expect(first).toMatchObject({
      lifecycleEvent: { sourceVersion: 2, status: "completed" },
      sourceCommandId: ids.command,
      status: "accepted",
    });
    expect(source.getState("source-task.synthetic")).toMatchObject({ sourceVersion: 2, status: "completed" });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(audits).toEqual([
      expect.objectContaining({ phase: "attempted" }),
      expect.objectContaining({ phase: "succeeded" }),
    ]);
  });

  it("rejects authorization denial without changing authoritative state", async () => {
    const { audits, source } = setup(false);
    await expect(complete(source)).rejects.toMatchObject({ code: "source_operation_denied" });
    expect(source.getState("source-task.synthetic")).toMatchObject({ sourceVersion: 1, status: "open" });
    expect(audits).toEqual([expect.objectContaining({ errorCode: "source_operation_denied", phase: "failed" })]);
  });

  it.each([
    ["stale version", { expectedSourceVersion: 2 }],
    ["wrong actor context", { actorContextReference: "actor-context.other" }],
    ["wrong workflow task", { workflowTaskId: "workflow-task.other" }],
  ])("rejects %s after current-state recheck", async (_label, overrides) => {
    const { source } = setup();
    await expect(complete(source, command(overrides))).rejects.toMatchObject({ code: "source_state_conflict" });
    expect(source.getState("source-task.synthetic")).toMatchObject({ sourceVersion: 1, status: "open" });
  });

  it("rejects reuse of a command ID with a different fingerprint", async () => {
    const { source } = setup();
    await complete(source);
    await expect(complete(source, command({ workflowCompletionEventId: "10000000-0000-4000-8000-000000000003" })))
      .rejects.toMatchObject({ code: "source_command_conflict" });
  });

  it("derives a stable source command across Task Center lost-receipt retries", async () => {
    const { source } = setup();
    const workflowCompletion = vi.fn(() => Promise.resolve({ eventId: ids.completion, workflowTaskId: "workflow-task.synthetic" }));
    const ports = createWalkingSkeletonTaskPorts({
      actorContextReference: () => Promise.resolve("actor-context.synthetic"),
      source,
      workflowCompletion,
    });
    const taskCommand = {
      actor: { principalId: "principal.synthetic" },
      idempotencyKey: "task-complete.synthetic-0001",
      sourceTaskId: "source-task.synthetic",
      sourceType: walkingSkeletonSourceType,
    };
    const first = await ports.router.complete(taskCommand);
    const second = await ports.router.complete(taskCommand);
    expect(second).toEqual(first);
    expect(workflowCompletion).toHaveBeenCalledTimes(1);
  });

  it("recovers a lost Task Center receipt without repeating the authoritative source effect", async () => {
    const { authorize, source } = setup();
    const workflowCompletion = vi.fn(() => Promise.resolve({ eventId: ids.completion, workflowTaskId: "workflow-task.synthetic" }));
    const ports = createWalkingSkeletonTaskPorts({
      actorContextReference: () => Promise.resolve("actor-context.synthetic"),
      source,
      workflowCompletion,
    });
    const base = new InMemoryTaskCenterStore();
    let loseReceipt = true;
    const store: TaskCenterStore = {
      acceptCommand: (input) => loseReceipt ? (loseReceipt = false, Promise.resolve(false)) : base.acceptCommand(input),
      apply: (event, signal) => base.apply(event, signal),
      claimCommand: (input) => base.claimCommand(input),
      get: (key) => base.get(key),
      list: (input) => base.list(input),
      reconcile: (event) => base.reconcile(event),
      releaseCommand: (input) => base.releaseCommand(input),
    };
    let now = Date.parse("2026-07-30T00:00:00.000Z");
    let lease = 1;
    const center = createTaskCenter({
      audit: { record: () => Promise.resolve() },
      authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.task" }) },
      commandLeaseMs: 1_000,
      commandLeaseToken: () => `30000000-0000-4000-8000-${String(lease++).padStart(12, "0")}`,
      now: () => now,
      router: ports.router,
      sourceReader: ports.sourceReader,
      store,
    });
    const event: TaskLifecycleEvent = {
      assigneeReference: "assignment.synthetic",
      deepLink: { appId: "platform.synthetic", routeId: "platform.synthetic.detail" },
      eventId: "30000000-0000-4000-8000-000000000010",
      occurredAt: "2026-07-30T00:00:00.000Z",
      sourceTaskId: "source-task.synthetic",
      sourceType: walkingSkeletonSourceType,
      sourceVersion: 1,
      status: "open",
    };
    await center.apply(event);
    const taskCommand = {
      actor: { activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" },
      idempotencyKey: "task-complete.synthetic-lost-receipt",
      sourceTaskId: event.sourceTaskId,
      sourceType: event.sourceType,
    };
    await expect(center.complete(taskCommand)).rejects.toMatchObject({ code: "TASK_COMMAND_IN_PROGRESS", retryable: true });
    now += 1_001;
    const recovered = await center.complete(taskCommand);
    await expect(center.complete(taskCommand)).resolves.toEqual(recovered);
    expect(source.getState(event.sourceTaskId)).toMatchObject({ sourceVersion: 2, status: "completed" });
    expect(workflowCompletion).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(1);
  });
});
