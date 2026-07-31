import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [runner, chain, durableChain] = await Promise.all([
  read("scripts/check/run-e2e-main-chain-integration.mjs"),
  read("tests/e2e/src/main-chain.ts"),
  read("tests/e2e/src/durable-main-chain.ts"),
]);

test("runs the real Flowable and TLS RabbitMQ slices under isolated projects", () => {
  assert.match(runner, /ai-crm-test-main-flowable-/u);
  assert.match(runner, /ai-crm-test-main-rabbit-/u);
  assert.match(runner, /compose\.rabbitmq-integration\.yml/u);
  assert.match(runner, /flowable\/compose\.integration\.yml/u);
  assert.match(runner, /"down", "--volumes", "--remove-orphans"/u);
  assert.match(runner, /for \(const directory of \[secretDirectory, rabbitDirectory\]\)/u);
  assert.match(runner, /await rm\(directory, \{ force: true, recursive: true \}\)/u);
  assert.match(runner, /timeout: 300_000/u);
  assert.match(runner, /timeout: 60_000/u);
  assert.match(runner, /const cleanupFailures = \[\]/u);
  assert.match(runner, /throw new AggregateError/u);
  assert.ok(runner.indexOf("const pnpmCli") < runner.indexOf("await mkdtemp"));
});

test("keeps the combined slice test-only and readiness-fail-closed", () => {
  assert.match(chain, /AI_CRM_E2E_MAIN_CHAIN_INTEGRATION/u);
  assert.match(chain, /mainWalkingSkeletonReady: false/u);
  assert.doesNotMatch(chain, /AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED/u);
  assert.match(durableChain, /createPrismaEventingStore/u);
  assert.match(durableChain, /createPrismaNotificationStore/u);
  assert.match(durableChain, /createPostgresWalkingSkeletonSource/u);
  assert.match(durableChain, /createPostgresWorkflowCommandLedger/u);
  assert.match(runner, /scripts\/migration\/run\.mjs/u);
  assert.match(runner, /apply-e2e-migration\.js/u);
});

test("threads the real workflow completion identity through the Rabbit source command", () => {
  assert.match(chain, /createMainChainIntegrationFactory/u);
  assert.match(chain, /factory\.createWorkflowLedger\(\)/u);
  assert.match(chain, /factory\.createSource\(/u);
  assert.match(chain, /workflowCompletionEventId: input\.workflowEventId/u);
  assert.match(chain, /workflowTaskId: input\.workflowTaskId/u);
  assert.match(chain, /transport\.publish\(duplicate\(sourceEnvelope\)\)/u);
  assert.match(chain, /sourceAuthorizations !== 1/u);
});
