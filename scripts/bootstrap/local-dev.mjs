/* global AbortSignal, fetch */

import { existsSync } from "node:fs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const secretRoot = resolve(repositoryRoot, "deploy/compose/.runtime/dev");
const localApiRoot = resolve(secretRoot, "local-api");
const localApiEnvFile = resolve(secretRoot, "local-api.env");
const localFileStorageRoot = resolve(secretRoot, "local-file-storage");
const node = process.execPath;
const pnpmCli = process.env.npm_execpath;
const compose = [
  "compose",
  "-p", "ai-crm-dev",
  "-f", "deploy/compose/compose.base.yml",
  "-f", "deploy/compose/compose.dev.yml",
];

const apiPort = process.env.AI_CRM_LOCAL_API_PORT ?? "13001";
const webPort = process.env.AI_CRM_LOCAL_WEB_PORT ?? "3000";
const webOrigin = `http://127.0.0.1:${webPort}`;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const localApiBuildProjects = [
  "packages/config/tsconfig.json",
  "packages/observability/tsconfig.json",
  "packages/database/tsconfig.json",
  "packages/crm-modules/audit/tsconfig.json",
  "packages/crm-modules/authorization/tsconfig.json",
  "packages/crm-modules/business-configuration/tsconfig.json",
  "packages/crm-modules/eventing-outbox/tsconfig.json",
  "packages/crm-modules/file-center/tsconfig.json",
  "packages/crm-modules/form-schema/tsconfig.json",
  "packages/crm-modules/notifications/tsconfig.json",
  "packages/crm-modules/organization/tsconfig.json",
  "packages/crm-modules/task-center/tsconfig.json",
  "packages/crm-modules/workforce-access/tsconfig.json",
  "apps/api/tsconfig.build.json",
];

function usage() {
  console.log(`Usage: node scripts/bootstrap/local-dev.mjs <command>

Commands:
  infra      Prepare and start local Docker dependencies.
  migrate    Apply reviewed SQL migrations to the local ai_crm database.
  bootstrap  Create the single local system administrator.
  api        Start the local API/BFF on ${apiOrigin}.
  web        Start Workbench Web on ${webOrigin}, proxied to ${apiOrigin}.
  doctor     Print local service health and generated env locations.

Environment overrides:
  AI_CRM_LOCAL_API_PORT          API/BFF port, default 13001.
  AI_CRM_LOCAL_WEB_PORT          Workbench Web port, default 3000.
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: false,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
}

function runLong(command, args, env) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    shell: false,
    stdio: "inherit",
  });
  child.once("error", (error) => { throw error; });
  child.once("exit", (code) => { process.exitCode = code ?? 1; });
}

function runPnpm(args, options = {}) {
  if (pnpmCli) run(node, [pnpmCli, ...args], options);
  else run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, options);
}

function runPnpmLong(args, env) {
  if (pnpmCli) runLong(node, [pnpmCli, ...args], env);
  else runLong(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, env);
}

async function writeOnce(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, "wx", 0o600).catch((error) => {
    if (error?.code === "EEXIST") return undefined;
    throw error;
  });
  if (!file) return;
  try {
    await file.writeFile(value);
  } finally {
    await file.close();
  }
}

async function secret(name) {
  return (await readFile(resolve(secretRoot, name), "utf8")).trim();
}

async function ensureComposeSecrets() {
  run(node, ["scripts/bootstrap/compose-secrets.mjs", "dev"]);
  await writeOnce(
    resolve(secretRoot, "migration_url"),
    `postgresql://ai_crm_migration:${await secret("postgres_migration_password")}@127.0.0.1:5432/ai_crm\n`,
  );
}

async function ensureLocalApiFiles() {
  await ensureComposeSecrets();
  await mkdir(localApiRoot, { recursive: true });
  await writeFile(
    resolve(localApiRoot, "postgres_app_url"),
    `postgresql://ai_crm_runtime:${await secret("postgres_app_password")}@127.0.0.1:5432/ai_crm\n`,
    { mode: 0o600 },
  );
  await mkdir(localFileStorageRoot, { recursive: true });
  await writeFile(localApiEnvFile, renderLocalApiEnv(), { mode: 0o600 });
}

function buildLocalApiSurface() {
  run(node, ["scripts/prisma/generate.mjs", "--config", "prisma.config.ts"]);
  run(node, ["scripts/typescript/tsc.mjs", "-b", ...localApiBuildProjects]);
}

function ensureWorkbenchLinks() {
  const requiredLinks = [
    "apps/workbench-web/node_modules/@vitejs/plugin-react",
    "apps/workbench-web/node_modules/vite",
  ];
  if (requiredLinks.every((path) => existsSync(resolve(repositoryRoot, path)))) return;
  console.log("Workbench dependency links are incomplete; repairing pnpm workspace links.");
  runPnpm(["install", "--offline", "--force"]);
}

function renderLocalApiEnv() {
  const lines = {
    NODE_ENV: "test",
    AI_CRM_API_HOST: "127.0.0.1",
    AI_CRM_API_PORT: apiPort,
    AI_CRM_API_SCHEMA_VERSION: "0.0.0",
    AI_CRM_INSTANCE_ID: "api-local",
    AI_CRM_RELEASE: "local-development",
    AI_CRM_MIGRATIONS_ROOT: repositoryRoot,
    AI_CRM_POSTGRES_URL_FILE: resolve(localApiRoot, "postgres_app_url"),

    AI_CRM_PC_ALLOWED_ORIGIN: webOrigin,
    AI_CRM_REDIS_URL: "redis://127.0.0.1:6379",
    AI_CRM_REDIS_PASSWORD_FILE: resolve(secretRoot, "redis_password"),
    AI_CRM_REDIS_CONNECT_TIMEOUT_MS: "5000",
    AI_CRM_SESSION_INDEX_KEY_FILE: resolve(secretRoot, "session_index_key"),

    AI_CRM_FILE_DOWNLOAD_GRANT_TTL_MS: "300000",
    AI_CRM_FILE_MAXIMUM_SCAN_BYTES: "10485760",
    AI_CRM_FILE_MAXIMUM_UPLOAD_BYTES: "10485760",
    AI_CRM_FILE_UPLOAD_SESSION_TTL_MS: "300000",
    AI_CRM_FILE_STORAGE_PROVIDER: "local",
    AI_CRM_LOCAL_FILE_STORAGE_ROOT: localFileStorageRoot,
  };
  return `${Object.entries(lines).map(([name, value]) => `${name}=${value}`).join("\n")}\n`;
}

async function readEnvFile(path) {
  const result = {};
  const content = await readFile(path, "utf8");
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`local_env_line_invalid:${line}`);
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return result;
}

async function commandInfra() {
  await ensureComposeSecrets();
  run("docker", [...compose, "up", "-d", "--wait"]);
  console.log("Local PostgreSQL, Redis, RabbitMQ, Flowable, ClamAV, and Nginx are ready.");
}

async function commandMigrate() {
  await ensureComposeSecrets();
  run(node, ["scripts/prisma/generate.mjs", "--config", "prisma.config.ts"]);
  run(node, ["scripts/typescript/tsc.mjs", "-b", "packages/database/tsconfig.json"]);
  run(node, ["scripts/migration/run.mjs"], {
    env: { DATABASE_MIGRATION_URL_FILE: resolve(secretRoot, "migration_url") },
  });
}

async function commandBootstrap() {
  await ensureComposeSecrets();
  run(node, ["scripts/prisma/generate.mjs", "--config", "prisma.config.ts"]);
  run(node, ["scripts/typescript/tsc.mjs", "-b", "packages/database/tsconfig.json", "packages/crm-modules/workforce-access/tsconfig.json"]);
  run(node, ["scripts/bootstrap/local-account-bootstrap.mjs"], {
    env: {
      AI_CRM_LOCAL_BOOTSTRAP: "1",
      AI_CRM_LOCAL_BOOTSTRAP_DATABASE_URL_FILE: resolve(secretRoot, "migration_url"),
      AI_CRM_LOCAL_SYSTEM_ADMIN_PASSWORD_FILE: resolve(secretRoot, "system_admin_password"),
    },
  });
}

async function commandApi() {
  await ensureLocalApiFiles();
  buildLocalApiSurface();
  const env = await readEnvFile(localApiEnvFile);
  for (const [name, value] of Object.entries(env)) process.env[name] = value;
  const apiModule = await import(pathToFileURL(resolve(repositoryRoot, "apps/api/dist/index.js")).href);
  await apiModule.runApiMain({
    bindingFactory: {
      create(configuration, signal) {
        return apiModule.createProductionApiPlatformBindings(undefined, signal, configuration.shutdownTimeoutMs);
      },
    },
  });
  console.log(`Local API/BFF is listening on ${apiOrigin}.`);
}

async function commandWeb() {
  ensureWorkbenchLinks();
  runLong(node, ["scripts/vite/run.mjs"], { AI_CRM_WORKBENCH_BFF_ORIGIN: apiOrigin });
}

async function commandDoctor() {
  await ensureLocalApiFiles();
  console.log(`Local API env: ${localApiEnvFile}`);
  console.log(`System administrator username: system.admin`);
  console.log(`System administrator password file: ${resolve(secretRoot, "system_admin_password")}`);
  for (const [name, url] of [
    ["crm-web", webOrigin],
    ["api-live", `${apiOrigin}/health/live`],
    ["api-ready", `${apiOrigin}/health/ready`],
  ]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      console.log(`${name}: ${response.status} ${url}`);
    } catch {
      console.log(`${name}: unavailable ${url}`);
    }
  }
}

const command = process.argv[2];
try {
  if (command === "infra") await commandInfra();
  else if (command === "migrate") await commandMigrate();
  else if (command === "bootstrap") await commandBootstrap();
  else if (command === "api") await commandApi();
  else if (command === "web") await commandWeb();
  else if (command === "doctor") await commandDoctor();
  else {
    usage();
    process.exitCode = command === undefined || command === "help" ? 0 : 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
