import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";

const path = resolve(import.meta.dirname, "walking-skeleton.asyncapi.yaml");
const topology = YAML.parse(await readFile(path, "utf8"));

test("keeps Walking Skeleton routes test-scoped and production-disabled", () => {
  assert.deepEqual(topology["x-ai-crm-topology-policy"], {
    scope: "tests-only",
    productionActivation: "forbidden",
    environmentIsolatedVhost: true,
    publisherConfirms: "required",
    consumerAcknowledgement: "manual-after-local-transaction",
    immediateRequeue: "forbidden",
    payloadLogging: "forbidden",
    automaticDeadLetterReplay: "forbidden",
  });
  for (const operation of [topology.operations.consumeSourceCommand, topology.operations.consumeNotificationIntent]) {
    assert.deepEqual(operation["x-ai-crm-activation"], { testEnabled: true, productionEnabled: false });
    assert.deepEqual(operation["x-ai-crm-runtime-policy"], {
      maxAttempts: 3,
      backoffSeconds: [30, 300],
      timeoutMs: 10000,
      prefetch: 2,
      concurrency: 1,
      authoritativeStateRecheckRequired: true,
      authorizationRecheckRequired: true,
      unknownErrorDisposition: "terminal",
    });
  }
});

test("defines exact source and Notification routes with fixed retry and isolated dead letters", () => {
  assert.deepEqual(Object.keys(topology.operations).sort(), [
    "consumeNotificationIntent",
    "consumeSourceCommand",
    "publishDeadLetter",
    "publishNotificationIntent",
    "publishRetry",
    "publishSourceCommand",
  ]);
  assert.equal(topology.components.messages.sourceCommandV1.payload.$ref, "../jobs/walking-skeleton-source-command.v1.schema.json");
  assert.equal(topology.components.messages.notificationIntentSubmitV1.payload.$ref, "../jobs/notification-intent-submit.v1.schema.json");
  const retryQueues = [
    topology.channels.sourceRetry30Queue,
    topology.channels.sourceRetry300Queue,
    topology.channels.notificationRetry30Queue,
    topology.channels.notificationRetry300Queue,
  ];
  assert.deepEqual(retryQueues.map((queue) => queue["x-ai-crm-queue-arguments"]["x-message-ttl"]), [30000, 300000, 30000, 300000]);
  assert.equal(retryQueues.every((queue) => queue["x-ai-crm-consumer-forbidden"] === true), true);
  assert.deepEqual(topology.channels.deadLetterQueue["x-ai-crm-replay"], {
    automatic: false,
    enabled: false,
    authorizationRequired: true,
    auditRequired: true,
    authoritativeStateRecheckRequired: true,
  });
});
