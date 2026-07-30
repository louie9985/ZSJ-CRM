import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [runner, driver] = await Promise.all([
  read("scripts/check/run-e2e-flowable-workflow-integration.mjs"),
  read("tests/e2e/src/flowable-workflow-integration.ts"),
]);

test("keeps the real Flowable Workflow path explicitly E2E-only", () => {
  assert.match(driver, /AI_CRM_E2E_FLOWABLE_WORKFLOW_INTEGRATION.*=== "true"/u);
  assert.match(runner, /AI_CRM_E2E_FLOWABLE_WORKFLOW_INTEGRATION: "true"/u);
  assert.doesNotMatch(runner, /apps\/api\/src|apps\/worker\/src/u);
});

test("uses an isolated Flowable port and only the reviewed synthetic BPMN", () => {
  assert.match(runner, /AI_CRM_TEST_FLOWABLE_PORT: String\(port\)/u);
  assert.match(runner, /deploy\/flowable\/compose\.integration\.yml/u);
  assert.match(driver, /synthetic-human-task\.v1\.bpmn20\.xml/u);
  assert.match(driver, /definitionKey = "syntheticHumanTaskV1"/u);
});

test("always removes PostgreSQL, Flowable, Volumes, and temporary Secrets", () => {
  assert.match(runner, /ai-crm-test-e2e-flowable-/u);
  assert.match(runner, /"down", "--volumes", "--remove-orphans"/u);
  assert.match(runner, /rm\(secretDirectory, \{ force: true, recursive: true \}\)/u);
  assert.match(runner, /"--tail", "100", "postgres", "flowable"/u);
});
