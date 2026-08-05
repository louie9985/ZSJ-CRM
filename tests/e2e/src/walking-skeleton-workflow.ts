import { createHash } from "node:crypto";

import type { TaskActor, TaskProjectionKey } from "@ai-crm/crm-task-center";
import type { WorkflowFacade } from "@ai-crm/crm-workflow";

import { WalkingSkeletonSourceError, walkingSkeletonSourceType } from "./walking-skeleton-source.js";

export interface WalkingSkeletonWorkflowBinding {
  readonly definitionKey: string;
  readonly sourceTaskId: string;
  readonly workflowTaskId: string;
}

function completionEventId(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "8";
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export function createWalkingSkeletonWorkflowCompletion(facade: WorkflowFacade) {
  if (typeof facade.completeTask !== "function") throw new Error("e2e_workflow_port_invalid");
  const bindings = new Map<string, WalkingSkeletonWorkflowBinding>();
  return Object.freeze({
    async complete(command: TaskProjectionKey & { readonly actor: TaskActor; readonly idempotencyKey: string }) {
      if (command.sourceType !== walkingSkeletonSourceType) throw new WalkingSkeletonSourceError("source_state_not_found");
      const binding = bindings.get(command.sourceTaskId);
      if (binding === undefined) throw new WalkingSkeletonSourceError("source_state_not_found");
      const workflowIdempotencyKey = `walking-skeleton:${command.idempotencyKey}`;
      const result = await facade.completeTask({
        actor: { principalId: command.actor.principalId },
        definitionKey: binding.definitionKey,
        idempotencyKey: workflowIdempotencyKey,
        taskId: binding.workflowTaskId,
      });
      if (result.taskId !== binding.workflowTaskId || result.status !== "completed") throw new WalkingSkeletonSourceError("source_state_conflict");
      return Object.freeze({
        eventId: completionEventId(`${binding.workflowTaskId}:${workflowIdempotencyKey}`),
        workflowTaskId: binding.workflowTaskId,
      });
    },
    register(binding: WalkingSkeletonWorkflowBinding): void {
      if (bindings.has(binding.sourceTaskId)) throw new WalkingSkeletonSourceError("source_state_conflict");
      bindings.set(binding.sourceTaskId, Object.freeze({ ...binding }));
    },
  });
}
