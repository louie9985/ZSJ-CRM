import type { RabbitConsumerTopology } from "./rabbit-adapter.js";

export const workforceKeycloakSyncBindingId = "platform.workforce-access.keycloak-sync.v1" as const;
export const workforceKeycloakSyncConsumerId = "platform.workforce-access.keycloak-sync.v1" as const;

export const workforceKeycloakSyncRuntimePolicy = Object.freeze({
  backoffSeconds: Object.freeze([5, 30] as const),
  concurrency: 1,
  handler: "workforce-access.keycloak-sync.v1",
  id: "workforceKeycloakSyncPolicyV1",
  maxAttempts: 3,
  owner: "platform.workforce-access",
  policyVersion: 1,
  prefetch: 2,
  timeoutMs: 10_000,
} as const);

export const workforceKeycloakSyncRabbitTopology: Readonly<RabbitConsumerTopology> = Object.freeze({
  bindingId: workforceKeycloakSyncBindingId,
  deadLetterExchange: "ai-crm.platform.dead-letter.v1",
  deadLetterQueue: "ai-crm.platform.workforce-access.keycloak-sync.dead.v1",
  deadLetterRoutingKey: "workforce-access.keycloak-sync.v1.dead",
  exchange: "ai-crm.platform.jobs.v1",
  exchangeType: "direct",
  queue: "ai-crm.platform.workforce-access.keycloak-sync.v1",
  retryLayers: Object.freeze([
    Object.freeze({ delaySeconds: 5, exchange: "ai-crm.platform.retry.v1", queue: "ai-crm.platform.workforce-access.keycloak-sync.retry.5s.v1", routingKey: "workforce-access.keycloak-sync.v1.retry.5s" }),
    Object.freeze({ delaySeconds: 30, exchange: "ai-crm.platform.retry.v1", queue: "ai-crm.platform.workforce-access.keycloak-sync.retry.30s.v1", routingKey: "workforce-access.keycloak-sync.v1.retry.30s" }),
  ]),
  routingKey: "workforce-access.keycloak-sync.v1",
});
