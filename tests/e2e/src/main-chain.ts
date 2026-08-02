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
  type MessageHandler,
  type OutboxPublication,
} from "@ai-crm/platform-eventing-outbox";
import { InMemoryEventingStore } from "@ai-crm/platform-eventing-outbox/testing";
import { createFormSchemaService, createMemoryFormSchemaStore, FormSchemaError, type FormAudit, type FormSchemaStore } from "@ai-crm/platform-form-schema";
import type { FileReference } from "@ai-crm/platform-file-center";
import { createNotificationCenter, InMemoryNotificationStore, NotificationError, type NotificationActor, type NotificationStore } from "@ai-crm/platform-notifications";
import { createTaskCenter, InMemoryTaskCenterStore, TaskCenterError, type CompleteTaskCommand, type TaskAudit, type TaskCenterStore, type TaskLifecycleEvent } from "@ai-crm/platform-task-center";
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
import { auditOperationId, stableUuid, type MainChainEvidence } from "./durable-evidence.js";
import type { WalkingSkeletonFormSubmissionReceipt } from "./walking-skeleton-form-submission.js";
import { assertDurableAuditCorrelationEvidence } from "./durable-audit-evidence.js";

const at = "2026-07-30T00:00:00.000Z";
const actor = Object.freeze({ activeAssignmentIds: Object.freeze(["assignment.synthetic"]), principalId: "principal.synthetic" });
const actorContextReference = "actor-context.synthetic";
const definitionKey = "syntheticHumanTaskV1";
const sourceTaskId = "source-task.main-chain-synthetic";
const defaultTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const defaultTraceparent = `00-${defaultTraceId}-00f067aa0ba902b7-01`;
const formDefinitionId = "platform.synthetic.task-completion";
const defaultSubmissionReference = "submission.main-chain-synthetic-0001";
const defaultFileReference: FileReference = Object.freeze({
  contentVersionId: "93000000-0000-4000-8000-000000000002",
  displayName: "synthetic-clean-fixture.txt",
  fileId: "93000000-0000-4000-8000-000000000001",
  mediaType: "text/plain",
  sizeBytes: 24,
  version: 1,
});
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseExternalMainChainInput(input: Readonly<{
  readonly fileReferenceJson: string;
  readonly traceId: string;
  readonly traceparent: string;
}>): Readonly<{ readonly fileReference: FileReference; readonly traceId: string; readonly traceparent: string }> {
  const match = TRACEPARENT.exec(input.traceparent);
  if (match === null || match[1] !== input.traceId || /^0+$/u.test(input.traceId) || /^0+$/u.test(match[2] ?? "")) {
    throw new Error("e2e_main_chain_external_trace_invalid");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(input.fileReferenceJson) as unknown; }
  catch { throw new Error("e2e_main_chain_external_file_reference_invalid"); }
  const allowed = ["contentVersionId", "displayName", "fileId", "mediaType", "sizeBytes", "version"];
  if (!record(parsed) || Object.keys(parsed).some((key) => !allowed.includes(key)) ||
    typeof parsed["contentVersionId"] !== "string" || !UUID.test(parsed["contentVersionId"]) ||
    typeof parsed["fileId"] !== "string" || !UUID.test(parsed["fileId"]) ||
    typeof parsed["displayName"] !== "string" || parsed["displayName"].length < 1 || parsed["displayName"].length > 255 || /[\0\r\n]/u.test(parsed["displayName"]) ||
    parsed["version"] !== 1 ||
    (parsed["mediaType"] !== undefined && (typeof parsed["mediaType"] !== "string" || parsed["mediaType"].length < 1 || parsed["mediaType"].length > 255 || /[\0\r\n]/u.test(parsed["mediaType"]))) ||
    (parsed["sizeBytes"] !== undefined && (!Number.isSafeInteger(parsed["sizeBytes"]) || (parsed["sizeBytes"] as number) < 0))) {
    throw new Error("e2e_main_chain_external_file_reference_invalid");
  }
  const fileReference: FileReference = Object.freeze({
    contentVersionId: parsed["contentVersionId"], displayName: parsed["displayName"], fileId: parsed["fileId"], version: 1,
    ...(typeof parsed["mediaType"] === "string" ? { mediaType: parsed["mediaType"] } : {}),
    ...(parsed["sizeBytes"] === undefined ? {} : { sizeBytes: Number(parsed["sizeBytes"]) }),
  });
  return Object.freeze({ fileReference, traceId: input.traceId, traceparent: input.traceparent });
}

export function externalMainChainInputFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  requireExternalEvidence: boolean,
): ReturnType<typeof parseExternalMainChainInput> | undefined {
  const values = {
    fileReferenceJson: environment["AI_CRM_E2E_FILE_REFERENCE_JSON"],
    traceId: environment["AI_CRM_E2E_BROWSER_TRACE_ID"],
    traceparent: environment["AI_CRM_E2E_BROWSER_TRACEPARENT"],
  };
  const count = Object.values(values).filter((value) => value !== undefined).length;
  if (count !== 0 && count !== 3) throw new Error("e2e_durable_main_chain_external_evidence_incomplete");
  if (requireExternalEvidence && count !== 3) throw new Error("e2e_durable_main_chain_external_evidence_required");
  return count === 3
    ? parseExternalMainChainInput({
        fileReferenceJson: values.fileReferenceJson ?? "",
        traceId: values.traceId ?? "",
        traceparent: values.traceparent ?? "",
      })
    : undefined;
}

type SourceOptions = Parameters<typeof createWalkingSkeletonSource>[0];

export interface MainChainSourcePort extends WalkingSkeletonSourceCommandPort {
  getState(sourceTaskId: string): WalkingSkeletonSourceState | Promise<WalkingSkeletonSourceState>;
  register(state: WalkingSkeletonSourceState): void | Promise<void>;
}

export interface MainChainIntegrationFactory {
  readonly browserTaskApiEvidence: boolean;
  readonly createFormStore: () => FormSchemaStore;
  readonly createEventingStore: () => EventingStore;
  readonly createNotificationStore: () => NotificationStore;
  readonly createSource: (options: SourceOptions) => MainChainSourcePort;
  readonly createTaskStore: () => TaskCenterStore;
  readonly createWorkflowLedger: () => WorkflowCommandLedger;
  readonly durable: boolean;
  readonly evidence?: MainChainEvidence;
  readonly externalEvidence: boolean;
  readonly confirmCompletionCommand?: () => CompleteTaskCommand | Promise<CompleteTaskCommand>;
  readonly resolveFileReference: () => FileReference | Promise<FileReference>;
  readonly resolveBrowserFormSubmission?: () => WalkingSkeletonFormSubmissionReceipt | Promise<WalkingSkeletonFormSubmissionReceipt>;
  readonly resolveCompletionCommand: () => CompleteTaskCommand | Promise<CompleteTaskCommand>;
  readonly resolveTraceContext: () => Readonly<{ readonly traceId: string; readonly traceparent: string }> | Promise<Readonly<{ readonly traceId: string; readonly traceparent: string }>>;
}

export function createMainChainIntegrationFactory(overrides: Partial<MainChainIntegrationFactory> = {}): MainChainIntegrationFactory {
  return Object.freeze({
    browserTaskApiEvidence: overrides.browserTaskApiEvidence ?? false,
    createFormStore: overrides.createFormStore ?? createMemoryFormSchemaStore,
    createEventingStore: overrides.createEventingStore ?? (() => new InMemoryEventingStore()),
    createNotificationStore: overrides.createNotificationStore ?? (() => new InMemoryNotificationStore()),
    createSource: overrides.createSource ?? createWalkingSkeletonSource,
    createTaskStore: overrides.createTaskStore ?? (() => new InMemoryTaskCenterStore()),
    createWorkflowLedger: overrides.createWorkflowLedger ?? createMemoryWorkflowCommandLedger,
    durable: overrides.durable ?? false,
    externalEvidence: overrides.externalEvidence ?? false,
    resolveCompletionCommand: overrides.resolveCompletionCommand ?? (() => Object.freeze({ actor, idempotencyKey: "task-complete.main-chain-0001", sourceTaskId, sourceType: walkingSkeletonSourceType })),
    resolveFileReference: overrides.resolveFileReference ?? (() => defaultFileReference),
    resolveTraceContext: overrides.resolveTraceContext ?? (() => Object.freeze({ traceId: defaultTraceId, traceparent: defaultTraceparent })),
    ...(overrides.evidence === undefined ? {} : { evidence: overrides.evidence }),
    ...(overrides.confirmCompletionCommand === undefined ? {} : { confirmCompletionCommand: overrides.confirmCompletionCommand }),
    ...(overrides.resolveBrowserFormSubmission === undefined ? {} : { resolveBrowserFormSubmission: overrides.resolveBrowserFormSubmission }),
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

function job(input: { readonly fileReference: FileReference; readonly formSubmissionReference: string; readonly id: "source" | "notification"; readonly traceparent: string; readonly workflowEventId: string; readonly workflowTaskId: string }): JobEnvelope {
  const source = input.id === "source";
  return Object.freeze({
    correlationId: source ? "91000000-0000-4000-8000-000000000003" : "92000000-0000-4000-8000-000000000003",
    idempotencyKey: source ? "source-command.main-chain-0001" : "notification-job.main-chain-0001",
    jobId: source ? "91000000-0000-4000-8000-000000000001" : "92000000-0000-4000-8000-000000000001",
    jobType: source ? walkingSkeletonSourceJobType : walkingSkeletonNotificationJobType,
    jobVersion: 1,
    payload: source ? Object.freeze({
      action: "complete", actorContextReference, commandId: "91000000-0000-4000-8000-000000000002",
      expectedSourceVersion: 1, fileReferences: [input.fileReference.fileId], formSubmissionReference: input.formSubmissionReference, sourceTaskId, sourceType: walkingSkeletonSourceType,
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
    requestedAt: at, source: "urn:ai-crm:tests.walking-skeleton", traceparent: input.traceparent,
  });
}

function duplicate(envelope: JobEnvelope): OutboxPublication {
  return Object.freeze({ attempt: 1, correlationId: envelope.correlationId, messageId: envelope.jobId, messageKind: "job", messageType: envelope.jobType, messageVersion: envelope.jobVersion, payload: JSON.stringify(envelope), producer: envelope.source, ...(envelope.traceparent === undefined ? {} : { traceparent: envelope.traceparent }) });
}

function classify(error: unknown): "retryable" | "terminal" {
  return (error instanceof EventingError || error instanceof NotificationError || error instanceof WalkingSkeletonSourceError) && error.retryable
    ? "retryable"
    : "terminal";
}

function requireWorkerTrace(handler: MessageHandler, observed: Set<string>, expectedTraceparent: string): MessageHandler {
  const check = (message: Parameters<MessageHandler["handle"]>[0]): void => {
    if (message.traceparent !== expectedTraceparent) throw new EventingError("eventing_invalid_input");
    observed.add(message.messageId);
  };
  return Object.freeze({
    kind: handler.kind,
    messageType: handler.messageType,
    messageVersion: handler.messageVersion,
    ...(handler.recheckAuthoritativeState === undefined ? {} : { recheckAuthoritativeState: async (message: Parameters<NonNullable<MessageHandler["recheckAuthoritativeState"]>>[0], signal: AbortSignal) => { check(message); return handler.recheckAuthoritativeState?.(message, signal) ?? false; } }),
    handle: async (message: Parameters<MessageHandler["handle"]>[0], signal: AbortSignal) => { check(message); await handler.handle(message, signal); },
  });
}

function lifecycleEventId(eventKey: string): string {
  const hex = createHash("sha256").update(eventKey).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "8";
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export async function runMainChainIntegration(factory = createMainChainIntegrationFactory()): Promise<void> {
  const fileReference = await factory.resolveFileReference();
  const baseCompletionCommand = await factory.resolveCompletionCommand();
  if (baseCompletionCommand.actor.activeAssignmentIds === undefined || baseCompletionCommand.actor.activeAssignmentIds.length !== 1) {
    throw new Error("e2e_main_chain_completion_actor_invalid");
  }
  const chainActor = Object.freeze({
    activeAssignmentIds: Object.freeze([...baseCompletionCommand.actor.activeAssignmentIds]),
    principalId: baseCompletionCommand.actor.principalId,
    ...(baseCompletionCommand.actor.workforcePersonId === undefined ? {} : { workforcePersonId: baseCompletionCommand.actor.workforcePersonId }),
  });
  const chainNotificationActor: NotificationActor = chainActor;
  const { traceId, traceparent } = await factory.resolveTraceContext();
  const config = configuration();
  const password = (await readFile(config.flowablePasswordFile, "utf8")).trim();
  if (password.length < 20) throw new Error("e2e_main_chain_flowable_secret_invalid");
  const bpmnPath = fileURLToPath(new URL("../../../deploy/flowable/bpmn/synthetic-human-task.v1.bpmn20.xml", import.meta.url));
  const engine = createFlowableRestEngine({ baseUrl: config.flowableBaseUrl, password, timeoutMs: 10_000, username: "dev_flowable_admin" });
  const workflowAudit: WorkflowAuditRecord[] = [];
  const lifecycle: WorkflowLifecycleEvent[] = [];
  const recordEvidence = factory.evidence?.audit.record.bind(factory.evidence.audit);
  const auditActor = Object.freeze({ actorId: chainActor.principalId, actorType: "authenticated_subject" as const });
  const facade = createWorkflowFacade(
    engine, factory.createWorkflowLedger(),
    { authorize: () => Promise.resolve({ allowed: true, decisionId: stableUuid("decision.workflow.main-chain") }) },
    { record: async (record) => {
      workflowAudit.push(record);
      await recordEvidence?.({
        action: `workflow.${record.operation}`,
        actor: auditActor,
        occurredAt: at,
        reason: { code: (record.errorCode ?? "synthetic_e2e").toLowerCase() },
        resource: { resourceId: record.referenceId, resourceType: "workflow_reference" },
        result: record.phase,
        trace: { authorizationDecisionId: stableUuid("decision.workflow.main-chain"), operationId: auditOperationId(`${record.idempotencyKey}:${record.operation}`, record.phase), traceId },
      });
    } },
    { publish: (event) => { lifecycle.push(event); return Promise.resolve(); } },
    { traceparent: () => traceparent, variablePolicy: { definitions: { [definitionKey]: {} } } },
  );
  const definition = await facade.deployDefinition({ actor: chainActor, assetName: "synthetic-human-task.v1.bpmn20.xml", assetVersion: "1.0.0", bpmnXml: await readFile(bpmnPath, "utf8"), definitionKey, idempotencyKey: "main-chain-definition.synthetic-v1" });
  const instance = await facade.startProcess({ actor: chainActor, definitionKey, definitionVersion: definition.version, idempotencyKey: "main-chain-process.synthetic-0001", variables: {} });
  const tasks = await facade.listTasks(instance.processInstanceId);
  const workflowTask = tasks.length === 1 ? tasks[0] : undefined;
  if (workflowTask === undefined || workflowTask.status !== "active") throw new Error("e2e_main_chain_flowable_task_invalid");

  const formAudit: FormAudit = { record: async (record) => {
    await recordEvidence?.({
      action: record.action,
      actor: auditActor,
      occurredAt: at,
      reason: { code: "synthetic_e2e" },
      resource: { resourceId: record.resourceId, resourceType: "form_definition" },
      result: record.result,
      trace: { authorizationDecisionId: record.authorizationDecisionId, operationId: auditOperationId(record.operationId, record.result), traceId: record.traceId },
    });
  } };
  let formEventSequence = 0;
  const form = createFormSchemaService(
    factory.createFormStore(),
    { authorize: () => Promise.resolve({ allowed: true, decisionId: stableUuid("decision.form.main-chain") }) },
    formAudit,
    { clock: () => new Date(at), id: () => { formEventSequence += 1; return stableUuid(`form-event:${String(formEventSequence)}`); } },
  );
  const formActor = Object.freeze({ actorId: chainActor.principalId, actorType: "authenticated_subject" as const });
  const formMeta = (name: string) => Object.freeze({ actor: formActor, operationId: stableUuid(`form:${name}`), reason: "synthetic durable evidence", traceId });
  await form.saveDraft({
    ...formMeta("draft"), definitionId: formDefinitionId, expectedRevision: 0, ownerModule: "tests.walking-skeleton",
    jsonSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", additionalProperties: false, properties: { content_version_id: { minLength: 36, maxLength: 36, type: "string" }, file_id: { minLength: 36, maxLength: 36, type: "string" }, synthetic_value: { minLength: 1, maxLength: 500, type: "string" } }, required: ["content_version_id", "file_id", "synthetic_value"], type: "object" },
    uiSchema: { fields: [{ component: "input", field: "synthetic_value", order: 1 }, { component: "input", field: "file_id", order: 2 }, { component: "input", field: "content_version_id", order: 3 }], layout: "vertical", version: 1 },
  });
  const publishedForm = await form.publish({ ...formMeta("publish"), definitionId: formDefinitionId, expectedRevision: 1 });
  await form.setReleaseActive({ ...formMeta("inactive"), active: false, definitionId: formDefinitionId, releaseVersion: publishedForm.reference.releaseVersion });
  let inactiveReleaseRejected = false;
  try {
    await form.validateSubmission({ actor: formActor, data: {}, definitionId: formDefinitionId, releaseVersion: publishedForm.reference.releaseVersion });
  } catch (error) {
    if (!(error instanceof FormSchemaError) || error.code !== "form_not_found") throw error;
    inactiveReleaseRejected = true;
    await recordEvidence?.({ action: "form.submission.validate", actor: auditActor, occurredAt: at, reason: { code: "inactive_release" }, resource: { resourceId: formDefinitionId, resourceType: "form_definition" }, result: "failed", trace: { operationId: auditOperationId("form:inactive-validation", "failed"), traceId } });
  }
  if (!inactiveReleaseRejected) throw new Error("e2e_main_chain_inactive_form_accepted");
  await form.setReleaseActive({ ...formMeta("reactivate"), active: true, definitionId: formDefinitionId, releaseVersion: publishedForm.reference.releaseVersion });
  const browserFormSubmission = await factory.resolveBrowserFormSubmission?.();
  let activeSubmissionReference = defaultSubmissionReference;
  if (browserFormSubmission !== undefined) {
    if (browserFormSubmission.traceId !== traceId || browserFormSubmission.reference.contentDigest !== publishedForm.reference.contentDigest ||
      browserFormSubmission.reference.releaseVersion !== publishedForm.reference.releaseVersion ||
      browserFormSubmission.fileReference.fileId !== fileReference.fileId || browserFormSubmission.fileReference.contentVersionId !== fileReference.contentVersionId ||
      browserFormSubmission.fileReference.displayName !== fileReference.displayName ||
      browserFormSubmission.fileReference.mediaType !== fileReference.mediaType || browserFormSubmission.fileReference.sizeBytes !== fileReference.sizeBytes) throw new Error("e2e_main_chain_browser_form_evidence_invalid");
    activeSubmissionReference = browserFormSubmission.submissionReference;
  } else {
    const submission = Object.freeze({ content_version_id: fileReference.contentVersionId, file_id: fileReference.fileId, synthetic_value: "synthetic-approved" as const });
    const validation = await form.validateSubmission({ actor: formActor, data: submission, definitionId: formDefinitionId, releaseVersion: publishedForm.reference.releaseVersion });
    if (!validation.valid || validation.reference.contentDigest !== publishedForm.reference.contentDigest) throw new Error("e2e_main_chain_form_submission_invalid");
    await recordEvidence?.({ action: "form.submission.validate", actor: auditActor, occurredAt: at, reason: { code: "synthetic_e2e" }, resource: { resourceId: activeSubmissionReference, resourceType: "form_submission" }, result: "succeeded", trace: { operationId: auditOperationId("form:submission-validation", "succeeded"), traceId } });
    const savedSubmission = await factory.evidence?.saveSubmission({ contentDigest: validation.reference.contentDigest, definitionId: validation.reference.definitionId, fileReference, releaseVersion: validation.reference.releaseVersion, submissionReference: activeSubmissionReference, traceId, traceparent });
    const replayedSubmission = await factory.evidence?.saveSubmission({ contentDigest: validation.reference.contentDigest, definitionId: validation.reference.definitionId, fileReference, releaseVersion: validation.reference.releaseVersion, submissionReference: activeSubmissionReference, traceId, traceparent });
    if (factory.durable && (savedSubmission?.replayed !== false || replayedSubmission?.replayed !== true)) throw new Error("e2e_main_chain_submission_replay_invalid");
  }
  const completionCommand: CompleteTaskCommand = Object.freeze({
    ...baseCompletionCommand,
    ...(browserFormSubmission === undefined ? {} : { sourceCommandReference: activeSubmissionReference }),
  });

  const openTaskEvent: TaskLifecycleEvent = Object.freeze({ assigneeReference: chainActor.activeAssignmentIds[0] ?? "assignment.synthetic", deepLink: { appId: "platform.synthetic", routeId: "platform.synthetic.detail" }, eventId: stableUuid("task-projection:open"), occurredAt: at, sourceTaskId, sourceType: walkingSkeletonSourceType, sourceVersion: 1, status: "open" });
  let dependencyFailuresRemaining = 1;
  let workflowCompletionCalls = 0;
  const taskAudit: TaskAudit = { record: async (record) => {
      await recordEvidence?.({ action: `task.${record.operation}`, actor: { actorId: record.actor.principalId, actorType: "authenticated_subject", ...(record.actor.workforcePersonId === undefined ? {} : { workforcePersonId: record.actor.workforcePersonId }) }, occurredAt: at, reason: { code: (record.errorCode ?? "synthetic_e2e").toLowerCase() }, resource: { resourceId: record.referenceId, resourceType: "task_projection" }, result: record.phase, trace: { authorizationDecisionId: record.decisionId, operationId: auditOperationId(`${record.operation}:${record.referenceId}:${record.actor.principalId}`, record.phase), traceId } });
  } };
  const taskStore = factory.createTaskStore();
  const taskCenter = createTaskCenter({
    audit: taskAudit,
    authorization: { authorize: ({ actor: taskActor }) => Promise.resolve({ allowed: taskActor.principalId !== "principal.denied", decisionId: stableUuid(`decision.task:${taskActor.principalId}`) }) },
    commandLeaseToken: () => stableUuid(`task-lease:${String(workflowCompletionCalls)}:${String(dependencyFailuresRemaining)}`),
    now: () => Date.parse(at),
    router: { complete: async () => {
      if (dependencyFailuresRemaining > 0) { dependencyFailuresRemaining -= 1; throw new Error("synthetic_flowable_dependency_unavailable"); }
      workflowCompletionCalls += 1;
      await facade.completeTask({ actor: chainActor, definitionKey, idempotencyKey: "main-chain-workflow-complete.synthetic-0001", taskId: workflowTask.taskId });
      return { sourceCommandId: stableUuid("task-command:workflow-complete"), status: "accepted" };
    } },
    sourceReader: { get: () => Promise.resolve(openTaskEvent) },
    store: taskStore,
  });
  await taskCenter.apply(openTaskEvent);
  if (factory.confirmCompletionCommand !== undefined) {
    const observedCommand = await factory.confirmCompletionCommand();
    if (observedCommand.idempotencyKey !== completionCommand.idempotencyKey || observedCommand.sourceType !== completionCommand.sourceType ||
      observedCommand.sourceTaskId !== completionCommand.sourceTaskId || observedCommand.sourceCommandReference !== completionCommand.sourceCommandReference ||
      observedCommand.actor.principalId !== completionCommand.actor.principalId || observedCommand.actor.workforcePersonId !== completionCommand.actor.workforcePersonId ||
      JSON.stringify(observedCommand.actor.activeAssignmentIds) !== JSON.stringify(completionCommand.actor.activeAssignmentIds)) throw new Error("e2e_main_chain_browser_task_command_mismatch");
  }
  await taskCenter.complete({ actor: { principalId: "principal.denied" }, idempotencyKey: "task-complete.denied-0001", sourceTaskId, sourceType: walkingSkeletonSourceType }).then(
    () => { throw new Error("e2e_main_chain_denied_task_accepted"); },
    (error: unknown) => { if (!(error instanceof TaskCenterError) || error.code !== "TASK_OPERATION_DENIED") throw error; },
  );
  await taskCenter.complete(completionCommand).then(
    () => { throw new Error("e2e_main_chain_dependency_failure_not_observed"); },
    (error: unknown) => { if (!(error instanceof TaskCenterError) || error.code !== "TASK_SOURCE_UNAVAILABLE" || !error.retryable) throw error; },
  );
  const recoveredTaskReceipt = await taskCenter.complete(completionCommand);
  const replayedTaskReceipt = await taskCenter.complete(completionCommand);
  if (workflowCompletionCalls !== 1
    || recoveredTaskReceipt.sourceCommandId !== stableUuid("task-command:workflow-complete")
    || JSON.stringify(replayedTaskReceipt) !== JSON.stringify(recoveredTaskReceipt)) throw new Error("e2e_main_chain_task_completion_replay_invalid");
  const completion = lifecycle.find((event) => event.eventType === "workflow.task-lifecycle.v1" && event.data.occurrence === "completed");
  if (completion === undefined) throw new Error("e2e_main_chain_workflow_event_missing");

  const observations: EventingObservation[] = [];
  const eventStore = factory.createEventingStore();
  const core = createEventingCore(eventStore, { observer: { record: (observation) => { observations.push(observation); } } });
  let sourceAuthorizations = 0;
  const source = factory.createSource({
    audit: { record: async (record) => {
      await recordEvidence?.({ action: `source.${record.operation}`, actor: auditActor, occurredAt: at, reason: { code: (record.errorCode ?? "synthetic_e2e").toLowerCase() }, resource: { resourceId: record.referenceId, resourceType: "source_task" }, result: record.phase, trace: { authorizationDecisionId: stableUuid("decision.source.main-chain"), operationId: auditOperationId(`${record.operation}:${record.referenceId}`, record.phase), traceId } });
    } },
    authorization: { authorize: () => { sourceAuthorizations += 1; return Promise.resolve({ allowed: true, decisionId: stableUuid("decision.source.main-chain") }); } },
    clock: () => new Date(at), resolver: { resolve: () => Promise.resolve(chainActor) },
  });
  await source.register({ actorContextReference, assigneeReference: chainActor.activeAssignmentIds[0] ?? "", sourceTaskId, sourceVersion: 1, status: "open", workflowTaskId: workflowTask.taskId });
  const notificationStore = factory.createNotificationStore();
  const notifications = createNotificationCenter({
    audit: { record: async (record) => {
      await recordEvidence?.({ action: `notification.${record.operation}`, actor: { actorId: record.actor.principalId, actorType: "authenticated_subject" }, occurredAt: at, reason: { code: (record.errorCode ?? "synthetic_e2e").toLowerCase() }, resource: { resourceId: record.referenceId, resourceType: "notification_reference" }, result: record.phase, trace: { authorizationDecisionId: record.decisionId, operationId: auditOperationId(`${record.operation}:${record.referenceId}`, record.phase), traceId } });
    } }, authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: stableUuid("decision.notification.main-chain") }) }, now: () => new Date(at),
    preference: { evaluate: () => Promise.resolve({ decision: "deliver", reason: "synthetic-default", version: "synthetic-v1" }) },
    resolver: { resolve: () => Promise.resolve([{ principalId: chainActor.principalId, recipientReference: "person.synthetic", resolutionReference: chainActor.activeAssignmentIds[0] ?? "assignment.synthetic", resolutionVersion: "organization-synthetic-v1" }]) }, store: notificationStore,
  });
  await notifications.publishTemplate({ actor: chainNotificationActor, bodyTemplate: "Open {{subject}}.", notificationType: "platform.synthetic", ownerReference: "tests.walking-skeleton", publishedAt: at, templateKey: "platform.synthetic.notice", titleTemplate: "Update {{subject}}", variableSchema: { additionalProperties: false, properties: { subject: { type: "string" } }, required: ["subject"], type: "object" }, version: 1 });

  const controller = new AbortController();
  let publisherAdapter: Awaited<ReturnType<typeof createAmqplibPublisherAdapter>> | undefined;
  let runFailure: unknown;
  let running: Promise<void> | undefined;
  let worker: ReturnType<typeof createRabbitInboxHandler> | undefined;
  const workerTraceMessages = new Set<string>();
  try {
    const consumer = await createAmqplibConsumerAdapter(await rabbitConnection("consumer"), [walkingSkeletonSourceRabbitTopology, walkingSkeletonNotificationRabbitTopology], { concurrency: walkingSkeletonJobPolicy.concurrency, prefetch: walkingSkeletonJobPolicy.prefetch });
    const bindings: readonly RabbitInboxBinding[] = Object.freeze([
      Object.freeze({ bindingId: walkingSkeletonSourceBindingId, classify, consumer: walkingSkeletonSourceConsumerId, eventPolicy: walkingSkeletonJobPolicy, handler: requireWorkerTrace(createWalkingSkeletonSourceCommandMessageHandler(source), workerTraceMessages, traceparent) }),
      Object.freeze({ bindingId: walkingSkeletonNotificationBindingId, classify, consumer: walkingSkeletonNotificationConsumerId, eventPolicy: walkingSkeletonJobPolicy, handler: requireWorkerTrace(createWalkingSkeletonNotificationMessageHandler(notifications, { resolve: () => Promise.resolve(chainNotificationActor) }), workerTraceMessages, traceparent) }),
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
    const sourceEnvelope = job({ fileReference, formSubmissionReference: activeSubmissionReference, id: "source", traceparent, workflowEventId, workflowTaskId: workflowTask.taskId });
    const notificationEnvelope = job({ fileReference, formSubmissionReference: activeSubmissionReference, id: "notification", traceparent, workflowEventId, workflowTaskId: workflowTask.taskId });
    await core.submitJob(sourceEnvelope);
    await core.submitJob(notificationEnvelope);
    const published = await publisher.publishBatch();
    if (published.published !== 2) throw new Error("e2e_main_chain_publish_failed");
    await waitUntil(async () => (await source.getState(sourceTaskId)).status === "completed" && await notifications.unreadCount(chainNotificationActor) === 1);
    await transport.publish(duplicate(sourceEnvelope));
    await transport.publish(duplicate(notificationEnvelope));
    await waitUntil(() => observations.filter((item) => item.operation === "consume" && item.outcome === "duplicate").length >= 2);
    const completedTask = await engine.getTask(workflowTask.taskId);
    const completedInstance = await engine.getInstance(instance.processInstanceId);
    const finalSource = await source.getState(sourceTaskId);
    const finalTaskEvent: TaskLifecycleEvent = Object.freeze({ ...openTaskEvent, eventId: lifecycleEventId(completion.data.eventKey), sourceVersion: finalSource.sourceVersion, status: finalSource.status });
    const finalTaskApply = await taskCenter.apply(finalTaskEvent);
    const finalTaskProjection = await taskStore.get({ sourceTaskId, sourceType: walkingSkeletonSourceType });
    const durableEvidence = await factory.evidence?.inspect(traceId, traceparent, fileReference);
    if (factory.externalEvidence && factory.evidence !== undefined) {
      assertDurableAuditCorrelationEvidence({
        auditRecords: await factory.evidence.readCorrelatedAuditRecords(traceId),
        fileReference,
        taskCommand: { ...completionCommand, traceId, version: 1 },
        traceId,
        traceparent,
      });
    }
    const notificationPage = await notifications.list({ actor: chainNotificationActor, includeArchived: true, limit: 10 });
    const notificationProjection = notificationPage.items[0];
    if (runFailure !== undefined) {
      throw runFailure instanceof Error ? runFailure : new Error("e2e_main_chain_worker_failed", { cause: runFailure });
    }
    if (completedTask.status !== "completed" || completedInstance.status !== "completed" || finalSource.sourceVersion !== 2 || finalTaskApply.status !== "applied" || finalTaskProjection?.status !== "completed" || finalTaskProjection.sourceVersion !== 2 || finalTaskProjection.assigneeReference !== openTaskEvent.assigneeReference || sourceAuthorizations !== 1 || await notifications.unreadCount(chainNotificationActor) !== 1 || workflowAudit.filter((record) => record.operation === "task_complete" && record.phase === "succeeded").length !== 1) throw new Error("e2e_main_chain_result_invalid");
    if (factory.durable && (durableEvidence === undefined || durableEvidence.submissionCount !== 1 || durableEvidence.outboxTraceCount !== 2 || durableEvidence.inboxCount !== 2 || durableEvidence.auditCount !== 30 || durableEvidence.auditFactCount !== 2 || durableEvidence.taskAuditFactCount !== 1 || workerTraceMessages.size !== 2)) throw new Error("e2e_main_chain_durable_evidence_invalid");
    process.stdout.write(`${JSON.stringify({ auditCorrelationVerified: durableEvidence?.auditFactCount === 2 && durableEvidence.taskAuditFactCount === 1, auditRecords: durableEvidence?.auditCount ?? 0, browserTaskApiEvidence: factory.browserTaskApiEvidence, durable: factory.durable, externalEvidence: factory.externalEvidence, fileReference, flowableInstanceStatus: completedInstance.status, flowableTaskStatus: completedTask.status, formReleaseVersion: publishedForm.reference.releaseVersion, formSubmissionReference: activeSubmissionReference, inboxDuplicates: 2, mainWalkingSkeletonReady: false, notificationProjection, notifications: 1, outboxTraceRecords: durableEvidence?.outboxTraceCount ?? 0, stableFileReference: true, submissionRecords: durableEvidence?.submissionCount ?? 0, sourceAuthorizations, sourceVersion: finalSource.sourceVersion, status: factory.durable ? "e2e-main-chain-durable-evidence-passed" : "e2e-main-chain-slice-passed", taskCompletionRetries: 1, taskProjection: finalTaskProjection, traceId, traceparent, workerTraceMessages: workerTraceMessages.size })}\n`);
  } finally {
    controller.abort();
    await running;
    await worker?.stop?.();
    await publisherAdapter?.close();
  }
}

if (process.env["AI_CRM_E2E_MAIN_CHAIN_INTEGRATION"] === "true" && process.env["AI_CRM_E2E_MAIN_CHAIN_MODE"] !== "durable") await runMainChainIntegration();
