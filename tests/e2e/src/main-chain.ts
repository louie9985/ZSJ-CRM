import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEventingCore,
  createOutboxPublisher,
  createRabbitConfirmTransport,
  EventingError,
  type EventingObservation,
  type EventingStore,
  type JobEnvelope,
  type OutboxPublication,
} from "@ai-crm/platform-eventing-outbox";
import { InMemoryEventingStore } from "@ai-crm/platform-eventing-outbox/testing";
import { createNotificationCenter, InMemoryNotificationStore, NotificationError, type NotificationActor, type NotificationStore } from "@ai-crm/platform-notifications";
import { createFlowableRestEngine, createWorkflowFacade, type WorkflowAuditRecord, type WorkflowCommandLedger, type WorkflowLifecycleEvent } from "@ai-crm/platform-workflow";
import { createMemoryWorkflowCommandLedger } from "@ai-crm/platform-workflow/testing";
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
import { createWalkingSkeletonSourceCommandMessageHandler, walkingSkeletonSourceJobType, type WalkingSkeletonSourceCommandPort } from "./walking-skeleton-source-handler.js";
import { createWalkingSkeletonSource, WalkingSkeletonSourceError, walkingSkeletonSourceType, type WalkingSkeletonSourceState } from "./walking-skeleton-source.js";

const at = "2026-07-30T00:00:00.000Z";
const actor = Object.freeze({ activeAssignmentIds: Object.freeze(["assignment.synthetic"]), principalId: "principal.synthetic" });
const notificationActor: NotificationActor = actor;
const actorContextReference = "actor-context.synthetic";
const definitionKey = "syntheticHumanTaskV1";
const sourceTaskId = "source-task.main-chain-synthetic";

type SourceOptions = Parameters<typeof createWalkingSkeletonSource>[0];

export interface MainChainSourcePort extends WalkingSkeletonSourceCommandPort {
  getState(sourceTaskId: string): WalkingSkeletonSourceState | Promise<WalkingSkeletonSourceState>;
  register(state: WalkingSkeletonSourceState): void | Promise<void>;
}

export interface MainChainIntegrationFactory {
  readonly createEventingStore: () => EventingStore;
  readonly createNotificationStore: () => NotificationStore;
  readonly createSource: (options: SourceOptions) => MainChainSourcePort;
  readonly createWorkflowLedger: () => WorkflowCommandLedger;
  readonly durable: boolean;
}

export function createMainChainIntegrationFactory(overrides: Partial<MainChainIntegrationFactory> = {}): MainChainIntegrationFactory {
  return Object.freeze({
    createEventingStore: overrides.createEventingStore ?? (() => new InMemoryEventingStore()),
    createNotificationStore: overrides.createNotificationStore ?? (() => new InMemoryNotificationStore()),
    createSource: overrides.createSource ?? createWalkingSkeletonSource,
    createWorkflowLedger: overrides.createWorkflowLedger ?? createMemoryWorkflowCommandLedger,
    durable: overrides.durable ?? false,
  });
}

function configuration(): { readonly flowableBaseUrl: string; readonly flowablePasswordFile: string } {
  const flowableBaseUrl = process.env["TEST_FLOWABLE_BASE_URL"];
  const flowablePasswordFile = process.env["TEST_FLOWABLE_PASSWORD_FILE"];
  if (flowableBaseUrl === undefined || flowablePasswordFile === undefined || resolve(flowablePasswordFile) !== flowablePasswordFile) throw new Error("e2e_main_chain_configuration_invalid");
  const parsed = new URL(flowableBaseUrl);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.pathname.endsWith("/flowable-rest/service/")) throw new Error("e2e_main_chain_configuration_invalid");
  return Object.freeze({ flowableBaseUrl, flowablePasswordFile });
}

async function rabbitConnection(role: "consumer" | "publisher"): Promise<RabbitConnectionConfiguration> {
  const directory = process.env["AI_CRM_RABBITMQ_FIXTURE_DIR"];
  const port = Number(process.env["AI_CRM_TEST_RABBITMQ_TLS_PORT"]);
  if (directory === undefined || resolve(directory) !== directory || !Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("e2e_main_chain_rabbit_configuration_invalid");
  const text = async (name: string): Promise<string> => (await readFile(resolve(directory, name), "utf8")).trim();
  return Object.freeze({
    ca: await readFile(resolve(directory, "ca.pem")), heartbeatSeconds: 10, hostname: "127.0.0.1",
    password: await text(`${role}_password`), port, servername: "rabbitmq.integration.test", tls: true,
    username: await text(`${role}_username`), vhost: await text("vhost"),
  });
}

async function waitUntil(assertion: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!await assertion()) {
    if (Date.now() >= deadline) throw new Error("e2e_main_chain_timeout");
    await new Promise<void>((resolveWait) => { setTimeout(resolveWait, 25); });
  }
}

function job(input: { readonly id: "source" | "notification"; readonly workflowEventId: string; readonly workflowTaskId: string }): JobEnvelope {
  const source = input.id === "source";
  return Object.freeze({
    correlationId: source ? "91000000-0000-4000-8000-000000000003" : "92000000-0000-4000-8000-000000000003",
    idempotencyKey: source ? "source-command.main-chain-0001" : "notification-job.main-chain-0001",
    jobId: source ? "91000000-0000-4000-8000-000000000001" : "92000000-0000-4000-8000-000000000001",
    jobType: source ? walkingSkeletonSourceJobType : walkingSkeletonNotificationJobType,
    jobVersion: 1,
    payload: source ? Object.freeze({
      action: "complete", actorContextReference, commandId: "91000000-0000-4000-8000-000000000002",
      expectedSourceVersion: 1, sourceTaskId, sourceType: walkingSkeletonSourceType,
      workflowCompletionEventId: input.workflowEventId, workflowTaskId: input.workflowTaskId,
    }) : Object.freeze({
      actorContextReference,
      intent: Object.freeze({
        deepLink: Object.freeze({ applicationId: "platform.synthetic", resourceId: sourceTaskId, resourceType: "synthetic-resource", routeId: "platform.synthetic.detail" }),
        idempotencyKey: "notification.main-chain-0001", intentId: "92000000-0000-4000-8000-000000000002", producer: "tests.walking-skeleton",
        selectors: Object.freeze([Object.freeze({ referenceId: "assignment.synthetic", selectorType: "assignment" })]),
        sourceId: sourceTaskId, sourceType: walkingSkeletonSourceType, templateKey: "platform.synthetic.notice", templateVersion: 1,
        variables: Object.freeze({ subject: "synthetic task" }),
      }),
    }),
    policy: Object.freeze({ backoffSeconds: walkingSkeletonJobPolicy.backoffSeconds, failureDisposition: "isolate", maxAttempts: 3, timeoutMs: 10_000 }),
    requestedAt: at, source: "urn:ai-crm:tests.walking-skeleton",
  });
}

function duplicate(envelope: JobEnvelope): OutboxPublication {
  return Object.freeze({ attempt: 1, correlationId: envelope.correlationId, messageId: envelope.jobId, messageKind: "job", messageType: envelope.jobType, messageVersion: envelope.jobVersion, payload: JSON.stringify(envelope), producer: envelope.source });
}

function classify(error: unknown): "retryable" | "terminal" {
  return (error instanceof EventingError || error instanceof NotificationError || error instanceof WalkingSkeletonSourceError) && error.retryable
    ? "retryable"
    : "terminal";
}

function lifecycleEventId(eventKey: string): string {
  const hex = createHash("sha256").update(eventKey).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "8";
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export async function runMainChainIntegration(factory = createMainChainIntegrationFactory()): Promise<void> {
  const config = configuration();
  const password = (await readFile(config.flowablePasswordFile, "utf8")).trim();
  if (password.length < 20) throw new Error("e2e_main_chain_flowable_secret_invalid");
  const bpmnPath = fileURLToPath(new URL("../../../deploy/flowable/bpmn/synthetic-human-task.v1.bpmn20.xml", import.meta.url));
  const engine = createFlowableRestEngine({ baseUrl: config.flowableBaseUrl, password, timeoutMs: 10_000, username: "dev_flowable_admin" });
  const workflowAudit: WorkflowAuditRecord[] = [];
  const lifecycle: WorkflowLifecycleEvent[] = [];
  const facade = createWorkflowFacade(
    engine, factory.createWorkflowLedger(),
    { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.workflow.main-chain" }) },
    { record: (record) => { workflowAudit.push(record); return Promise.resolve(); } },
    { publish: (event) => { lifecycle.push(event); return Promise.resolve(); } },
    { variablePolicy: { definitions: { [definitionKey]: {} } } },
  );
  const definition = await facade.deployDefinition({ actor, assetName: "synthetic-human-task.v1.bpmn20.xml", assetVersion: "1.0.0", bpmnXml: await readFile(bpmnPath, "utf8"), definitionKey, idempotencyKey: "main-chain-definition.synthetic-v1" });
  const instance = await facade.startProcess({ actor, definitionKey, definitionVersion: definition.version, idempotencyKey: "main-chain-process.synthetic-0001", variables: {} });
  const tasks = await facade.listTasks(instance.processInstanceId);
  const workflowTask = tasks.length === 1 ? tasks[0] : undefined;
  if (workflowTask === undefined || workflowTask.status !== "active") throw new Error("e2e_main_chain_flowable_task_invalid");
  await facade.completeTask({ actor, definitionKey, idempotencyKey: "main-chain-workflow-complete.synthetic-0001", taskId: workflowTask.taskId });
  const completion = lifecycle.find((event) => event.eventType === "workflow.task-lifecycle.v1" && event.data.occurrence === "completed");
  if (completion === undefined) throw new Error("e2e_main_chain_workflow_event_missing");

  const observations: EventingObservation[] = [];
  const eventStore = factory.createEventingStore();
  const core = createEventingCore(eventStore, { observer: { record: (observation) => { observations.push(observation); } } });
  let sourceAuthorizations = 0;
  const source = factory.createSource({
    audit: { record: () => Promise.resolve() },
    authorization: { authorize: () => { sourceAuthorizations += 1; return Promise.resolve({ allowed: true, decisionId: "decision.source.main-chain" }); } },
    clock: () => new Date(at), resolver: { resolve: () => Promise.resolve(actor) },
  });
  await source.register({ actorContextReference, assigneeReference: actor.activeAssignmentIds[0] ?? "", sourceTaskId, sourceVersion: 1, status: "open", workflowTaskId: workflowTask.taskId });
  const notificationStore = factory.createNotificationStore();
  const notifications = createNotificationCenter({
    audit: { record: () => Promise.resolve() }, authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.notification.main-chain" }) }, now: () => new Date(at),
    preference: { evaluate: () => Promise.resolve({ decision: "deliver", reason: "synthetic-default", version: "synthetic-v1" }) },
    resolver: { resolve: () => Promise.resolve([{ principalId: actor.principalId, recipientReference: "person.synthetic", resolutionReference: "assignment.synthetic", resolutionVersion: "organization-synthetic-v1" }]) }, store: notificationStore,
  });
  await notifications.publishTemplate({ actor: notificationActor, bodyTemplate: "Open {{subject}}.", notificationType: "platform.synthetic", ownerReference: "tests.walking-skeleton", publishedAt: at, templateKey: "platform.synthetic.notice", titleTemplate: "Update {{subject}}", variableSchema: { additionalProperties: false, properties: { subject: { type: "string" } }, required: ["subject"], type: "object" }, version: 1 });

  const controller = new AbortController();
  let publisherAdapter: Awaited<ReturnType<typeof createAmqplibPublisherAdapter>> | undefined;
  let runFailure: unknown;
  let running: Promise<void> | undefined;
  let worker: ReturnType<typeof createRabbitInboxHandler> | undefined;
  try {
    const consumer = await createAmqplibConsumerAdapter(await rabbitConnection("consumer"), [walkingSkeletonSourceRabbitTopology, walkingSkeletonNotificationRabbitTopology], { concurrency: walkingSkeletonJobPolicy.concurrency, prefetch: walkingSkeletonJobPolicy.prefetch });
    const bindings: readonly RabbitInboxBinding[] = Object.freeze([
      Object.freeze({ bindingId: walkingSkeletonSourceBindingId, classify, consumer: walkingSkeletonSourceConsumerId, eventPolicy: walkingSkeletonJobPolicy, handler: createWalkingSkeletonSourceCommandMessageHandler(source) }),
      Object.freeze({ bindingId: walkingSkeletonNotificationBindingId, classify, consumer: walkingSkeletonNotificationConsumerId, eventPolicy: walkingSkeletonJobPolicy, handler: createWalkingSkeletonNotificationMessageHandler(notifications, { resolve: () => Promise.resolve(notificationActor) }) }),
    ]);
    worker = createRabbitInboxHandler(core, consumer, bindings);
    publisherAdapter = await createAmqplibPublisherAdapter(await rabbitConnection("publisher"));
    const transport = await createRabbitConfirmTransport(publisherAdapter.channel, { exchange: "ai-crm.tests.events.v1", exchangeType: "topic", routes: [
      { messageKind: "job", messageType: walkingSkeletonSourceJobType, messageVersion: 1, routingKey: walkingSkeletonSourceRabbitTopology.routingKey },
      { messageKind: "job", messageType: walkingSkeletonNotificationJobType, messageVersion: 1, routingKey: walkingSkeletonNotificationRabbitTopology.routingKey },
    ] });
    const publisher = createOutboxPublisher(eventStore, transport, { backoffSeconds: [1, 2], batchSize: 10, claimLeaseSeconds: 5, maxAttempts: 3 });
    await worker.ready(controller.signal);
    running = Promise.resolve(worker.run(controller.signal)).catch((error: unknown) => { runFailure = error; });
    const workflowEventId = lifecycleEventId(completion.data.eventKey);
    const sourceEnvelope = job({ id: "source", workflowEventId, workflowTaskId: workflowTask.taskId });
    const notificationEnvelope = job({ id: "notification", workflowEventId, workflowTaskId: workflowTask.taskId });
    await core.submitJob(sourceEnvelope);
    await core.submitJob(notificationEnvelope);
    const published = await publisher.publishBatch();
    if (published.published !== 2) throw new Error("e2e_main_chain_publish_failed");
    await waitUntil(async () => (await source.getState(sourceTaskId)).status === "completed" && await notifications.unreadCount(notificationActor) === 1);
    await transport.publish(duplicate(sourceEnvelope));
    await transport.publish(duplicate(notificationEnvelope));
    await waitUntil(() => observations.filter((item) => item.operation === "consume" && item.outcome === "duplicate").length >= 2);
    const completedTask = await engine.getTask(workflowTask.taskId);
    const completedInstance = await engine.getInstance(instance.processInstanceId);
    const finalSource = await source.getState(sourceTaskId);
    if (runFailure !== undefined) {
      throw runFailure instanceof Error ? runFailure : new Error("e2e_main_chain_worker_failed", { cause: runFailure });
    }
    if (completedTask.status !== "completed" || completedInstance.status !== "completed" || finalSource.sourceVersion !== 2 || sourceAuthorizations !== 1 || await notifications.unreadCount(notificationActor) !== 1 || workflowAudit.filter((record) => record.operation === "task_complete" && record.phase === "succeeded").length !== 1) throw new Error("e2e_main_chain_result_invalid");
    process.stdout.write(`${JSON.stringify({ durable: factory.durable, flowableInstanceStatus: completedInstance.status, flowableTaskStatus: completedTask.status, inboxDuplicates: 2, mainWalkingSkeletonReady: false, notifications: 1, sourceAuthorizations, sourceVersion: finalSource.sourceVersion, status: factory.durable ? "e2e-main-chain-durable-slice-passed" : "e2e-main-chain-slice-passed" })}\n`);
  } finally {
    controller.abort();
    await running;
    await worker?.stop?.();
    await publisherAdapter?.close();
  }
}

if (process.env["AI_CRM_E2E_MAIN_CHAIN_INTEGRATION"] === "true" && process.env["AI_CRM_E2E_MAIN_CHAIN_MODE"] !== "durable") await runMainChainIntegration();
