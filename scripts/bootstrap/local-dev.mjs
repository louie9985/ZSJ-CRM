/* global AbortSignal, URL, URLSearchParams, fetch */

import { existsSync } from "node:fs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  "packages/platform-modules/app-registry/tsconfig.json",
  "packages/platform-modules/audit/tsconfig.json",
  "packages/platform-modules/auth-context/tsconfig.json",
  "packages/platform-modules/authorization/tsconfig.json",
  "packages/platform-modules/eventing-outbox/tsconfig.json",
  "packages/platform-modules/file-center/tsconfig.json",
  "packages/platform-modules/form-schema/tsconfig.json",
  "packages/platform-modules/notifications/tsconfig.json",
  "packages/platform-modules/organization/tsconfig.json",
  "packages/platform-modules/task-center/tsconfig.json",
  "packages/platform-modules/workforce-access/tsconfig.json",
  "apps/api/tsconfig.build.json",
];

function usage() {
  console.log(`Usage: node scripts/bootstrap/local-dev.mjs <command>

Commands:
  infra      Prepare and start local Docker dependencies.
  migrate    Apply reviewed SQL migrations to the local ai_crm database.
  bootstrap  Create the local ZSJ/CRM administrators, grants, and registry entries.
  api        Start the local API/BFF on ${apiOrigin}.
  web        Start Workbench Web on ${webOrigin}, proxied to ${apiOrigin}.
  doctor     Print local service health and generated env locations.

Environment overrides:
  AI_CRM_LOCAL_API_PORT  API/BFF port, default 13001.
  AI_CRM_LOCAL_WEB_PORT  Workbench Web port, default 3000.
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
  run(process.execPath, ["scripts/prisma/generate.mjs", "--config", "prisma.config.ts"]);
  run(process.execPath, ["scripts/typescript/tsc.mjs", "-b", ...localApiBuildProjects]);
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

    AI_CRM_KEYCLOAK_ISSUER: "http://127.0.0.1:8080/realms/ai-crm-dev",
    AI_CRM_KEYCLOAK_JWKS_URI: "http://127.0.0.1:8080/realms/ai-crm-dev/protocol/openid-connect/certs",
    AI_CRM_PC_OIDC_CLIENT_ID: "ai-crm-pc-bff",
    AI_CRM_OIDC_API_AUDIENCE: "ai-crm-api",
    AI_CRM_PC_OIDC_CLIENT_SECRET_FILE: resolve(secretRoot, "pc_oidc_client_secret"),
    AI_CRM_PC_OIDC_POST_LOGOUT_REDIRECT_URI: `${webOrigin}/auth/pc/login`,
    AI_CRM_PC_OIDC_REDIRECT_URI: `${webOrigin}/auth/pc/callback`,
    AI_CRM_PC_ALLOWED_ORIGIN: webOrigin,
    AI_CRM_PC_OIDC_TIMEOUT_SECONDS: "5",

    AI_CRM_REDIS_URL: "redis://127.0.0.1:6379",
    AI_CRM_REDIS_PASSWORD_FILE: resolve(secretRoot, "redis_password"),
    AI_CRM_REDIS_CONNECT_TIMEOUT_MS: "5000",

    AI_CRM_PC_LOGIN_TRANSACTION_TTL_SECONDS: "300",
    AI_CRM_PC_SESSION_IDLE_TTL_SECONDS: "1800",
    AI_CRM_PC_SESSION_ABSOLUTE_TTL_SECONDS: "28800",
    AI_CRM_PC_REFRESH_LEASE_TTL_MS: "10000",
    AI_CRM_PC_SESSION_ENCRYPTION_KEY_FILE: resolve(secretRoot, "pc_session_encryption_key"),
    AI_CRM_PC_SESSION_ENCRYPTION_KEY_ID: "local-current",
    AI_CRM_PC_SESSION_INDEX_KEY_FILE: resolve(secretRoot, "pc_session_index_key"),

    AI_CRM_KEYCLOAK_ADMIN_BASE_URL: "http://127.0.0.1:8080",
    AI_CRM_KEYCLOAK_REALM: "ai-crm-dev",
    AI_CRM_KEYCLOAK_PUBLIC_REALM_BASE_PATH: "/realms/ai-crm-dev",
    AI_CRM_KEYCLOAK_ADMIN_CLIENT_ID: "ai-crm-workforce-provisioner",
    AI_CRM_KEYCLOAK_ADMIN_CLIENT_SECRET_FILE: resolve(secretRoot, "workforce_admin_client_secret"),
    AI_CRM_KEYCLOAK_ADMIN_TIMEOUT_MS: "5000",
    AI_CRM_KEYCLOAK_CREDENTIAL_RETURN_URI: `${webOrigin}/workforce-administration/credential-callback`,

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

async function updateKeycloakClient() {
  const adminPassword = await secret("keycloak_bootstrap_password");
  const tokenResponse = await fetch("http://127.0.0.1:8080/realms/master/protocol/openid-connect/token", {
    body: new URLSearchParams({
      client_id: "admin-cli",
      grant_type: "password",
      password: adminPassword,
      username: "dev_admin",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!tokenResponse.ok) throw new Error("local_keycloak_admin_login_failed");
  const tokenBody = await tokenResponse.json();
  const token = tokenBody?.access_token;
  if (typeof token !== "string") throw new Error("local_keycloak_admin_token_invalid");
  const headers = { authorization: `Bearer ${token}` };
  const clientsResponse = await fetch("http://127.0.0.1:8080/admin/realms/ai-crm-dev/clients?clientId=ai-crm-pc-bff", { headers });
  const clients = await clientsResponse.json();
  const client = clientsResponse.ok && Array.isArray(clients) && clients.length === 1 ? clients[0] : undefined;
  if (!client?.id) throw new Error("local_keycloak_pc_client_not_found");
  const update = await fetch(`http://127.0.0.1:8080/admin/realms/ai-crm-dev/clients/${client.id}`, {
    body: JSON.stringify({
      ...client,
      attributes: {
        ...(client.attributes ?? {}),
        "post.logout.redirect.uris": `${webOrigin}/auth/pc/login`,
      },
      redirectUris: [...new Set([...(Array.isArray(client.redirectUris) ? client.redirectUris : []), `${webOrigin}/auth/pc/callback`])],
      webOrigins: [...new Set([...(Array.isArray(client.webOrigins) ? client.webOrigins : []), webOrigin])],
    }),
    headers: { ...headers, "content-type": "application/json" },
    method: "PUT",
  });
  if (update.status !== 204) throw new Error("local_keycloak_pc_client_update_failed");
}

async function commandInfra() {
  await ensureComposeSecrets();
  run("docker", [...compose, "up", "-d", "--wait"]);
  await updateKeycloakClient();
  console.log(`Local infrastructure is ready. Keycloak accepts ${webOrigin}.`);
}

async function commandMigrate() {
  await ensureComposeSecrets();
  run(process.execPath, ["scripts/prisma/generate.mjs", "--config", "prisma.config.ts"]);
  run(process.execPath, ["scripts/typescript/tsc.mjs", "-b", "packages/database/tsconfig.json"]);
  run(process.execPath, ["scripts/migration/run.mjs"], {
    env: { DATABASE_MIGRATION_URL_FILE: resolve(secretRoot, "migration_url") },
  });
}

async function commandBootstrap() {
  await ensureComposeSecrets();
  buildLocalApiSurface();
  run(node, ["scripts/bootstrap/zsj-crm-local.mjs"], {
    env: {
      AI_CRM_ZSJ_BOOTSTRAP_ADAPTER_MODULE: resolve(repositoryRoot, "scripts/bootstrap/zsj-crm-local-adapter.mjs"),
      AI_CRM_LOCAL_BOOTSTRAP_DATABASE_URL_FILE: resolve(secretRoot, "migration_url"),
      AI_CRM_LOCAL_KEYCLOAK_BASE_URL: "http://127.0.0.1:8080",
      AI_CRM_LOCAL_KEYCLOAK_ADMIN_USERNAME_FILE: resolve(secretRoot, "keycloak_admin_username"),
      AI_CRM_LOCAL_KEYCLOAK_ADMIN_PASSWORD_FILE: resolve(secretRoot, "keycloak_bootstrap_password"),
      AI_CRM_LOCAL_ZSJ_ADMIN_USERNAME_FILE: resolve(secretRoot, "zsj_admin_username"),
      AI_CRM_LOCAL_ZSJ_ADMIN_REAL_NAME_FILE: resolve(secretRoot, "zsj_admin_real_name"),
      AI_CRM_LOCAL_ZSJ_ADMIN_PHONE_FILE: resolve(secretRoot, "zsj_admin_phone"),
      AI_CRM_LOCAL_ZSJ_ADMIN_PASSWORD_FILE: resolve(secretRoot, "zsj_admin_password"),
      AI_CRM_LOCAL_CRM_ADMIN_USERNAME_FILE: resolve(secretRoot, "crm_admin_username"),
      AI_CRM_LOCAL_CRM_ADMIN_REAL_NAME_FILE: resolve(secretRoot, "crm_admin_real_name"),
      AI_CRM_LOCAL_CRM_ADMIN_PHONE_FILE: resolve(secretRoot, "crm_admin_phone"),
      AI_CRM_LOCAL_CRM_ADMIN_PASSWORD_FILE: resolve(secretRoot, "crm_admin_password"),
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
  runLong(process.execPath, ["scripts/vite/run.mjs"], {
    AI_CRM_WORKBENCH_BFF_ORIGIN: apiOrigin,
  });
}

async function commandDoctor() {
  await ensureLocalApiFiles();
  console.log(`Local API env: ${localApiEnvFile}`);
  console.log(`CRM admin username file: ${resolve(secretRoot, "crm_admin_username")}`);
  console.log(`CRM admin password file: ${resolve(secretRoot, "crm_admin_password")}`);
  for (const [name, url] of [
    ["workbench", webOrigin],
    ["api-live", `${apiOrigin}/health/live`],
    ["api-ready", `${apiOrigin}/health/ready`],
    ["keycloak", "http://127.0.0.1:8080/realms/ai-crm-dev/.well-known/openid-configuration"],
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
