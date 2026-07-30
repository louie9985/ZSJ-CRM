import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTaskCenter, InMemoryTaskCenterStore, type TaskLifecycleEvent } from "@ai-crm/platform-task-center";
import {
  createFlowableRestEngine,
  createWorkflowFacade,
  type WorkflowAuditRecord,
  type WorkflowLifecycleEvent,
} from "@ai-crm/platform-workflow";
import { createMemoryWorkflowCommandLedger } from "@ai-crm/platform-workflow/testing";

import { createWalkingSkeletonSource, createWalkingSkeletonTaskPorts, walkingSkeletonSourceType } from "./walking-skeleton-source.js";
import { createWalkingSkeletonWorkflowCompletion } from "./walking-skeleton-workflow.js";

const actor = Object.freeze({ activeAssignmentIds: Object.freeze(["assignment.synthetic"]), principalId: "principal.synthetic" });
const actorContextReference = "actor-context.synthetic";
const definitionKey = "syntheticHumanTaskV1";
const sourceTaskId = "source-task.flowable-synthetic";

function configuration(): { readonly baseUrl: string; readonly passwordFile: string } {
  const baseUrl = process.env["TEST_FLOWABLE_BASE_URL"];
  const passwordFile = process.env["TEST_FLOWABLE_PASSWORD_FILE"];
  if (baseUrl === undefined || passwordFile === undefined || resolve(passwordFile) !== passwordFile) throw new Error("e2e_flowable_configuration_invalid");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.pathname.endsWith("/flowable-rest/service/")) throw new Error("e2e_flowable_configuration_invalid");
  return Object.freeze({ baseUrl, passwordFile });
}

export async function runWalkingSkeletonFlowableWorkflowIntegration(): Promise<void> {
  const config = configuration();
  const password = (await readFile(config.passwordFile, "utf8")).trim();
  if (password.length < 20) throw new Error("e2e_flowable_secret_invalid");
  const bpmnPath = fileURLToPath(new URL("../../../deploy/flowable/bpmn/synthetic-human-task.v1.bpmn20.xml", import.meta.url));
  const bpmnXml = await readFile(bpmnPath, "utf8");
  const engine = createFlowableRestEngine({ baseUrl: config.baseUrl, password, timeoutMs: 10_000, username: "dev_flowable_admin" });
  const audit: WorkflowAuditRecord[] = [];
  const lifecycle: WorkflowLifecycleEvent[] = [];
  const facade = createWorkflowFacade(
    engine,
    createMemoryWorkflowCommandLedger(),
    { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.workflow.flowable" }) },
    { record: (record) => { audit.push(record); return Promise.resolve(); } },
    { publish: (event) => { lifecycle.push(event); return Promise.resolve(); } },
    { variablePolicy: { definitions: { [definitionKey]: {} } } },
  );

  const definition = await facade.deployDefinition({
    actor,
    assetName: "synthetic-human-task.v1.bpmn20.xml",
    assetVersion: "1.0.0",
    bpmnXml,
    definitionKey,
    idempotencyKey: "flowable-definition.synthetic-v1",
  });
  const instance = await facade.startProcess({
    actor,
    definitionKey,
    definitionVersion: definition.version,
    idempotencyKey: "flowable-process.synthetic-0001",
    variables: {},
  });
  const tasks = await facade.listTasks(instance.processInstanceId);
  const workflowTask = tasks.length === 1 ? tasks[0] : undefined;
  if (workflowTask === undefined || workflowTask.status !== "active" || workflowTask.taskDefinitionKey !== "syntheticReviewTask") throw new Error("e2e_flowable_task_invalid");

  const workflow = createWalkingSkeletonWorkflowCompletion(facade);
  workflow.register({ definitionKey, sourceTaskId, workflowTaskId: workflowTask.taskId });
  let sourceAuthorizationCount = 0;
  const source = createWalkingSkeletonSource({
    audit: { record: () => Promise.resolve() },
    authorization: { authorize: () => { sourceAuthorizationCount += 1; return Promise.resolve({ allowed: true, decisionId: "decision.source.flowable" }); } },
    resolver: { resolve: () => Promise.resolve(actor) },
  });
  source.register({ actorContextReference, assigneeReference: actor.activeAssignmentIds[0] ?? "", sourceTaskId, sourceVersion: 1, status: "open", workflowTaskId: workflowTask.taskId });
  const ports = createWalkingSkeletonTaskPorts({
    actorContextReference: () => Promise.resolve(actorContextReference),
    source,
    workflowCompletion: (command) => workflow.complete(command),
  });
  const taskCenter = createTaskCenter({
    audit: { record: () => Promise.resolve() },
    authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.task.flowable" }) },
    router: ports.router,
    sourceReader: ports.sourceReader,
    store: new InMemoryTaskCenterStore(),
  });
  const projected: TaskLifecycleEvent = {
    assigneeReference: actor.activeAssignmentIds[0] ?? "",
    deepLink: { appId: "platform.synthetic", routeId: "platform.synthetic.detail" },
    eventId: "80000000-0000-4000-8000-000000000001",
    occurredAt: "2026-07-30T00:00:00.000Z",
    sourceTaskId,
    sourceType: walkingSkeletonSourceType,
    sourceVersion: 1,
    status: "open",
  };
  await taskCenter.apply(projected);
  const command = Object.freeze({ actor, idempotencyKey: "task-complete.flowable-synthetic", sourceTaskId, sourceType: walkingSkeletonSourceType });
  const first = await taskCenter.complete(command);
  const duplicate = await taskCenter.complete(command);
  const completedTask = await engine.getTask(workflowTask.taskId);
  const completedInstance = await engine.getInstance(instance.processInstanceId);
  const completedSource = source.getState(sourceTaskId);
  const completionEvents = lifecycle.filter((event) => event.eventType === "workflow.task-lifecycle.v1" && event.data.occurrence === "completed");
  if (first.sourceCommandId !== duplicate.sourceCommandId
    || completedTask.status !== "completed"
    || completedInstance.status !== "completed"
    || completedSource.status !== "completed"
    || completedSource.sourceVersion !== 2
    || sourceAuthorizationCount !== 1
    || completionEvents.length !== 1
    || audit.filter((record) => record.operation === "task_complete" && record.phase === "succeeded").length !== 1) {
    throw new Error("e2e_flowable_workflow_result_invalid");
  }
  process.stdout.write(`${JSON.stringify({
    flowableInstanceStatus: completedInstance.status,
    flowableTaskStatus: completedTask.status,
    sourceAuthorizations: sourceAuthorizationCount,
    sourceVersion: completedSource.sourceVersion,
    status: "e2e-flowable-workflow-passed",
    workflowCompletionEvents: completionEvents.length,
  })}\n`);
}

if (process.env["AI_CRM_E2E_FLOWABLE_WORKFLOW_INTEGRATION"] === "true") await runWalkingSkeletonFlowableWorkflowIntegration();
