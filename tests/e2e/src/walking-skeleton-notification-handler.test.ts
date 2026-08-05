import { createEventingCore, type JobEnvelope, type ValidatedMessage } from "@ai-crm/crm-eventing-outbox";
import { InMemoryEventingStore } from "@ai-crm/crm-eventing-outbox/testing";
import {
  createNotificationCenter,
  InMemoryNotificationStore,
  type NotificationActor,
} from "@ai-crm/crm-notifications";
import { describe, expect, it, vi } from "vitest";

import { createWalkingSkeletonNotificationMessageHandler } from "./walking-skeleton-notification-handler.js";

const actor: NotificationActor = { activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" };
const intent = {
  deepLink: { applicationId: "crm.synthetic", resourceId: "source-task.synthetic", resourceType: "synthetic-resource", routeId: "crm.synthetic.detail" },
  idempotencyKey: "notification.synthetic-0001",
  intentId: "40000000-0000-4000-8000-000000000002",
  producer: "tests.walking-skeleton",
  selectors: [{ referenceId: "assignment.synthetic", selectorType: "assignment" }],
  sourceId: "source-task.synthetic",
  sourceType: "tests.walking-skeleton",
  templateKey: "crm.synthetic.notice",
  templateVersion: 1,
  variables: { subject: "synthetic task" },
} as const;

const job = (overrides: Partial<JobEnvelope> = {}): JobEnvelope => ({
  correlationId: "40000000-0000-4000-8000-000000000003",
  idempotencyKey: "notification-job.synthetic-0001",
  jobId: "40000000-0000-4000-8000-000000000001",
  jobType: "crm.notifications.intent-submit",
  jobVersion: 1,
  payload: { actorContextReference: "actor-context.synthetic", intent },
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
  payloadSha256: "b".repeat(64),
  producer: envelope.source,
  serialized: JSON.stringify(envelope),
});

const setup = async (allowed = true) => {
  const store = new InMemoryNotificationStore();
  const authorize = vi.fn((input: { readonly operation: string }) => Promise.resolve({
    allowed: allowed || input.operation === "notification_template_publish",
    decisionId: "decision.notification",
  }));
  const center = createNotificationCenter({
    audit: { record: () => Promise.resolve() },
    authorization: { authorize },
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    preference: { evaluate: () => Promise.resolve({ decision: "deliver", reason: "synthetic-default", version: "synthetic-v1" }) },
    resolver: { resolve: () => Promise.resolve([{ principalId: actor.principalId, recipientReference: "person.synthetic", resolutionReference: "assignment.synthetic", resolutionVersion: "organization-synthetic-v1" }]) },
    store,
  });
  await center.publishTemplate({
    actor,
    bodyTemplate: "Open {{subject}}.",
    notificationType: "crm.synthetic",
    ownerReference: "tests.walking-skeleton",
    publishedAt: "2026-07-30T00:00:00.000Z",
    templateKey: intent.templateKey,
    titleTemplate: "Update {{subject}}",
    variableSchema: { additionalProperties: false, properties: { subject: { type: "string" } }, required: ["subject"], type: "object" },
    version: 1,
  });
  const resolve = vi.fn(() => Promise.resolve(actor));
  return { authorize, center, handler: createWalkingSkeletonNotificationMessageHandler(center, { resolve }), resolve };
};

describe("Walking Skeleton Notification Job Handler", () => {
  it("resolves actor server-side and lets Notification Center deduplicate delivery", async () => {
    const { center, handler, resolve } = await setup();
    const envelope = job();
    const core = createEventingCore(new InMemoryEventingStore());
    await core.submitJob(envelope);
    await expect(core.consume({ attempt: 1, consumer: "tests.notification-intent", envelope }, handler)).resolves.toEqual({ status: "completed" });
    await expect(core.consume({ attempt: 2, consumer: "tests.notification-intent", envelope }, handler)).resolves.toEqual({ status: "duplicate" });
    expect(resolve).toHaveBeenCalledTimes(1);
    await expect(center.unreadCount(actor)).resolves.toBe(1);
    await expect(center.list({ actor })).resolves.toMatchObject({ items: [{ sourceId: intent.sourceId, title: "Update synthetic task" }] });
  });

  it("does not treat the Job actor reference as authorization", async () => {
    const { center, handler } = await setup(false);
    await expect(handler.handle(message(), new AbortController().signal)).rejects.toMatchObject({ code: "NOTIFICATION_OPERATION_DENIED" });
    await expect(center.unreadCount(actor)).rejects.toMatchObject({ code: "NOTIFICATION_OPERATION_DENIED" });
  });

  it("rejects additional payload properties before resolving the actor", async () => {
    const { handler, resolve } = await setup();
    const value = job({ payload: { actorContextReference: "actor-context.synthetic", intent, trustedActor: { activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" } } });
    await expect(handler.handle(message(value), new AbortController().signal)).rejects.toMatchObject({ code: "eventing_invalid_input" });
    expect(resolve).not.toHaveBeenCalled();
  });
});
