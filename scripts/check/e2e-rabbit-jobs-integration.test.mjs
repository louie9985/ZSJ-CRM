import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [runner, fixture, driver] = await Promise.all([
  read("scripts/check/run-e2e-rabbit-jobs-integration.mjs"),
  read("scripts/bootstrap/rabbitmq-integration-fixture.mjs"),
  read("tests/e2e/src/rabbit-job-integration.ts"),
]);

test("keeps the Rabbit Job chain behind an explicit E2E activation", () => {
  assert.match(driver, /AI_CRM_E2E_RABBIT_JOB_INTEGRATION.*=== "true"/u);
  assert.match(runner, /AI_CRM_E2E_RABBIT_JOB_INTEGRATION: "true"/u);
  assert.doesNotMatch(runner, /AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED/u);
});

test("uses an isolated TLS port, VHost fixture mode, and least-privilege accounts", () => {
  assert.match(runner, /AI_CRM_TEST_RABBITMQ_TLS_PORT: port/u);
  assert.match(runner, /rabbitmq-integration-fixture\.mjs", fixtureDirectory, "walking-skeleton"/u);
  assert.match(fixture, /fixtureMode !== "transport-matrix" && fixtureMode !== "walking-skeleton"/u);
  assert.match(fixture, /configure: `\^\(\?:\$\{walkingSkeletonNames\}\)\$`, write: `\^\(\?:\$\{walkingSkeletonNames\}\)\$`, read: `\^\(\?:\$\{walkingSkeletonNames\}\)\$`/u);
});

test("always removes the isolated Compose project, Volumes, and temporary credentials", () => {
  assert.match(runner, /ai-crm-test-e2e-rabbit-/u);
  assert.match(runner, /"down", "--volumes", "--remove-orphans"/u);
  assert.match(runner, /rm\(fixtureDirectory, \{ force: true, recursive: true \}\)/u);
  assert.match(runner, /"logs", "--no-color", "--tail", "100"/u);
});
