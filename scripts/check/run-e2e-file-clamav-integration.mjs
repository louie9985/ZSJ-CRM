import { spawnSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.AI_CRM_TEST_CLAMAV_PORT ?? String(randomInt(40_000, 60_000)));
if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) throw new Error("AI_CRM_TEST_CLAMAV_PORT must be a valid explicit test port.");
let unavailablePort = Number(process.env.AI_CRM_TEST_CLAMAV_UNAVAILABLE_PORT ?? String(randomInt(40_000, 60_000)));
if (process.env.AI_CRM_TEST_CLAMAV_UNAVAILABLE_PORT === undefined) while (unavailablePort === port) unavailablePort = randomInt(40_000, 60_000);
if (!Number.isSafeInteger(unavailablePort) || unavailablePort < 1024 || unavailablePort > 65_535 || unavailablePort === port) throw new Error("AI_CRM_TEST_CLAMAV_UNAVAILABLE_PORT must be a distinct valid explicit test port.");
const assertAvailable = (candidate) => new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", () => reject(new Error(`Integration test port ${String(candidate)} is unavailable.`)));
  server.listen(candidate, "127.0.0.1", () => server.close(resolve));
});
await assertAvailable(port);
await assertAvailable(unavailablePort);

const suffix = randomUUID().slice(0, 8);
const container = `ai-crm-e2e-clamav-${suffix}`;
const network = `ai-crm-e2e-clamav-${suffix}`;
const volume = `ai-crm-e2e-clamav-${suffix}`;
const image = "clamav/clamav:1.4.5-debian";
const pnpmCli = process.env.npm_execpath;
if (pnpmCli === undefined || !resolve(pnpmCli).endsWith("pnpm.cjs")) throw new Error("Run this integration through the pnpm script entry point.");
const environment = {
  ...process.env,
  AI_CRM_E2E_FILE_CLAMAV_INTEGRATION: "true",
  AI_CRM_TEST_CLAMAV_HOST: "127.0.0.1",
  AI_CRM_TEST_CLAMAV_PORT: String(port),
  AI_CRM_TEST_CLAMAV_UNAVAILABLE_PORT: String(unavailablePort),
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { env: environment, shell: false, stdio: options.quiet ? "pipe" : "inherit", encoding: "utf8", timeout: 300_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed.${options.quiet ? ` ${result.stderr ?? ""}` : ""}`);
  return result.stdout ?? "";
}

let containerCreated = false;
let networkCreated = false;
let primaryFailure;
let volumeCreated = false;
try {
  run("docker", ["network", "create", network]);
  networkCreated = true;
  run("docker", ["volume", "create", volume]);
  volumeCreated = true;
  run("docker", ["run", "--detach", "--name", container, "--network", network, "--publish", `127.0.0.1:${String(port)}:3310`, "--volume", `${volume}:/var/lib/clamav`, image]);
  containerCreated = true;
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = run("docker", ["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", container], { quiet: true }).trim();
    if (status === "healthy") { healthy = true; break; }
    if (status === "unhealthy" || status === "exited" || status === "dead") throw new Error(`ClamAV entered terminal state: ${status}`);
    await delay(2_000);
  }
  if (!healthy) throw new Error("ClamAV did not become healthy within 180 seconds.");
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/crm-file-center", "build"]);
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/worker", "build"]);
  run(process.execPath, ["tests/e2e/src/file-clamav-integration.mjs"]);
} catch (error) {
  spawnSync("docker", ["logs", "--tail", "100", container], { env: environment, shell: false, stdio: "inherit" });
  primaryFailure = error;
}

const cleanupFailures = [];
for (const args of [
  ...(containerCreated ? [["rm", "--force", container]] : []),
  ...(volumeCreated ? [["volume", "rm", "--force", volume]] : []),
  ...(networkCreated ? [["network", "rm", network]] : []),
]) {
  const result = spawnSync("docker", args, { env: environment, shell: false, stdio: "ignore", timeout: 60_000 });
  if (result.error || result.status !== 0) cleanupFailures.push(result.error ?? new Error(`docker ${args[0]} cleanup failed.`));
}
if (primaryFailure !== undefined || cleanupFailures.length > 0) {
  throw new AggregateError([...(primaryFailure === undefined ? [] : [primaryFailure]), ...cleanupFailures], "E2E File/ClamAV run or cleanup failed.");
}
