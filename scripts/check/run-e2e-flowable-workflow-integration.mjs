import { spawnSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const port = Number(process.env.AI_CRM_TEST_FLOWABLE_PORT ?? String(randomInt(40_000, 60_000)));
if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) throw new Error("AI_CRM_TEST_FLOWABLE_PORT must be a valid explicit test port.");
await new Promise((ready, reject) => {
  const server = createServer();
  server.once("error", () => { reject(new Error(`Integration test port ${String(port)} is unavailable.`)); });
  server.listen(port, "127.0.0.1", () => { server.close(ready); });
});

const secretDirectory = await mkdtemp(resolve(tmpdir(), "ai-crm-e2e-flowable-workflow-"));
const project = `ai-crm-test-e2e-flowable-${randomUUID().slice(0, 8)}`;
const pnpmCli = process.env.npm_execpath;
if (pnpmCli === undefined || !resolve(pnpmCli).endsWith("pnpm.cjs")) throw new Error("Run this integration through the pnpm script entry point.");
const environment = {
  ...process.env,
  AI_CRM_COMPOSE_SECRET_DIR: secretDirectory,
  AI_CRM_E2E_FLOWABLE_WORKFLOW_INTEGRATION: "true",
  AI_CRM_TEST_FLOWABLE_PORT: String(port),
  TEST_FLOWABLE_BASE_URL: `http://127.0.0.1:${String(port)}/flowable-rest/service/`,
  TEST_FLOWABLE_PASSWORD_FILE: resolve(secretDirectory, "flowable_admin_password"),
};
const compose = [
  "compose", "-p", project,
  "-f", "deploy/compose/compose.base.yml",
  "-f", "deploy/flowable/compose.integration.yml",
];

function run(command, args) {
  const result = spawnSync(command, args, { env: environment, shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed.`);
}

try {
  run(process.execPath, ["scripts/bootstrap/compose-secrets.mjs", "test"]);
  run("docker", [...compose, "up", "-d", "--wait", "flowable"]);
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/e2e...", "build"]);
  run(process.execPath, ["tests/e2e/dist/flowable-workflow-integration.js"]);
} catch (error) {
  spawnSync("docker", [...compose, "ps"], { env: environment, shell: false, stdio: "inherit" });
  spawnSync("docker", [...compose, "logs", "--no-color", "--tail", "100", "postgres", "flowable"], { env: environment, shell: false, stdio: "inherit" });
  throw error;
} finally {
  spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], { env: environment, shell: false, stdio: "inherit" });
  await rm(secretDirectory, { force: true, recursive: true });
}
