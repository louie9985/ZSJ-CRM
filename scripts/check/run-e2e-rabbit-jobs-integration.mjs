import { spawnSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const port = process.env.AI_CRM_TEST_RABBITMQ_TLS_PORT ?? String(randomInt(20_000, 40_000));
if (!/^\d{4,5}$/u.test(port) || Number(port) > 65_535) throw new Error("AI_CRM_TEST_RABBITMQ_TLS_PORT must be a valid explicit test port.");

const fixtureDirectory = await mkdtemp(resolve(tmpdir(), "ai-crm-e2e-rabbit-jobs-"));
const project = `ai-crm-test-e2e-rabbit-${randomUUID().slice(0, 8)}`;
const environment = {
  ...process.env,
  AI_CRM_E2E_RABBIT_JOB_INTEGRATION: "true",
  AI_CRM_RABBITMQ_FIXTURE_DIR: fixtureDirectory,
  AI_CRM_TEST_RABBITMQ_TLS_PORT: port,
};
const compose = ["compose", "-p", project, "-f", "deploy/compose/compose.rabbitmq-integration.yml"];
const pnpmCli = process.env.npm_execpath;
if (pnpmCli === undefined || !resolve(pnpmCli).endsWith("pnpm.cjs")) throw new Error("Run this integration through the pnpm script entry point.");

function run(command, args) {
  const result = spawnSync(command, args, { env: environment, shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed.`);
}

try {
  run(process.execPath, ["scripts/bootstrap/rabbitmq-integration-fixture.mjs", fixtureDirectory, "walking-skeleton"]);
  run("docker", [...compose, "up", "-d", "--wait"]);
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/e2e...", "build"]);
  run(process.execPath, ["tests/e2e/dist/rabbit-job-integration.js"]);
} catch (error) {
  spawnSync("docker", [...compose, "ps"], { env: environment, shell: false, stdio: "inherit" });
  spawnSync("docker", [...compose, "logs", "--no-color", "--tail", "100"], { env: environment, shell: false, stdio: "inherit" });
  throw error;
} finally {
  spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], { env: environment, shell: false, stdio: "inherit" });
  await rm(fixtureDirectory, { force: true, recursive: true });
}
