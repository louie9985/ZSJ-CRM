import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createEventingCore,
  createOutboxPublisher,
  createRabbitConfirmTransport,
  EventingError,
  type EventingObservation,
  type JobEnvelope,
  type OutboxPublication,
} from "@ai-crm/platform-eventing-outbox";
import { InMemoryEventingStore } from "@ai-crm/platform-eventing-outbox/testing";
import {
  createNotificationCenter,
  InMemoryNotificationStore,
  NotificationError,
  type NotificationActor,
} from "@ai-crm/platform-notifications";
import {
  createAmqplibConsumerAdapter,
  createAmqplibPublisherAdapter,
  createRabbitInboxHandler,
  type RabbitConnectionConfiguration,
  type RabbitInboxBinding,
} from "@ai-crm/worker";

import { createWalkingSkeletonNotificationMessageHandler, walkingSkeletonNotificationJobType } from "./walking-skeleton-notification-handler.js";
import {
  walkingSkeletonJobPolicy,
  walkingSkeletonNotificationBindingId,
  walkingSkeletonNotificationConsumerId,
  walkingSkeletonNotificationRabbitTopology,
  walkingSkeletonSourceBindingId,
  walkingSkeletonSourceConsumerId,
  walkingSkeletonSourceRabbitTopology,
} from "./walking-skeleton-rabbit.js";
import { createWalkingSkeletonSourceCommandMessageHandler, walkingSkeletonSourceJobType } from "./walking-skeleton-source-handler.js";
import { createWalkingSkeletonSource, WalkingSkeletonSourceError } from "./walking-skeleton-source.js";

const at = "2026-07-30T00:00:00.000Z";
const actor: NotificationActor = { activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" };

async function waitUntil(assertion: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!await assertion()) {
    if (Date.now() >= deadline) throw new Error("e2e_rabbit_job_timeout");
    await new Promise<void>((resolveWait) => { setTimeout(resolveWait, 25); });
  }
}

async function connection(role: "consumer" | "publisher"): Promise<RabbitConnectionConfiguration> {
  const directory = process.env["AI_CRM_RABBITMQ_FIXTURE_DIR"];
  const port = Number(process.env["AI_CRM_TEST_RABBITMQ_TLS_PORT"]);
  if (directory === undefined || resolve(directory) !== directory || !Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("e2e_rabbit_fixture_invalid");
  const text = async (name: string): Promise<string> => (await readFile(resolve(directory, name), "utf8")).trim();
  return Object.freeze({
    ca: await readFile(resolve(directory, "ca.pem")),
    heartbeatSeconds: 10,
    hostname: "127.0.0.1",
    password: await text(`${role}_password`),
    port,
    servername: "rabbitmq.integration.test",
    tls: true,
    username: await text(`${role}_username`),
    vhost: await text("vhost"),
  });
}

function sourceJob(): JobEnvelope {
  return Object.freeze({
    correlationId: "60000000-0000-4000-8000-000000000003",
    idempotencyKey: "source-command.rabbit-0001",
    jobId: "60000000-0000-4000-8000-000000000001",
    jobType: walkingSkeletonSourceJobType,
    jobVersion: 1,
    payload: Object.freeze({
      action: "complete",
      actorContextReference: "actor-context.synthetic",
      commandId: "60000000-0000-4000-8000-000000000002",
      expectedSourceVersion: 1,
      sourceTaskId: "source-task.synthetic",
      sourceType: "tests.walking-skeleton",
      workflowCompletionEventId: "60000000-0000-4000-8000-000000000004",
      workflowTaskId: "workflow-task.synthetic",
    }),
    policy: Object.freeze({ backoffSeconds: walkingSkeletonJobPolicy.backoffSeconds, failureDisposition: "isolate", maxAttempts: 3, timeoutMs: 10_000 }),
    requestedAt: at,
    source: "urn:ai-crm:tests.walking-skeleton",
  });
}

function notificationJob(): JobEnvelope {
  return Object.freeze({
    correlationId: "70000000-0000-4000-8000-000000000003",
    idempotencyKey: "notification-job.rabbit-0001",
    jobId: "70000000-0000-4000-8000-000000000001",
    jobType: walkingSkeletonNotificationJobType,
    jobVersion: 1,
    payload: Object.freeze({
      actorContextReference: "actor-context.synthetic",
      intent: Object.freeze({
        deepLink: Object.freeze({ applicationId: "platform.synthetic", resourceId: "source-task.synthetic", resourceType: "synthetic-resource", routeId: "platform.synthetic.detail" }),
        idempotencyKey: "notification.rabbit-0001",
        intentId: "70000000-0000-4000-8000-000000000002",
        producer: "tests.walking-skeleton",
        selectors: Object.freeze([Object.freeze({ referenceId: "assignment.synthetic", selectorType: "assignment" })]),
        sourceId: "source-task.synthetic",
        sourceType: "tests.walking-skeleton",
        templateKey: "platform.synthetic.notice",
        templateVersion: 1,
        variables: Object.freeze({ subject: "synthetic task" }),
      }),
    }),
    policy: Object.freeze({ backoffSeconds: walkingSkeletonJobPolicy.backoffSeconds, failureDisposition: "isolate", maxAttempts: 3, timeoutMs: 10_000 }),
    requestedAt: at,
    source: "urn:ai-crm:tests.walking-skeleton",
  });
}

function duplicatePublication(envelope: JobEnvelope): OutboxPublication {
  return Object.freeze({
    attempt: 1,
    correlationId: envelope.correlationId,
    messageId: envelope.jobId,
    messageKind: "job",
    messageType: envelope.jobType,
    messageVersion: envelope.jobVersion,
    payload: JSON.stringify(envelope),
    producer: envelope.source,
  });
}

function classify(error: unknown): "retryable" | "terminal" {
  return (error instanceof EventingError || error instanceof NotificationError || error instanceof WalkingSkeletonSourceError) && error.retryable
    ? "retryable"
    : "terminal";
}

export async function runWalkingSkeletonRabbitJobIntegration(): Promise<void> {
  const observations: EventingObservation[] = [];
  const store = new InMemoryEventingStore();
  const core = createEventingCore(store, { observer: { record: (observation) => { observations.push(observation); } } });
  const source = createWalkingSkeletonSource({
    audit: { record: () => Promise.resolve() },
    authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.source" }) },
    clock: () => new Date(at),
    resolver: { resolve: () => Promise.resolve({ activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" }) },
  });
  source.register({ actorContextReference: "actor-context.synthetic", assigneeReference: "assignment.synthetic", sourceTaskId: "source-task.synthetic", sourceVersion: 1, status: "open", workflowTaskId: "workflow-task.synthetic" });
  const notificationStore = new InMemoryNotificationStore();
  const notifications = createNotificationCenter({
    audit: { record: () => Promise.resolve() },
    authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.notification" }) },
    now: () => new Date(at),
    preference: { evaluate: () => Promise.resolve({ decision: "deliver", reason: "synthetic-default", version: "synthetic-v1" }) },
    resolver: { resolve: () => Promise.resolve([{ principalId: actor.principalId, recipientReference: "person.synthetic", resolutionReference: "assignment.synthetic", resolutionVersion: "organization-synthetic-v1" }]) },
    store: notificationStore,
  });
  await notifications.publishTemplate({ actor, bodyTemplate: "Open {{subject}}.", notificationType: "platform.synthetic", ownerReference: "tests.walking-skeleton", publishedAt: at, templateKey: "platform.synthetic.notice", titleTemplate: "Update {{subject}}", variableSchema: { additionalProperties: false, properties: { subject: { type: "string" } }, required: ["subject"], type: "object" }, version: 1 });

  const consumer = await createAmqplibConsumerAdapter(
    await connection("consumer"),
    [walkingSkeletonSourceRabbitTopology, walkingSkeletonNotificationRabbitTopology],
    { concurrency: walkingSkeletonJobPolicy.concurrency, prefetch: walkingSkeletonJobPolicy.prefetch },
  );
  const bindings: readonly RabbitInboxBinding[] = Object.freeze([
    Object.freeze({ bindingId: walkingSkeletonSourceBindingId, classify, consumer: walkingSkeletonSourceConsumerId, eventPolicy: walkingSkeletonJobPolicy, handler: createWalkingSkeletonSourceCommandMessageHandler(source) }),
    Object.freeze({ bindingId: walkingSkeletonNotificationBindingId, classify, consumer: walkingSkeletonNotificationConsumerId, eventPolicy: walkingSkeletonJobPolicy, handler: createWalkingSkeletonNotificationMessageHandler(notifications, { resolve: () => Promise.resolve(actor) }) }),
  ]);
  const worker = createRabbitInboxHandler(core, consumer, bindings);
  const publisherAdapter = await createAmqplibPublisherAdapter(await connection("publisher"));
  const transport = await createRabbitConfirmTransport(publisherAdapter.channel, {
    exchange: "ai-crm.tests.events.v1",
    exchangeType: "topic",
    routes: [
      { messageKind: "job", messageType: walkingSkeletonSourceJobType, messageVersion: 1, routingKey: walkingSkeletonSourceRabbitTopology.routingKey },
      { messageKind: "job", messageType: walkingSkeletonNotificationJobType, messageVersion: 1, routingKey: walkingSkeletonNotificationRabbitTopology.routingKey },
    ],
  });
  const publisher = createOutboxPublisher(store, transport, { backoffSeconds: [1, 2], batchSize: 10, claimLeaseSeconds: 5, maxAttempts: 3 });
  const controller = new AbortController();
  let running: Promise<void> | undefined;
  try {
    await worker.ready(controller.signal);
    running = Promise.resolve(worker.run(controller.signal));
    const sourceEnvelope = sourceJob();
    const notificationEnvelope = notificationJob();
    await core.submitJob(sourceEnvelope);
    await core.submitJob(notificationEnvelope);
    const published = await publisher.publishBatch();
    if (published.published !== 2) throw new Error("e2e_rabbit_job_publish_failed");
    await waitUntil(async () => source.getState("source-task.synthetic").status === "completed" && await notifications.unreadCount(actor) === 1);
    await transport.publish(duplicatePublication(sourceEnvelope));
    await transport.publish(duplicatePublication(notificationEnvelope));
    await waitUntil(() => observations.filter((item) => item.operation === "consume" && item.outcome === "duplicate").length >= 2);
    if (source.getState("source-task.synthetic").sourceVersion !== 2 || await notifications.unreadCount(actor) !== 1) throw new Error("e2e_rabbit_job_duplicate_effect");
    process.stdout.write(`${JSON.stringify({ inboxDuplicates: 2, notifications: 1, sourceVersion: 2, status: "e2e-rabbit-jobs-passed" })}\n`);
  } finally {
    controller.abort();
    await running?.catch(() => undefined);
    await worker.stop?.();
    await publisherAdapter.close();
  }
}

if (process.env["AI_CRM_E2E_RABBIT_JOB_INTEGRATION"] === "true") await runWalkingSkeletonRabbitJobIntegration();
