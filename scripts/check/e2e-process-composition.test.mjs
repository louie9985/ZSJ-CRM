import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [composeSource, runtimeDockerfile, workbenchDockerfile, edgeNginx, runner] = await Promise.all([
  read("deploy/compose/compose.e2e.yml"),
  read("tests/e2e/Dockerfile"),
  read("apps/workbench-web/Dockerfile.e2e"),
  read("deploy/nginx/nginx.e2e.conf"),
  read("scripts/check/run-e2e-compose-integration.mjs"),
]);
const compose = YAML.parse(composeSource);

test("seals the explicit test-only API, Worker, and Workbench process services", () => {
  assert.deepEqual(Object.keys(compose.services).sort(), ["api-e2e", "nginx", "workbench-e2e", "worker-e2e"]);
  for (const service of Object.values(compose.services)) assert.equal(service.ports, undefined);
  assert.equal(compose.services["api-e2e"].environment.AI_CRM_E2E_PROCESS_ENTRYPOINT, "api");
  assert.equal(compose.services["worker-e2e"].environment.AI_CRM_E2E_PROCESS_ENTRYPOINT, "worker");
  assert.equal(compose.services["worker-e2e"].environment.AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED, undefined);
  assert.equal(compose.services.nginx.depends_on["api-e2e"].condition, "service_healthy");
  assert.equal(compose.services.nginx.depends_on["workbench-e2e"].condition, "service_healthy");
});

test("builds test entry points without changing production application images", () => {
  assert.match(runtimeDockerfile, /FROM node:24\.15\.0-bookworm-slim AS build/u);
  assert.match(runtimeDockerfile, /@ai-crm\/e2e deploy --prod/u);
  assert.match(workbenchDockerfile, /ENV VITE_AI_CRM_E2E=true/u);
  assert.match(workbenchDockerfile, /FROM nginx:1\.28\.0-alpine AS runtime/u);
  assert.match(edgeNginx, /proxy_pass http:\/\/e2e_api\/health\/ready/u);
  assert.match(edgeNginx, /proxy_pass http:\/\/e2e_workbench/u);
});

test("uses a unique project and always removes its Volumes and temporary Secrets", () => {
  assert.match(runner, /ai-crm-test-e2e-/u);
  assert.match(runner, /"down", "--volumes", "--remove-orphans"/u);
  assert.match(runner, /rm\(secretDirectory, \{ force: true, recursive: true \}\)/u);
  assert.doesNotMatch(runner, /AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED/u);
});
