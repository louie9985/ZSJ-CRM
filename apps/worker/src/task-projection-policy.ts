import { EventingError } from "@ai-crm/crm-eventing-outbox";
import { TaskCenterError } from "@ai-crm/crm-task-center";
import type { RabbitConsumerTopology } from "./rabbit-adapter.js";

export const taskProjectionBindingId = "crm.task-center.projection.v1" as const;
export const taskProjectionConsumerId = "crm.task-center.projection.v1" as const;

export const taskProjectionRuntimePolicy = Object.freeze({
  backoffSeconds: Object.freeze([30, 300] as const),
  concurrency: 1,
  handler: "task-center.postgres-projection-apply.v1",
  id: "taskProjectionLifecyclePolicyV1",
  maxAttempts: 3,
  owner: "crm.task-center",
  policyVersion: 1,
  prefetch: 2,
  timeoutMs: 10_000,
} as const);

export const taskProjectionRabbitTopology: Readonly<RabbitConsumerTopology> = Object.freeze({
  bindingId: taskProjectionBindingId,
  deadLetterExchange: "ai-crm.crm.dead-letter.v1",
  deadLetterQueue: "ai-crm.crm.task-center.projection.dead.v1",
  deadLetterRoutingKey: "task-center.projection-lifecycle.v1.dead",
  exchange: "ai-crm.crm.events.v1",
  exchangeType: "topic",
  queue: "ai-crm.crm.task-center.projection.v1",
  retryLayers: Object.freeze([
    Object.freeze({
      delaySeconds: 30,
      exchange: "ai-crm.crm.retry.v1",
      queue: "ai-crm.crm.task-center.projection.retry.30s.v1",
      routingKey: "task-center.projection-lifecycle.v1.retry.30s",
    }),
    Object.freeze({
      delaySeconds: 300,
      exchange: "ai-crm.crm.retry.v1",
      queue: "ai-crm.crm.task-center.projection.retry.300s.v1",
      routingKey: "task-center.projection-lifecycle.v1.retry.300s",
    }),
  ]),
  routingKey: "task-center.projection-lifecycle.v1",
});

const RETRYABLE_EVENTING_CODES = new Set([
  "eventing_conflict",
  "eventing_handler_timeout",
  "eventing_storage_unavailable",
]);

export function classifyTaskProjectionError(error: unknown): "retryable" | "terminal" {
  if (error instanceof TaskCenterError) {
    return error.code === "TASK_STORAGE_UNAVAILABLE" && error.retryable ? "retryable" : "terminal";
  }
  if (error instanceof EventingError) {
    return error.retryable && RETRYABLE_EVENTING_CODES.has(error.code) ? "retryable" : "terminal";
  }
  return "terminal";
}
