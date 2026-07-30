import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const secretDirectory = await mkdtemp(resolve(tmpdir(), "ai-crm-e2e-compose-"));
const project = `ai-crm-test-e2e-${randomUUID().slice(0, 8)}`;
const environment = { ...process.env, AI_CRM_COMPOSE_SECRET_DIR: secretDirectory };
const compose = [
  "compose", "-p", project,
  "-f", "deploy/compose/compose.base.yml",
  "-f", "deploy/compose/compose.test.yml",
  "-f", "deploy/compose/compose.e2e.yml",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", env: environment, shell: false, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed.`);
  return result.stdout?.trim() ?? "";
}

try {
  run(process.execPath, ["scripts/bootstrap/compose-secrets.mjs", "test"], { stdio: "inherit" });
  run("docker", [...compose, "up", "-d", "--build", "--wait"], { stdio: "inherit" });
  const ready = run("docker", [...compose, "exec", "-T", "nginx", "wget", "-qO-", "http://127.0.0.1:8080/health/ready"]);
  if (JSON.parse(ready).status !== "ok") throw new Error("e2e_compose_api_not_ready");
  const apiLive = run("docker", [...compose, "exec", "-T", "nginx", "wget", "-qO-", "http://127.0.0.1:8080/api/health/live"]);
  if (JSON.parse(apiLive).status !== "ok") throw new Error("e2e_compose_api_route_failed");
  const workbench = run("docker", [...compose, "exec", "-T", "nginx", "wget", "-qO-", "http://127.0.0.1:8080/"]);
  if (!workbench.includes('<div id="root"></div>')) throw new Error("e2e_compose_workbench_route_failed");
  process.stdout.write(`${JSON.stringify({ project, services: 10, status: "e2e-process-composition-passed" })}\n`);
} catch (error) {
  spawnSync("docker", [...compose, "ps"], { encoding: "utf8", env: environment, shell: false, stdio: "inherit" });
  spawnSync("docker", [...compose, "logs", "--no-color", "--tail", "100"], { encoding: "utf8", env: environment, shell: false, stdio: "inherit" });
  throw error;
} finally {
  spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], {
    encoding: "utf8", env: environment, shell: false, stdio: "inherit",
  });
  await rm(secretDirectory, { force: true, recursive: true });
}
