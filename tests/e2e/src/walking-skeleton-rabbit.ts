import type { RabbitConsumerTopology } from "@ai-crm/worker";

export const walkingSkeletonSourceBindingId = "tests.walking-skeleton-source.v1" as const;
export const walkingSkeletonNotificationBindingId = "tests.notification-intent.v1" as const;
export const walkingSkeletonSourceConsumerId = "tests.walking-skeleton-source.v1" as const;
export const walkingSkeletonNotificationConsumerId = "tests.notification-intent.v1" as const;
export const walkingSkeletonJobPolicy = Object.freeze({
  backoffSeconds: Object.freeze([30, 300] as const),
  concurrency: 1,
  maxAttempts: 3,
  prefetch: 2,
  timeoutMs: 10_000,
});

const deadLetter = Object.freeze({
  deadLetterExchange: "ai-crm.tests.dead-letter.v1",
  deadLetterQueue: "ai-crm.tests.walking-skeleton.dead.v1",
});

export const walkingSkeletonSourceRabbitTopology: Readonly<RabbitConsumerTopology> = Object.freeze({
  bindingId: walkingSkeletonSourceBindingId,
  ...deadLetter,
  deadLetterRoutingKey: "tests.walking-skeleton.source-command.v1.dead",
  exchange: "ai-crm.tests.events.v1",
  exchangeType: "topic",
  queue: "ai-crm.tests.walking-skeleton.source-command.v1",
  retryLayers: Object.freeze([
    Object.freeze({ delaySeconds: 30, exchange: "ai-crm.tests.retry.v1", queue: "ai-crm.tests.walking-skeleton.source-command.retry.30s.v1", routingKey: "tests.walking-skeleton.source-command.v1.retry.30s" }),
    Object.freeze({ delaySeconds: 300, exchange: "ai-crm.tests.retry.v1", queue: "ai-crm.tests.walking-skeleton.source-command.retry.300s.v1", routingKey: "tests.walking-skeleton.source-command.v1.retry.300s" }),
  ]),
  routingKey: "tests.walking-skeleton.source-command.v1",
});

export const walkingSkeletonNotificationRabbitTopology: Readonly<RabbitConsumerTopology> = Object.freeze({
  bindingId: walkingSkeletonNotificationBindingId,
  ...deadLetter,
  deadLetterRoutingKey: "crm.notifications.intent-submit.v1.dead",
  exchange: "ai-crm.tests.events.v1",
  exchangeType: "topic",
  queue: "ai-crm.tests.crm.notifications.intent-submit.v1",
  retryLayers: Object.freeze([
    Object.freeze({ delaySeconds: 30, exchange: "ai-crm.tests.retry.v1", queue: "ai-crm.tests.crm.notifications.intent-submit.retry.30s.v1", routingKey: "crm.notifications.intent-submit.v1.retry.30s" }),
    Object.freeze({ delaySeconds: 300, exchange: "ai-crm.tests.retry.v1", queue: "ai-crm.tests.crm.notifications.intent-submit.retry.300s.v1", routingKey: "crm.notifications.intent-submit.v1.retry.300s" }),
  ]),
  routingKey: "crm.notifications.intent-submit.v1",
});
