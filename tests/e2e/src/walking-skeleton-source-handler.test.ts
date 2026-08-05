import { createEventingCore, type JobEnvelope, type ValidatedMessage } from "@ai-crm/crm-eventing-outbox";
import { InMemoryEventingStore } from "@ai-crm/crm-eventing-outbox/testing";
import { describe, expect, it, vi } from "vitest";

import { createWalkingSkeletonSourceCommandMessageHandler } from "./walking-skeleton-source-handler.js";
import { createWalkingSkeletonSource } from "./walking-skeleton-source.js";

const job = (overrides: Partial<JobEnvelope> = {}): JobEnvelope => ({
  correlationId: "20000000-0000-4000-8000-000000000003",
  idempotencyKey: "source-command.synthetic-0001",
  jobId: "20000000-0000-4000-8000-000000000001",
  jobType: "tests.walking-skeleton.source-command",
  jobVersion: 1,
  payload: {
    action: "complete",
    actorContextReference: "actor-context.synthetic",
    commandId: "20000000-0000-4000-8000-000000000002",
    expectedSourceVersion: 1,
    sourceTaskId: "source-task.synthetic",
    sourceType: "tests.walking-skeleton",
    workflowCompletionEventId: "20000000-0000-4000-8000-000000000004",
    workflowTaskId: "workflow-task.synthetic",
  },
  policy: { backoffSeconds: [30, 300], failureDisposition: "isolate", maxAttempts: 3, timeoutMs: 10_000 },
  requestedAt: "2026-07-30T00:00:00.000Z",
  source: "urn:ai-crm:tests.walking-skeleton",
  ...overrides,
});

const message = (envelope = job()): ValidatedMessage => ({
  availableAt: new Date(envelope.requestedAt),
  correlationId: envelope.correlationId,
  envelope,
  messageId: envelope.jobId,
  messageKind: "job",
  messageType: envelope.jobType,
  messageVersion: envelope.jobVersion,
  occurredAt: new Date(envelope.requestedAt),
  payloadSha256: "a".repeat(64),
  producer: envelope.source,
  serialized: JSON.stringify(envelope),
});

const setup = () => {
  const source = createWalkingSkeletonSource({
    audit: { record: vi.fn(() => Promise.resolve()) },
    authorization: { authorize: vi.fn(() => Promise.resolve({ allowed: true, decisionId: "decision.synthetic" })) },
    clock: () => new Date("2026-07-30T00:00:00.000Z"),
    resolver: { resolve: vi.fn(() => Promise.resolve({ activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" })) },
  });
  source.register({
    actorContextReference: "actor-context.synthetic",
    assigneeReference: "assignment.synthetic",
    sourceTaskId: "source-task.synthetic",
    sourceVersion: 1,
    status: "open",
    workflowTaskId: "workflow-task.synthetic",
  });
  return { handler: createWalkingSkeletonSourceCommandMessageHandler(source), source };
};

describe("Walking Skeleton source-command Worker message handler", () => {
  it("rechecks authoritative state and accepts duplicate delivery idempotently", async () => {
    const { handler, source } = setup();
    const envelope = job();
    const core = createEventingCore(new InMemoryEventingStore());
    await core.submitJob(envelope);
    await expect(core.consume({ attempt: 1, consumer: "tests.walking-skeleton-source", envelope }, handler)).resolves.toEqual({ status: "completed" });
    await expect(core.consume({ attempt: 2, consumer: "tests.walking-skeleton-source", envelope }, handler)).resolves.toEqual({ status: "duplicate" });
    expect(source.getState("source-task.synthetic")).toMatchObject({ sourceVersion: 2, status: "completed" });
  });

  it("returns false when authoritative state no longer matches the requested version", async () => {
    const { handler } = setup();
    const value = message();
    const signal = new AbortController().signal;
    await handler.handle(value, signal);
    await expect(handler.recheckAuthoritativeState?.(value, signal)).resolves.toBe(false);
  });

  it("rejects contract policy drift before invoking the source", async () => {
    const { handler, source } = setup();
    const invalid = message(job({ policy: { backoffSeconds: [1, 2], failureDisposition: "isolate", maxAttempts: 3, timeoutMs: 10_000 } }));
    await expect(handler.handle(invalid, new AbortController().signal)).rejects.toMatchObject({ code: "eventing_invalid_input" });
    expect(source.getState("source-task.synthetic")).toMatchObject({ status: "open" });
  });
});
