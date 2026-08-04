import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const expectedServices = Object.freeze(["api-e2e", "clamav", "flowable", "keycloak", "nginx", "postgres", "rabbitmq", "redis", "workbench-e2e", "worker-e2e"]);
const requiredFiles = Object.freeze([
  "apps/api/src/main.ts",
  "apps/worker/src/main.ts",
  "deploy/compose/compose.base.yml",
  "deploy/compose/compose.test.yml",
  "deploy/compose/compose.e2e.yml",
  "deploy/compose/compose.e2e-browser-auth.yml",
  "deploy/flowable/bpmn/synthetic-human-task.v1.bpmn20.xml",
  "deploy/keycloak/realm-dev.json",
  "scripts/check/run-e2e-rabbit-jobs-integration.mjs",
  "scripts/check/run-e2e-flowable-workflow-integration.mjs",
  "scripts/check/run-e2e-main-chain-integration.mjs",
  "scripts/check/run-e2e-file-clamav-integration.mjs",
  "scripts/check/run-e2e-browser-authentication.mjs",
  "tests/e2e/migrations/0000000016_e2e_walking_skeleton_durable_stores.sql",
  "tests/e2e/migrations/0000000016_e2e_walking_skeleton_durable_stores.meta.json",
  "tests/e2e/migrations/0000000017_e2e_submission_trace_audit_evidence.sql",
  "tests/e2e/migrations/0000000017_e2e_submission_trace_audit_evidence.meta.json",
  "tests/e2e/migrations/0000000018_e2e_form_submission_command_receipts.sql",
  "tests/e2e/migrations/0000000018_e2e_form_submission_command_receipts.meta.json",
  "tests/e2e/src/api-main.ts",
  "tests/e2e/src/api-main.test.ts",
  "tests/e2e/src/apply-e2e-migration.ts",
  "tests/e2e/src/browser-authentication-bff.ts",
  "tests/e2e/src/browser-task-command.ts",
  "tests/e2e/src/walking-skeleton-form-submission.ts",
  "tests/e2e/src/walking-skeleton-task-command.ts",
  "tests/e2e/src/durable-audit-evidence.ts",
  "tests/e2e/src/durable-evidence.ts",
  "tests/e2e/src/durable-main-chain.ts",
  "tests/e2e/src/file-clamav-integration.mjs",
  "tests/e2e/src/main-chain.ts",
  "tests/e2e/src/postgres-walking-skeleton-source.ts",
  "tests/e2e/src/postgres-workflow-ledger.ts",
  "tests/e2e/src/flowable-workflow-integration.ts",
  "tests/e2e/src/rabbit-job-integration.ts",
  "scripts/check/e2e-combined-evidence.mjs",
  "tests/e2e/src/worker-main.ts",
  "tests/e2e/worker-entrypoint.sh",
  "tests/e2e/src/walking-skeleton-rabbit.ts",
]);

const implementationGaps = Object.freeze([]);

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    ...options,
  });
  if (result.error || result.status !== 0) throw new Error("e2e_environment_preflight_command_failed");
  return result.stdout.trim();
}

function validateServices(output) {
  const services = [...new Set(output.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))].sort();
  if (services.length !== expectedServices.length || services.some((service, index) => service !== expectedServices[index])) {
    throw new Error("e2e_environment_preflight_service_mismatch");
  }
  return services;
}

async function assertRepositoryEvidence(root, readText = (path) => readFile(path, "utf8")) {
  await Promise.all(requiredFiles.map((path) => readText(resolve(root, path))));
  const [apiReadme, apiComposition, asyncApi, walkingSkeletonAsyncApi, jobsReadme, sourceJob, notificationJob, workerRegistry, rabbitRunner, rabbitDriver, flowableRunner, flowableDriver, browserAuthRunner, browserAuthBff, browserTaskCommand, apiMain, apiMainTest, durableEvidence, evidenceMigration, evidenceMetadataText, mainChainRunner, mainChain, clamavDriver, composeRunner, workerMain, e2eCompose, combinedEvidence] = await Promise.all([
    readText(resolve(root, "apps/api/README.md")),
    readText(resolve(root, "apps/api/src/composition-factory.ts")),
    readText(resolve(root, "contracts/asyncapi/topology.asyncapi.yaml")),
    readText(resolve(root, "contracts/asyncapi/walking-skeleton.asyncapi.yaml")),
    readText(resolve(root, "contracts/jobs/README.md")),
    readText(resolve(root, "contracts/jobs/walking-skeleton-source-command.v1.schema.json")),
    readText(resolve(root, "contracts/jobs/notification-intent-submit.v1.schema.json")),
    readText(resolve(root, "apps/worker/src/handler-registry.ts")),
    readText(resolve(root, "scripts/check/run-e2e-rabbit-jobs-integration.mjs")),
    readText(resolve(root, "tests/e2e/src/rabbit-job-integration.ts")),
    readText(resolve(root, "scripts/check/run-e2e-flowable-workflow-integration.mjs")),
    readText(resolve(root, "tests/e2e/src/flowable-workflow-integration.ts")),
    readText(resolve(root, "scripts/check/run-e2e-browser-authentication.mjs")),
    readText(resolve(root, "tests/e2e/src/browser-authentication-bff.ts")),
    readText(resolve(root, "tests/e2e/src/browser-task-command.ts")),
    readText(resolve(root, "tests/e2e/src/api-main.ts")),
    readText(resolve(root, "tests/e2e/src/api-main.test.ts")),
    readText(resolve(root, "tests/e2e/src/durable-evidence.ts")),
    readText(resolve(root, "tests/e2e/migrations/0000000017_e2e_submission_trace_audit_evidence.sql")),
    readText(resolve(root, "tests/e2e/migrations/0000000017_e2e_submission_trace_audit_evidence.meta.json")),
    readText(resolve(root, "scripts/check/run-e2e-main-chain-integration.mjs")),
    readText(resolve(root, "tests/e2e/src/main-chain.ts")),
    readText(resolve(root, "tests/e2e/src/file-clamav-integration.mjs")),
    readText(resolve(root, "scripts/check/run-e2e-compose-integration.mjs")),
    readText(resolve(root, "tests/e2e/src/worker-main.ts")),
    readText(resolve(root, "deploy/compose/compose.e2e.yml")),
    readText(resolve(root, "scripts/check/e2e-combined-evidence.mjs")),
  ]);
  if (!apiReadme.includes("Workflow remains uncomposed")) throw new Error("e2e_environment_preflight_workflow_boundary_changed");
  if (!apiComposition.includes("task_source_router_unavailable")) throw new Error("e2e_environment_preflight_task_boundary_changed");
  if (!asyncApi.includes("taskProjectionLifecycleQueue")
    || !asyncApi.includes("realtimeNodeQueue")
    || asyncApi.includes("notification-intent-submit")
    || asyncApi.includes("walking-skeleton")) {
    throw new Error("e2e_environment_preflight_async_contract_changed");
  }
  if (!walkingSkeletonAsyncApi.includes("productionActivation: forbidden")
    || !walkingSkeletonAsyncApi.includes("consumeSourceCommand")
    || !walkingSkeletonAsyncApi.includes("consumeNotificationIntent")) {
    throw new Error("e2e_environment_preflight_walking_skeleton_contract_changed");
  }
  if (!sourceJob.includes("tests.walking-skeleton.source-command")
    || !notificationJob.includes("platform.notifications.intent-submit")) {
    throw new Error("e2e_environment_preflight_job_contract_changed");
  }
  if (!jobsReadme.includes("authoritative source state") || !workerRegistry.includes("WorkerHandlerRegistry")) {
    throw new Error("e2e_environment_preflight_job_boundary_changed");
  }
  if (!rabbitRunner.includes('"walking-skeleton"')
    || !rabbitRunner.includes("AI_CRM_E2E_RABBIT_JOB_INTEGRATION")
    || !rabbitDriver.includes('status: "e2e-rabbit-jobs-passed"')) {
    throw new Error("e2e_environment_preflight_rabbit_job_evidence_changed");
  }
  if (!flowableRunner.includes("AI_CRM_E2E_FLOWABLE_WORKFLOW_INTEGRATION")
    || !flowableDriver.includes("createFlowableRestEngine")
    || !flowableDriver.includes('status: "e2e-flowable-workflow-passed"')) {
    throw new Error("e2e_environment_preflight_flowable_workflow_evidence_changed");
  }
  if (!browserAuthRunner.includes('"e2e-browser-authentication-passed"')
    || !browserAuthRunner.includes('"e2e-browser-durable-observation-passed"')
    || !browserAuthRunner.includes("Network.getAllCookies")
    || !browserAuthRunner.includes("browserTraceId")
    || !browserAuthRunner.includes("browserTraceparent")
    || !browserAuthRunner.includes("taskCompletionAccepted")
    || !browserAuthBff.includes("createPcBffSessionService")
    || !browserAuthBff.includes("recordBrowserTaskCommand")
    || !browserAuthBff.includes("createPrismaTaskCenterStore")
    || !browserAuthBff.includes("createPrismaNotificationStore")
    || !browserAuthBff.includes("durableDatabaseUrlFile")
    || !browserTaskCommand.includes("parseBrowserTaskCommand")) {
    throw new Error("e2e_environment_preflight_browser_auth_evidence_changed");
  }
  if (!apiMain.includes("createWalkingSkeletonTaskPorts")
    || !apiMain.includes("sessionForMutation")
    || !apiMainTest.includes("idempotently routes completion")
    || !apiMainTest.includes("authentication_csrf_rejected")) {
    throw new Error("e2e_environment_preflight_task_api_evidence_changed");
  }
  if (!durableEvidence.includes("saveSubmission")
    || !durableEvidence.includes("inspect(traceId")
    || !evidenceMigration.includes("CREATE TABLE e2e_walking_skeleton.form_submissions")
    || !evidenceMigration.includes("GRANT SELECT, INSERT ON audit.records")) {
    throw new Error("e2e_environment_preflight_durable_evidence_changed");
  }
  if (!clamavDriver.includes("resolveFileReference")
    || !clamavDriver.includes("cleanFileReference")
    || !mainChain.includes('environment["AI_CRM_E2E_BROWSER_TRACE_ID"]')
    || !mainChain.includes('environment["AI_CRM_E2E_BROWSER_TRACEPARENT"]')
    || !mainChain.includes('environment["AI_CRM_E2E_FILE_REFERENCE_JSON"]')
    || !mainChainRunner.includes("AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE")
    || !combinedEvidence.includes('status: "e2e-browser-to-worker-causal-evidence-passed"')
    || !combinedEvidence.includes("causalBrowserEvidence")
    || !combinedEvidence.includes("formSubmissionReference")
    || combinedEvidence.includes("AI_CRM_E2E_TASK_COMMAND_FILE:")
    || combinedEvidence.includes("AI_CRM_E2E_FORM_SUBMISSION_FILE:")
    || !combinedEvidence.includes("AI_CRM_E2E_KEYCLOAK_DUMP_FILE")
    || !mainChainRunner.includes("AI_CRM_E2E_DURABLE_DATABASE_URL_FILE")
    || !combinedEvidence.includes("assert.deepEqual(mainChainEvidence.fileReference, fileEvidence.cleanFileReference)")) {
    throw new Error("e2e_environment_preflight_external_evidence_bridge_changed");
  }
  if (!workerMain.includes("createDefaultProductionWorkerResources")
    || !e2eCompose.includes('AI_CRM_E2E_WORKER_REAL_INFRA: "true"')
    || !e2eCompose.includes('AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED: "true"')
    || !composeRunner.includes("platform_task_center.task_projections")
    || !composeRunner.includes("platform_eventing.inbox_receipts")) {
    throw new Error("e2e_environment_preflight_real_worker_evidence_changed");
  }
  let evidenceMetadata;
  try { evidenceMetadata = JSON.parse(evidenceMetadataText); }
  catch { throw new Error("e2e_environment_preflight_durable_evidence_changed"); }
  if (evidenceMetadata?.moduleOwner !== "tests/e2e"
    || evidenceMetadata?.destructive !== false
    || typeof evidenceMetadata?.recovery !== "string") {
    throw new Error("e2e_environment_preflight_durable_evidence_changed");
  }
}

export async function runEnvironmentPreflight(options = {}) {
  const root = options.root ?? repositoryRoot;
  const execute = options.command ?? command;
  const nodeMajor = Number((options.nodeVersion ?? process.versions.node).split(".")[0]);
  if (nodeMajor !== 24) throw new Error("e2e_environment_preflight_node_version_invalid");
  await assertRepositoryEvidence(root, options.readText);
  execute("docker", ["version", "--format", "{{.Server.Version}}"]);
  execute("docker", ["compose", "version", "--short"]);
  const serviceOutput = execute("docker", [
    "compose", "-p", "ai-crm-test-e2e-preflight",
    "-f", "deploy/compose/compose.base.yml",
    "-f", "deploy/compose/compose.test.yml",
    "-f", "deploy/compose/compose.e2e.yml",
    "config", "--services",
  ], {
    env: {
      ...process.env,
      AI_CRM_COMPOSE_SECRET_DIR: resolve(root, "tests/e2e/__preflight-secrets-not-created__"),
      AI_CRM_RABBITMQ_FIXTURE_DIR: resolve(root, "tests/e2e/__preflight-rabbit-fixture-not-created__"),
      AI_CRM_TEST_POSTGRES_PORT: "25432",
    },
  });
  return Object.freeze({
    contractBlockers: Object.freeze([]),
    evidenceMode: "reviewed-contract-and-composition-anchor-checks",
    implementationGaps,
    composeScope: "full-process-skeleton",
    externalEvidenceBridge: "verified-by-browser-api-combined-execution",
    mainWalkingSkeletonReady: false,
    nodeMajor,
    rabbitJobChain: "real-rabbitmq-with-postgresql-stores",
    services: Object.freeze(validateServices(serviceOutput)),
    status: "environment-preflight-passed",
    taskProjectionWorkerChain: "verified-by-current-compose-execution",
    workflowChain: "real-flowable-rabbit-postgresql-combined-slice",
  });
}

async function main() {
  try {
    const result = await runEnvironmentPreflight();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof Error && /^e2e_environment_preflight_[a-z_]+$/u.test(error.message)
      ? error.message
      : "e2e_environment_preflight_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export { expectedServices, implementationGaps, validateServices };
