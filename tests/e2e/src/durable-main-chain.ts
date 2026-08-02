import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { createDatabaseRuntime } from "@ai-crm/database";
import { createPrismaEventingStore } from "@ai-crm/platform-eventing-outbox";
import { createPrismaFormSchemaStore } from "@ai-crm/platform-form-schema";
import { createPrismaNotificationStore } from "@ai-crm/platform-notifications";
import { createPrismaTaskCenterStore } from "@ai-crm/platform-task-center";

import { createPostgresMainChainEvidence } from "./durable-evidence.js";
import { browserTaskAssignmentId, browserTaskIdempotencyKey, browserTaskSourceTaskId, browserTaskSourceType } from "./browser-task-command.js";
import { createMainChainIntegrationFactory, externalMainChainInputFromEnvironment, runMainChainIntegration } from "./main-chain.js";
import { createPostgresWalkingSkeletonSource } from "./postgres-walking-skeleton-source.js";
import { createPostgresWorkflowCommandLedger } from "./postgres-workflow-ledger.js";
import { createWalkingSkeletonFormSubmissionPostgresStore } from "./walking-skeleton-form-submission-postgres-store.js";
import { createWalkingSkeletonTaskCommandStore } from "./walking-skeleton-task-command.js";

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
const syntheticIssuer = process.env["AI_CRM_E2E_SYNTHETIC_ISSUER"];
const syntheticSubjectId = process.env["AI_CRM_E2E_SYNTHETIC_USER_ID"];
const identityFixtureFile = process.env["AI_CRM_E2E_IDENTITY_FIXTURE_FILE"];
const keycloakDumpFile = process.env["AI_CRM_E2E_KEYCLOAK_DUMP_FILE"];
if (externalInput !== undefined && (syntheticIssuer === undefined || syntheticSubjectId === undefined || identityFixtureFile === undefined || keycloakDumpFile === undefined)) throw new Error("e2e_durable_main_chain_browser_identity_missing");
const principalId = syntheticIssuer === undefined || syntheticSubjectId === undefined ? "principal.synthetic" : `subject:${createHash("sha256").update(`${syntheticIssuer}\0${syntheticSubjectId}`).digest("hex")}`;
const expectedCommand = Object.freeze({ actor: Object.freeze({ activeAssignmentIds: Object.freeze([browserTaskAssignmentId]), principalId, workforcePersonId: "71000000-0000-4000-8000-000000000001" }), idempotencyKey: browserTaskIdempotencyKey, sourceTaskId: browserTaskSourceTaskId, sourceType: browserTaskSourceType });
const formSubmissionStore = createWalkingSkeletonFormSubmissionPostgresStore(runtime);
const taskCommandStore = createWalkingSkeletonTaskCommandStore(runtime);
let browserRun: Promise<void> | undefined;

function runCausalBrowser(): Promise<void> {
  if (externalInput === undefined || syntheticIssuer === undefined) return Promise.resolve();
  const issuer = new URL(syntheticIssuer);
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["scripts/check/run-e2e-browser-authentication.mjs"], {
      env: {
        ...process.env,
        AI_CRM_E2E_BROWSER_TRACE_ID: externalInput.traceId,
        AI_CRM_E2E_BROWSER_TRACEPARENT: externalInput.traceparent,
        AI_CRM_E2E_DURABLE_DATABASE_URL_FILE: secretPath,
        AI_CRM_E2E_FILE_REFERENCE_JSON: JSON.stringify(externalInput.fileReference),
        AI_CRM_E2E_IDENTITY_FIXTURE_FILE: identityFixtureFile,
        AI_CRM_E2E_KEYCLOAK_DUMP_FILE: keycloakDumpFile,
        AI_CRM_E2E_KEYCLOAK_PORT: issuer.port,
        AI_CRM_E2E_TASK_COMMAND_FILE: undefined,
      },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => { if (code === 0) resolveRun(); else rejectRun(new Error(`e2e_causal_browser_failed:${signal ?? String(code)}`)); });
  });
}

async function waitFor<T>(read: () => Promise<T | undefined>, code: string): Promise<T> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise<void>((resolveWait) => { setTimeout(resolveWait, 100); });
  }
  throw new Error(code);
}

async function waitForWhileBrowserRuns<T>(read: () => Promise<T | undefined>, code: string): Promise<T> {
  const observation = waitFor(read, code);
  if (browserRun === undefined) return observation;
  const browserFailure = browserRun.then(() => new Promise<T>(() => undefined));
  return Promise.race([observation, browserFailure]);
}
let primaryFailure: unknown;
try {
  await runMainChainIntegration(createMainChainIntegrationFactory({
    browserTaskApiEvidence: externalInput !== undefined,
    ...(externalInput === undefined ? {} : { confirmCompletionCommand: async () => {
      const observed = await waitForWhileBrowserRuns(() => taskCommandStore.get(browserTaskIdempotencyKey), "e2e_browser_task_command_timeout");
      if (observed.sourceCommandReference === undefined) throw new Error("e2e_browser_task_submission_reference_missing");
      return Object.freeze({ actor: observed.actor, idempotencyKey: observed.idempotencyKey, sourceCommandReference: observed.sourceCommandReference, sourceTaskId: observed.sourceTaskId, sourceType: observed.sourceType });
    } }),
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
    ...(externalInput === undefined ? {} : { resolveBrowserFormSubmission: async () => {
      browserRun ??= runCausalBrowser();
      const row = await waitForWhileBrowserRuns(async () => {
        const result = await runtime.execute<{ readonly submission_reference: string }>("select submission_reference from e2e_walking_skeleton.form_submission_command_receipts where trace_id=$1 order by submitted_at desc limit 1", [externalInput.traceId]);
        return result.rows[0];
      }, "e2e_browser_form_submission_timeout");
      const accepted = await formSubmissionStore.getBySubmissionReference(row.submission_reference);
      if (accepted === undefined || accepted.actor.actorId !== principalId || accepted.actor.workforcePersonId !== expectedCommand.actor.workforcePersonId) throw new Error("e2e_browser_form_submission_actor_mismatch");
      return Object.freeze({ fileReference: accepted.fileReference, operationId: accepted.operationId, reference: accepted.reference, replayed: false, submissionReference: accepted.submissionReference, submittedAt: accepted.submittedAt, traceId: accepted.traceId, version: accepted.version });
    } }),
    ...(externalInput === undefined ? {} : {
      resolveFileReference: () => externalInput.fileReference,
      resolveTraceContext: () => Object.freeze({ traceId: externalInput.traceId, traceparent: externalInput.traceparent }),
    }),
  }));
  await browserRun;
} catch (error) {
  primaryFailure = error;
  if (browserRun !== undefined) {
    try { await browserRun; }
    catch (browserError) {
      if (browserError !== error) primaryFailure = new AggregateError([error, browserError], "e2e_durable_main_chain_or_browser_failed");
    }
  }
}
try { await runtime.close(); }
catch (closeError) {
  primaryFailure = primaryFailure === undefined ? closeError : new AggregateError([primaryFailure, closeError], "e2e_durable_main_chain_cleanup_failed");
}
if (primaryFailure instanceof Error) throw primaryFailure;
if (primaryFailure !== undefined) throw new Error("e2e_durable_main_chain_failed", { cause: primaryFailure });
