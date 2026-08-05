import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabaseRuntime } from "@ai-crm/database";
import { createPrismaEventingStore } from "@ai-crm/crm-eventing-outbox";
import { createPrismaFormSchemaStore } from "@ai-crm/crm-form-schema";
import { createPrismaNotificationStore } from "@ai-crm/crm-notifications";
import { createPrismaTaskCenterStore } from "@ai-crm/crm-task-center";

import { createPostgresMainChainEvidence } from "./durable-evidence.js";
import { browserTaskAssignmentId, browserTaskIdempotencyKey, browserTaskSourceTaskId, browserTaskSourceType } from "./browser-task-command.js";
import { createMainChainIntegrationFactory, externalMainChainInputFromEnvironment, runMainChainIntegration } from "./main-chain.js";
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
const requireExternalEvidence = process.env["AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE"] === "true";
const externalInput = externalMainChainInputFromEnvironment(process.env, requireExternalEvidence);
const principalId = "principal.synthetic";
const expectedCommand = Object.freeze({ actor: Object.freeze({ activeAssignmentIds: Object.freeze([browserTaskAssignmentId]), principalId, workforcePersonId: "71000000-0000-4000-8000-000000000001" }), idempotencyKey: browserTaskIdempotencyKey, sourceTaskId: browserTaskSourceTaskId, sourceType: browserTaskSourceType });
let primaryFailure: unknown;
try {
  await runMainChainIntegration(createMainChainIntegrationFactory({
    browserTaskApiEvidence: false,
    createEventingStore: () => createPrismaEventingStore(runtime),
    createFormStore: () => createPrismaFormSchemaStore(runtime),
    createNotificationStore: () => createPrismaNotificationStore(runtime),
    createSource: (options) => createPostgresWalkingSkeletonSource({ ...options, runtime }),
    createTaskStore: () => createPrismaTaskCenterStore(runtime),
    createWorkflowLedger: () => createPostgresWorkflowCommandLedger({ leaseMs: 30_000, runtime }),
    durable: true,
    evidence: createPostgresMainChainEvidence(runtime),
    externalEvidence: externalInput !== undefined,
    resolveCompletionCommand: () => expectedCommand,
    ...(externalInput === undefined ? {} : {
      resolveFileReference: () => externalInput.fileReference,
      resolveTraceContext: () => Object.freeze({ traceId: externalInput.traceId, traceparent: externalInput.traceparent }),
    }),
  }));
} catch (error) {
  primaryFailure = error;
}
try { await runtime.close(); }
catch (closeError) {
  primaryFailure = primaryFailure === undefined ? closeError : new AggregateError([primaryFailure, closeError], "e2e_durable_main_chain_cleanup_failed");
}
if (primaryFailure instanceof Error) throw primaryFailure;
if (primaryFailure !== undefined) throw new Error("e2e_durable_main_chain_failed", { cause: primaryFailure });
