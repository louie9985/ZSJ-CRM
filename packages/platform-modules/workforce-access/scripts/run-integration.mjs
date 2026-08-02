import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const container = `ai-crm-workforce-access-${randomUUID().slice(0, 8)}`;
const pnpmCli = process.env.npm_execpath; if (!pnpmCli) throw new Error("pnpm CLI path is unavailable.");
const directory = await mkdtemp(join(tmpdir(), "ai-crm-workforce-access-")); const passwordFile = join(directory, "postgres_password"); const urlFile = join(directory, "migration_url"); const password = randomBytes(32).toString("base64url"); const repositoryRoot = resolve(import.meta.dirname, "../../../..");
let failure;
try {
  await writeFile(passwordFile, `${password}\n`, { encoding: "utf8", mode: 0o600 }); await chmod(passwordFile, 0o600);
  run("docker", ["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_USER=ai_crm_migration", "--env", "POSTGRES_DB=ai_crm_workforce_access", "--env", "POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password", "--mount", `type=bind,source=${resolve(passwordFile)},target=/run/secrets/postgres_password,readonly`, "postgres:17.5-bookworm"]);
  const deadline = Date.now() + 30_000; let port; let previousStart = "";
  while (Date.now() < deadline) { const probe = spawnSync("docker", ["exec", container, "psql", "--host", "127.0.0.1", "--username", "ai_crm_migration", "--dbname", "ai_crm_workforce_access", "--tuples-only", "--no-align", "--command", "select pg_postmaster_start_time()::text"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); const currentStart = probe.status === 0 ? probe.stdout.trim() : ""; if (currentStart && currentStart === previousStart) { port = run("docker", ["port", container, "5432/tcp"], true).trim().split(":").at(-1); break; } previousStart = currentStart; await delay(250); }
  if (!port) throw new Error("PostgreSQL did not become ready."); await writeFile(urlFile, `postgresql://ai_crm_migration:${password}@127.0.0.1:${port}/ai_crm_workforce_access\n`, { encoding: "utf8", mode: 0o600 }); await chmod(urlFile, 0o600);
  run("docker", ["exec", container, "psql", "--username", "ai_crm_migration", "--dbname", "ai_crm_workforce_access", "--set", "ON_ERROR_STOP=1", "--command", "CREATE ROLE ai_crm_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; CREATE ROLE ai_crm_worker_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;"]);
  const migrated = spawnSync(process.execPath, [pnpmCli, "db:migrate"], { cwd: repositoryRoot, env: { ...process.env, DATABASE_MIGRATION_URL_FILE: urlFile }, stdio: "inherit" });
  if (migrated.status !== 0) throw new Error(`Database migration failed with exit code ${String(migrated.status)}.`);
  const vitest = resolve(repositoryRoot, "node_modules/vitest/vitest.mjs"); const result = spawnSync(process.execPath, [vitest, "run", "--config", "../../../vitest.config.ts", "src/postgres-store.integration.test.ts"], { cwd: resolve(import.meta.dirname, ".."), env: { ...process.env, TEST_WORKFORCE_ACCESS_DATABASE_URL_FILE: urlFile }, stdio: "inherit" }); if (result.status !== 0) throw new Error(`Integration tests failed with exit code ${String(result.status)}.`);
} catch (error) { failure = error; } finally { spawnSync("docker", ["rm", "--force", "--volumes", container], { stdio: "ignore" }); await rm(directory, { force: true, recursive: true }); }
if (failure) throw failure;
function run(command, args, capture = false) { const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: capture ? "pipe" : ["ignore", "ignore", "inherit"] }); if (result.status !== 0) throw new Error(`${command} failed.`); return result.stdout ?? ""; }
