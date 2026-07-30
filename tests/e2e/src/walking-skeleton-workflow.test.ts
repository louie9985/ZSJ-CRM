import { createTaskCenter, InMemoryTaskCenterStore, type TaskLifecycleEvent } from "@ai-crm/platform-task-center";
import { createWorkflowFacade, type WorkflowEngine, type WorkflowLifecycleEvent, type WorkflowTask } from "@ai-crm/platform-workflow";
import { createMemoryWorkflowCommandLedger } from "@ai-crm/platform-workflow/testing";
import { describe, expect, it, vi } from "vitest";

import { createWalkingSkeletonSource, createWalkingSkeletonTaskPorts, walkingSkeletonSourceType } from "./walking-skeleton-source.js";
import { createWalkingSkeletonWorkflowCompletion } from "./walking-skeleton-workflow.js";

describe("Walking Skeleton Task-to-Workflow-to-source composition", () => {
  it("completes Workflow through its facade before the source reauthorizes and closes", async () => {
    const activeTask: WorkflowTask = {
      definitionId: "definition.synthetic:1",
      processInstanceId: "process.synthetic",
      status: "active",
      taskDefinitionKey: "syntheticReviewTask",
      taskId: "workflow-task.synthetic",
    };
    const completedTask: WorkflowTask = { ...activeTask, endedAt: "2026-07-30T00:00:00.000Z", status: "completed" };
    const completeTask = vi.fn(() => Promise.resolve(completedTask));
    const unused = () => Promise.reject(new Error("unused synthetic Workflow engine operation"));
    const engine: WorkflowEngine = {
      cancelProcess: unused,
      claimTask: unused,
      completeTask,
      deployDefinition: unused,
      getDefinition: unused,
      getInstance: () => Promise.resolve({ definitionId: activeTask.definitionId, definitionKey: "walkingSkeletonProcess", definitionVersion: 1, processInstanceId: activeTask.processInstanceId, status: "active" }),
      getTask: () => Promise.resolve(activeTask),
      health: () => Promise.resolve({ status: "available" }),
      listTasks: () => Promise.resolve([activeTask]),
      releaseTask: unused,
      startProcess: unused,
    };
    const lifecycle: WorkflowLifecycleEvent[] = [];
    const facade = createWorkflowFacade(
      engine,
      createMemoryWorkflowCommandLedger(),
      { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.workflow" }) },
      { record: () => Promise.resolve() },
      { publish: (event) => { lifecycle.push(event); return Promise.resolve(); } },
      { variablePolicy: { definitions: { walkingSkeletonProcess: {} } } },
    );
    const workflow = createWalkingSkeletonWorkflowCompletion(facade);
    workflow.register({ definitionKey: "walkingSkeletonProcess", sourceTaskId: "source-task.synthetic", workflowTaskId: activeTask.taskId });
    const sourceAuthorize = vi.fn(() => Promise.resolve({ allowed: true, decisionId: "decision.source" }));
    const source = createWalkingSkeletonSource({
      audit: { record: () => Promise.resolve() },
      authorization: { authorize: sourceAuthorize },
      clock: () => new Date("2026-07-30T00:00:00.000Z"),
      resolver: { resolve: () => Promise.resolve({ activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" }) },
    });
    source.register({ actorContextReference: "actor-context.synthetic", assigneeReference: "assignment.synthetic", sourceTaskId: "source-task.synthetic", sourceVersion: 1, status: "open", workflowTaskId: activeTask.taskId });
    const ports = createWalkingSkeletonTaskPorts({
      actorContextReference: () => Promise.resolve("actor-context.synthetic"),
      source,
      workflowCompletion: (command) => workflow.complete(command),
    });
    const center = createTaskCenter({
      audit: { record: () => Promise.resolve() },
      authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: "decision.task" }) },
      router: ports.router,
      sourceReader: ports.sourceReader,
      store: new InMemoryTaskCenterStore(),
    });
    const event: TaskLifecycleEvent = {
      assigneeReference: "assignment.synthetic",
      deepLink: { appId: "platform.synthetic", routeId: "platform.synthetic.detail" },
      eventId: "50000000-0000-4000-8000-000000000001",
      occurredAt: "2026-07-30T00:00:00.000Z",
      sourceTaskId: "source-task.synthetic",
      sourceType: walkingSkeletonSourceType,
      sourceVersion: 1,
      status: "open",
    };
    await center.apply(event);
    const command = { actor: { activeAssignmentIds: ["assignment.synthetic"], principalId: "principal.synthetic" }, idempotencyKey: "task-complete.synthetic-workflow", sourceTaskId: event.sourceTaskId, sourceType: event.sourceType };
    const accepted = await center.complete(command);
    await expect(center.complete(command)).resolves.toEqual(accepted);
    expect(completeTask).toHaveBeenCalledTimes(1);
    expect(sourceAuthorize).toHaveBeenCalledTimes(1);
    expect(source.getState(event.sourceTaskId)).toMatchObject({ sourceVersion: 2, status: "completed" });
    expect(lifecycle).toHaveLength(1);
    const emitted = lifecycle[0];
    if (emitted?.eventType !== "workflow.task-lifecycle.v1") throw new Error("expected synthetic Workflow task event");
    expect(emitted.data).toMatchObject({ occurrence: "completed", sourceRevision: 1 });
  });
});
