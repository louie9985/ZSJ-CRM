import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const environment = process.argv[2];
if (!['dev', 'test'].includes(environment)) {
  console.error("Usage: node scripts/bootstrap/compose-secrets.mjs <dev|test>");
  process.exit(1);
}

const override = process.env.AI_CRM_COMPOSE_SECRET_DIR;
if (override && !isAbsolute(override)) {
  console.error("AI_CRM_COMPOSE_SECRET_DIR must be an absolute path.");
  process.exit(1);
}
const directory = override ?? resolve("deploy/compose/.runtime", environment);
const names = [
  "postgres_admin_password",
  "postgres_migration_password",
  "postgres_app_password",
  "postgres_worker_password",
  "postgres_flowable_password",
  "session_index_key",
  "system_admin_password",
  "flowable_admin_password",
  "rabbitmq_password",
  "redis_password",
];
const obsoleteNames = [
  "crm_admin_password",
  "crm_admin_phone",
  "crm_admin_real_name",
  "crm_admin_username",
  "pc_session_encryption_key",
  "pc_session_index_key",
  "pc_oidc_client_secret",
  "postgres_keycloak_password",
  "keycloak_bootstrap_password",
  "workforce_admin_client_secret",
  "workforce_worker_client_secret",
  "zsj_admin_password",
  "zsj_admin_phone",
  "zsj_admin_real_name",
  "zsj_admin_username",
];

function restrictWindowsAcl(path) {
  if (process.platform !== "win32") return;
  const account = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  if (!process.env.USERDOMAIN || !process.env.USERNAME) throw new Error("windows_secret_account_unavailable");
  const result = spawnSync("icacls.exe", [path, "/inheritance:r", "/grant:r", `${account}:(F)`, "*S-1-5-18:(F)", "*S-1-5-32-544:(F)"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("windows_secret_acl_restriction_failed");
}

async function hardenWindowsFile(path) {
  if (process.platform !== "win32") return;
  try { restrictWindowsAcl(path); return; }
  catch {
    const replacement = `${path}.${randomBytes(12).toString("hex")}.acl`;
    const contents = await readFile(path);
    const file = await open(replacement, "wx", 0o600);
    try { await file.writeFile(contents); }
    finally { await file.close(); }
    try {
      restrictWindowsAcl(replacement);
      await rename(replacement, path);
    } finally {
      await rm(replacement, { force: true });
    }
  }
}

await mkdir(directory, { recursive: true });
for (const name of obsoleteNames) await rm(resolve(directory, name), { force: true });
for (const name of names) {
  const path = resolve(directory, name);
  try {
    const file = await open(path, "wx", 0o600);
    await file.writeFile(`${randomBytes(32).toString("base64url")}\n`);
    await file.close();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  await hardenWindowsFile(path);
}
if (process.env.AI_CRM_CREATE_TEST_MIGRATION_URL === "1") {
  const port = process.env.AI_CRM_TEST_POSTGRES_PORT;
  if (!port?.match(/^\d{4,5}$/) || Number(port) > 65_535) {
    console.error("AI_CRM_TEST_POSTGRES_PORT must be a valid explicit test port.");
    process.exit(1);
  }
  const password = readFile(resolve(directory, "postgres_migration_password"), "utf8");
  const file = await open(resolve(directory, "migration_url"), "wx", 0o600).catch((error) => {
    if (error?.code === "EEXIST") return undefined;
    throw error;
  });
  if (file) {
    await file.writeFile(`postgresql://ai_crm_migration:${(await password).trim()}@127.0.0.1:${port}/ai_crm\n`);
    await file.close();
  }
  await hardenWindowsFile(resolve(directory, "migration_url"));
}
console.log(`Runtime Secret files are present for ${environment}; existing files were preserved.`);
