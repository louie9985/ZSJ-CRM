import { spawnSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const pnpmCli = process.env.npm_execpath;
if (pnpmCli === undefined || !resolve(pnpmCli).endsWith("pnpm.cjs")) throw new Error("Run this integration through the pnpm script entry point.");
const secretDirectory = await mkdtemp(resolve(tmpdir(), "ai-crm-e2e-compose-"));
const rabbitDirectory = await mkdtemp(resolve(tmpdir(), "ai-crm-e2e-compose-rabbit-"));
const project = `ai-crm-test-e2e-${randomUUID().slice(0, 8)}`;
async function availablePort() {
  const port = randomInt(20_000, 60_000);
  await new Promise((ready, reject) => { const server = createServer(); server.once("error", reject); server.listen(port, "127.0.0.1", () => { server.close(ready); }); });
  return port;
}
const [postgresPort, rabbitPort] = await Promise.all([availablePort(), availablePort()]);
if (postgresPort === rabbitPort) throw new Error("E2E infrastructure ports must be distinct.");
const environment = { ...process.env, AI_CRM_COMPOSE_SECRET_DIR: secretDirectory, AI_CRM_CREATE_TEST_MIGRATION_URL: "1", AI_CRM_RABBITMQ_FIXTURE_DIR: rabbitDirectory, AI_CRM_TEST_POSTGRES_PORT: String(postgresPort), AI_CRM_TEST_RABBITMQ_TLS_PORT: String(rabbitPort), DATABASE_MIGRATION_URL_FILE: resolve(secretDirectory, "migration_url") };
const compose = [
  "compose", "-p", project,
  "-f", "deploy/compose/compose.base.yml",
  "-f", "deploy/compose/compose.test.yml",
  "-f", "deploy/compose/compose.rabbitmq-integration.yml",
  "-f", "deploy/compose/compose.e2e.yml",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", env: environment, shell: false, ...options });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${command} ${args[0] ?? ""} failed.`);
  return result.stdout?.trim() ?? "";
}

try {
  run(process.execPath, ["scripts/bootstrap/compose-secrets.mjs", "test"], { stdio: "inherit" });
  run(process.execPath, ["scripts/bootstrap/rabbitmq-integration-fixture.mjs", rabbitDirectory], { stdio: "inherit" });
  const definitions = JSON.parse(await readFile(resolve(rabbitDirectory, "definitions.json"), "utf8"));
  definitions.permissions = [
    { user: "ai_crm_integration_publisher", vhost: "ai-crm-integration", configure: "^ai-crm\\.platform\\.events\\.v1$", write: "^ai-crm\\.platform\\.events\\.v1$", read: "^$" },
    { user: "ai_crm_integration_consumer", vhost: "ai-crm-integration", configure: "^ai-crm\\.platform\\.(?:events|retry|dead-letter)\\.v1$|^ai-crm\\.platform\\.task-center\\.projection(?:\\.retry\\.(?:30s|300s)|\\.dead)?\\.v1$", write: "^ai-crm\\.platform\\.(?:events|retry|dead-letter)\\.v1$|^ai-crm\\.platform\\.task-center\\.projection(?:\\.retry\\.(?:30s|300s)|\\.dead)?\\.v1$", read: "^ai-crm\\.platform\\.(?:events|retry|dead-letter)\\.v1$|^ai-crm\\.platform\\.task-center\\.projection(?:\\.retry\\.(?:30s|300s)|\\.dead)?\\.v1$" },
  ];
  await writeFile(resolve(rabbitDirectory, "definitions.json"), `${JSON.stringify(definitions)}\n`, { mode: 0o600 });
  const workerPassword = (await readFile(resolve(secretDirectory, "postgres_worker_password"), "utf8")).trim();
  await writeFile(resolve(secretDirectory, "worker_runtime_url"), `postgresql://ai_crm_worker_runtime:${encodeURIComponent(workerPassword)}@postgres:5432/ai_crm\n`, { mode: 0o600 });
  run("docker", [...compose, "up", "-d", "--wait", "postgres", "rabbitmq"], { stdio: "inherit" });
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/database", "build"], { stdio: "inherit" });
  run(process.execPath, ["scripts/migration/run.mjs"], { stdio: "inherit" });
  run("docker", [...compose, "up", "-d", "--build", "--wait"], { stdio: "inherit" });
  const ready = run("docker", [...compose, "exec", "-T", "nginx", "wget", "-qO-", "http://127.0.0.1:8080/health/ready"]);
  if (JSON.parse(ready).status !== "ok") throw new Error("e2e_compose_api_not_ready");
  const apiLive = run("docker", [...compose, "exec", "-T", "nginx", "wget", "-qO-", "http://127.0.0.1:8080/api/health/live"]);
  if (JSON.parse(apiLive).status !== "ok") throw new Error("e2e_compose_api_route_failed");
  const workbench = run("docker", [...compose, "exec", "-T", "nginx", "wget", "-qO-", "http://127.0.0.1:8080/"]);
  if (!workbench.includes('<div id="root"></div>')) throw new Error("e2e_compose_workbench_route_failed");
  const eventId = randomUUID();
  const sourceTaskId = `task.e2e-${randomUUID().slice(0, 8)}`;
  run("docker", [...compose, "exec", "-T", "-e", "AI_CRM_E2E_PROCESS_ENTRYPOINT=publish-task-projection", "-e", `AI_CRM_E2E_TASK_PROJECTION_EVENT_ID=${eventId}`, "-e", `AI_CRM_E2E_TASK_PROJECTION_SOURCE_TASK_ID=${sourceTaskId}`, "worker-e2e", "node", "dist/worker-main.js"], { stdio: "inherit" });
  let projection = "";
  for (let attempt = 0; attempt < 40 && projection === ""; attempt += 1) {
    projection = run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "ai_crm_admin", "-d", "ai_crm", "-Atc", `select status||':'||source_version from platform_task_center.task_projections where source_task_id='${sourceTaskId}'`]);
    if (projection === "") await new Promise((ready) => { setTimeout(ready, 250); });
  }
  if (projection !== "open:1") throw new Error("e2e_task_projection_worker_not_applied");
  const inbox = run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "ai_crm_admin", "-d", "ai_crm", "-Atc", `select count(*) from platform_eventing.inbox_receipts where message_id='${eventId}' and consumer='platform.task-center.projection.v1'`]);
  if (inbox !== "1") throw new Error("e2e_task_projection_inbox_missing");
  process.stdout.write(`${JSON.stringify({ inboxReceipts: 1, project, projection, services: 10, status: "e2e-process-composition-passed", worker: "isolated-rabbit-postgres" })}\n`);
} catch (error) {
  spawnSync("docker", [...compose, "ps"], { encoding: "utf8", env: environment, shell: false, stdio: "inherit" });
  spawnSync("docker", [...compose, "logs", "--no-color", "--tail", "100"], { encoding: "utf8", env: environment, shell: false, stdio: "inherit" });
  throw error;
} finally {
  spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], {
    encoding: "utf8", env: environment, shell: false, stdio: "inherit",
  });
  await Promise.all([rm(secretDirectory, { force: true, recursive: true }), rm(rabbitDirectory, { force: true, recursive: true })]);
}
