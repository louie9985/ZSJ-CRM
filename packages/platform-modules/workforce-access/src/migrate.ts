import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runMigrations } from "@ai-crm/database";
const path = process.env.DATABASE_MIGRATION_URL_FILE;
if (!path) throw new Error("DATABASE_MIGRATION_URL_FILE is required.");
const connectionString = (await readFile(resolve(path), "utf8")).toString().trim();
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL_FILE resolved to an empty Secret.");
await runMigrations(connectionString, resolve(import.meta.dirname, "../migrations"));
