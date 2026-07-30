import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabaseRuntime } from "@ai-crm/database";
import { createPostgresEventingStore } from "@ai-crm/platform-eventing-outbox";
import { createPostgresNotificationStore } from "@ai-crm/platform-notifications";

import { createMainChainIntegrationFactory, runMainChainIntegration } from "./main-chain.js";
import { createPostgresWalkingSkeletonSource } from "./postgres-walking-skeleton-source.js";
import { createPostgresWorkflowCommandLedger } from "./postgres-workflow-ledger.js";

if (process.env["AI_CRM_E2E_MAIN_CHAIN_INTEGRATION"] !== "true" || process.env["AI_CRM_E2E_MAIN_CHAIN_MODE"] !== "durable") {
  throw new Error("e2e_durable_main_chain_activation_invalid");
}
const secretPath = process.env["TEST_E2E_DATABASE_URL_FILE"];
const expectedPort = Number(process.env["AI_CRM_TEST_POSTGRES_PORT"]);
if (secretPath === undefined || resolve(secretPath) !== secretPath || !Number.isSafeInteger(expectedPort)) throw new Error("e2e_durable_main_chain_configuration_invalid");
const connectionString = (await readFile(secretPath, "utf8")).trim();
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || Number(target.port) !== expectedPort || target.pathname !== "/ai_crm") {
  throw new Error("e2e_durable_main_chain_target_invalid");
}
const runtime = createDatabaseRuntime({
  applicationName: "e2e_main_chain",
  connectionString,
  connectionTimeoutMs: 5_000,
  idleTimeoutMs: 10_000,
  maxConnections: 8,
  statementTimeoutMs: 10_000,
});
try {
  await runMainChainIntegration(createMainChainIntegrationFactory({
    createEventingStore: () => createPostgresEventingStore(runtime),
    createNotificationStore: () => createPostgresNotificationStore(runtime),
    createSource: (options) => createPostgresWalkingSkeletonSource({ ...options, runtime }),
    createWorkflowLedger: () => createPostgresWorkflowCommandLedger({ leaseMs: 30_000, runtime }),
    durable: true,
  }));
} finally {
  await runtime.close();
}
