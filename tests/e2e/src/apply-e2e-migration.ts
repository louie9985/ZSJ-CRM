import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runMigrations } from "@ai-crm/database";

const secretPath = process.env["DATABASE_MIGRATION_URL_FILE"];
const expectedPort = Number(process.env["AI_CRM_TEST_POSTGRES_PORT"]);
if (process.env["AI_CRM_E2E_MAIN_CHAIN_INTEGRATION"] !== "true"
  || process.env["AI_CRM_E2E_MAIN_CHAIN_MODE"] !== "durable"
  || secretPath === undefined
  || resolve(secretPath) !== secretPath
  || !Number.isSafeInteger(expectedPort)) throw new Error("e2e_migration_configuration_invalid");
const connectionString = (await readFile(secretPath, "utf8")).trim();
if (connectionString.length === 0) throw new Error("e2e_migration_configuration_invalid");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || Number(target.port) !== expectedPort || target.pathname !== "/ai_crm") {
  throw new Error("e2e_migration_target_invalid");
}
const directory = fileURLToPath(new URL("../migrations", import.meta.url));
await runMigrations(connectionString, directory);
process.stdout.write("E2E Walking Skeleton migration is current.\n");
