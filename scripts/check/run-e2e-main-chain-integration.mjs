import { spawnSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

async function availablePort(name, fallback) {
  const port = Number(process.env[name] ?? String(fallback));
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) throw new Error(`${name} must be a valid explicit test port.`);
  await new Promise((ready, reject) => {
    const server = createServer();
    server.once("error", () => { reject(new Error(`Integration test port ${String(port)} is unavailable.`)); });
    server.listen(port, "127.0.0.1", () => { server.close(ready); });
  });
  return port;
}

const flowablePort = await availablePort("AI_CRM_TEST_FLOWABLE_PORT", randomInt(40_000, 50_000));
const rabbitPort = await availablePort("AI_CRM_TEST_RABBITMQ_TLS_PORT", randomInt(50_001, 60_000));
const postgresPort = await availablePort("AI_CRM_TEST_POSTGRES_PORT", randomInt(20_000, 39_999));
if (new Set([flowablePort, rabbitPort, postgresPort]).size !== 3) throw new Error("Main-chain integration ports must be distinct.");
const pnpmCli = process.env.npm_execpath;
if (pnpmCli === undefined || !resolve(pnpmCli).endsWith("pnpm.cjs")) throw new Error("Run this integration through the pnpm script entry point.");
const secretDirectory = await mkdtemp(resolve(tmpdir(), "ai-crm-e2e-main-chain-secrets-"));
const rabbitDirectory = await mkdtemp(resolve(tmpdir(), "ai-crm-e2e-main-chain-rabbit-"));
const suffix = randomUUID().slice(0, 8);
const flowableProject = `ai-crm-test-main-flowable-${suffix}`;
const rabbitProject = `ai-crm-test-main-rabbit-${suffix}`;
const environment = {
  ...process.env,
  AI_CRM_COMPOSE_SECRET_DIR: secretDirectory,
  AI_CRM_CREATE_TEST_MIGRATION_URL: "1",
  AI_CRM_E2E_MAIN_CHAIN_INTEGRATION: "true",
  AI_CRM_E2E_MAIN_CHAIN_MODE: "durable",
  AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE: process.env.AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE ?? "false",
  ...(process.env.AI_CRM_E2E_TASK_COMMAND_FILE === undefined ? {} : { AI_CRM_E2E_TASK_COMMAND_FILE: process.env.AI_CRM_E2E_TASK_COMMAND_FILE }),
  AI_CRM_RABBITMQ_FIXTURE_DIR: rabbitDirectory,
  AI_CRM_TEST_FLOWABLE_PORT: String(flowablePort),
  AI_CRM_TEST_POSTGRES_PORT: String(postgresPort),
  AI_CRM_TEST_RABBITMQ_TLS_PORT: String(rabbitPort),
  DATABASE_MIGRATION_URL_FILE: resolve(secretDirectory, "migration_url"),
  TEST_E2E_DATABASE_URL_FILE: resolve(secretDirectory, "e2e_runtime_url"),
  TEST_FLOWABLE_BASE_URL: `http://127.0.0.1:${String(flowablePort)}/flowable-rest/service/`,
  TEST_FLOWABLE_PASSWORD_FILE: resolve(secretDirectory, "flowable_admin_password"),
};
const flowableCompose = ["compose", "-p", flowableProject, "-f", "deploy/compose/compose.base.yml", "-f", "deploy/compose/compose.postgres-test.yml", "-f", "deploy/flowable/compose.integration.yml"];
const rabbitCompose = ["compose", "-p", rabbitProject, "-f", "deploy/compose/compose.rabbitmq-integration.yml"];

function run(command, args) {
  const result = spawnSync(command, args, { env: environment, shell: false, stdio: "inherit", timeout: 300_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed.`);
}

function runCapture(command, args, extraEnvironment = {}) {
  const childEnvironment = { ...environment, ...extraEnvironment };
  for (const [key, value] of Object.entries(childEnvironment)) if (value === undefined) delete childEnvironment[key];
  const result = spawnSync(command, args, { env: childEnvironment, encoding: "utf8", shell: false, timeout: 300_000 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed.`);
  return result.stdout ?? "";
}

function finalEvidence(output, status) {
  for (const line of output.trim().split(/\r?\n/u).reverse()) {
    try {
      const value = JSON.parse(line);
      if (value?.status === status) return value;
    } catch { /* build output is not evidence */ }
  }
  throw new Error("e2e_main_chain_output_evidence_missing");
}

let primaryFailure;
try {
  run(process.execPath, ["scripts/bootstrap/compose-secrets.mjs", "test"]);
  const runtimePassword = (await readFile(resolve(secretDirectory, "postgres_app_password"), "utf8")).trim();
  await writeFile(
    environment.TEST_E2E_DATABASE_URL_FILE,
    `postgresql://ai_crm_runtime:${encodeURIComponent(runtimePassword)}@127.0.0.1:${String(postgresPort)}/ai_crm\n`,
    { mode: 0o600 },
  );
  run(process.execPath, ["scripts/bootstrap/rabbitmq-integration-fixture.mjs", rabbitDirectory, "walking-skeleton"]);
  run("docker", [...flowableCompose, "up", "-d", "--wait", "flowable"]);
  run("docker", [...rabbitCompose, "up", "-d", "--wait"]);
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/e2e...", "build"]);
  run(process.execPath, ["scripts/migration/run.mjs"]);
  run(process.execPath, ["tests/e2e/dist/apply-e2e-migration.js"]);
  const mainOutput = runCapture(process.execPath, ["tests/e2e/dist/durable-main-chain.js"]);
  if (process.env.AI_CRM_E2E_BROWSER_OBSERVATION === "true") {
    const mainEvidence = finalEvidence(mainOutput, "e2e-main-chain-durable-evidence-passed");
    const subjectId = process.env.AI_CRM_E2E_SYNTHETIC_USER_ID;
    const originalIssuer = process.env.AI_CRM_E2E_SYNTHETIC_ISSUER;
    const issuer = originalIssuer === undefined ? undefined : new URL(originalIssuer);
    if (subjectId === undefined || issuer === undefined || issuer.hostname !== "localhost" || issuer.pathname !== "/realms/ai-crm-dev") throw new Error("e2e_main_chain_browser_identity_missing");
    runCapture(process.execPath, ["scripts/check/run-e2e-browser-authentication.mjs"], {
      AI_CRM_E2E_DURABLE_DATABASE_URL_FILE: environment.TEST_E2E_DATABASE_URL_FILE,
      AI_CRM_E2E_DURABLE_OBSERVATION_JSON: JSON.stringify(mainEvidence),
      AI_CRM_E2E_KEYCLOAK_PORT: issuer.port,
      AI_CRM_E2E_IDENTITY_FIXTURE_FILE: process.env.AI_CRM_E2E_IDENTITY_FIXTURE_FILE,
      AI_CRM_E2E_KEYCLOAK_DUMP_FILE: process.env.AI_CRM_E2E_KEYCLOAK_DUMP_FILE,
      AI_CRM_E2E_IDENTITY_FIXTURE_OUTPUT: undefined,
      AI_CRM_E2E_KEYCLOAK_DUMP_OUTPUT: undefined,
      AI_CRM_E2E_FILE_REFERENCE_JSON: undefined,
      AI_CRM_E2E_TASK_COMMAND_FILE: undefined,
    });
  }
} catch (error) {
  spawnSync("docker", [...flowableCompose, "logs", "--no-color", "--tail", "100", "postgres", "flowable"], { env: environment, shell: false, stdio: "inherit" });
  spawnSync("docker", [...rabbitCompose, "logs", "--no-color", "--tail", "100"], { env: environment, shell: false, stdio: "inherit" });
  primaryFailure = error;
}

const cleanupFailures = [];
for (const args of [
  [...rabbitCompose, "down", "--volumes", "--remove-orphans"],
  [...flowableCompose, "down", "--volumes", "--remove-orphans"],
]) {
  const result = spawnSync("docker", args, { env: environment, shell: false, stdio: "inherit", timeout: 60_000 });
  if (result.error || result.status !== 0) cleanupFailures.push(result.error ?? new Error(`docker ${args[0]} cleanup failed.`));
}
for (const directory of [secretDirectory, rabbitDirectory]) {
  try { await rm(directory, { force: true, recursive: true }); }
  catch (error) { cleanupFailures.push(error); }
}
if (primaryFailure !== undefined || cleanupFailures.length > 0) {
  throw new AggregateError([...(primaryFailure === undefined ? [] : [primaryFailure]), ...cleanupFailures], "E2E main-chain run or cleanup failed.");
}
