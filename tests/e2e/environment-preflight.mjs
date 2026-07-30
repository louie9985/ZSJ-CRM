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
  "deploy/flowable/bpmn/synthetic-human-task.v1.bpmn20.xml",
  "deploy/keycloak/realm-dev.json",
  "scripts/check/run-e2e-rabbit-jobs-integration.mjs",
  "scripts/check/run-e2e-flowable-workflow-integration.mjs",
  "scripts/check/run-e2e-main-chain-integration.mjs",
  "scripts/check/run-e2e-file-clamav-integration.mjs",
  "tests/e2e/migrations/0000000016_e2e_walking_skeleton_durable_stores.sql",
  "tests/e2e/migrations/0000000016_e2e_walking_skeleton_durable_stores.meta.json",
  "tests/e2e/src/apply-e2e-migration.ts",
  "tests/e2e/src/durable-main-chain.ts",
  "tests/e2e/src/file-clamav-integration.mjs",
  "tests/e2e/src/main-chain.ts",
  "tests/e2e/src/postgres-walking-skeleton-source.ts",
  "tests/e2e/src/postgres-workflow-ledger.ts",
  "tests/e2e/src/flowable-workflow-integration.ts",
  "tests/e2e/src/rabbit-job-integration.ts",
  "tests/e2e/src/walking-skeleton-rabbit.ts",
]);

const implementationGaps = Object.freeze([
  Object.freeze({
    acceptanceId: "09-05",
    evidence: Object.freeze(["tests/e2e/src/walking-skeleton-source.ts", "apps/api/src/composition-factory.ts"]),
    reason: "The durable tests-only source route is proven through RabbitMQ, but the full E2E API process still exposes no authenticated Task completion endpoint.",
  }),
  Object.freeze({
    acceptanceId: "17-01",
    evidence: Object.freeze(["apps/api/src/auth/keycloak.integration.test.ts", "deploy/compose/compose.e2e.yml"]),
    reason: "Keycloak/BFF integration and the ten-service process shell pass separately; no browser signs in through the composed E2E edge and session path.",
  }),
  Object.freeze({
    acceptanceId: "17-06",
    evidence: Object.freeze(["apps/worker/src/task-projection-composition.ts", "deploy/compose/compose.e2e.yml"]),
    reason: "Task projection behavior is tested independently, but its reviewed consumer is not installed in the full isolated E2E Worker process.",
  }),
  Object.freeze({
    acceptanceId: "17-09",
    evidence: Object.freeze(["tests/e2e/src/file-clamav-integration.mjs", "tests/e2e/src/main-chain.ts"]),
    reason: "File Center and real ClamAV pass as an isolated chain, but form submission, FileReference, and task completion do not yet carry that evidence through the durable main slice.",
  }),
  Object.freeze({
    acceptanceId: "17-16",
    evidence: Object.freeze(["tests/e2e/src/durable-main-chain.ts", "packages/observability/src/context.test.ts"]),
    reason: "The durable slice records bounded authorization and lifecycle evidence, but browser-to-BFF-to-API-to-Outbox-to-Worker Trace propagation and durable Audit correlation are not composed.",
  }),
]);

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

async function assertRepositoryEvidence(root) {
  await Promise.all(requiredFiles.map((path) => readFile(resolve(root, path), "utf8")));
  const [apiReadme, apiComposition, asyncApi, walkingSkeletonAsyncApi, jobsReadme, sourceJob, notificationJob, workerRegistry, rabbitRunner, rabbitDriver, flowableRunner, flowableDriver] = await Promise.all([
    readFile(resolve(root, "apps/api/README.md"), "utf8"),
    readFile(resolve(root, "apps/api/src/composition-factory.ts"), "utf8"),
    readFile(resolve(root, "contracts/asyncapi/topology.asyncapi.yaml"), "utf8"),
    readFile(resolve(root, "contracts/asyncapi/walking-skeleton.asyncapi.yaml"), "utf8"),
    readFile(resolve(root, "contracts/jobs/README.md"), "utf8"),
    readFile(resolve(root, "contracts/jobs/walking-skeleton-source-command.v1.schema.json"), "utf8"),
    readFile(resolve(root, "contracts/jobs/notification-intent-submit.v1.schema.json"), "utf8"),
    readFile(resolve(root, "apps/worker/src/handler-registry.ts"), "utf8"),
    readFile(resolve(root, "scripts/check/run-e2e-rabbit-jobs-integration.mjs"), "utf8"),
    readFile(resolve(root, "tests/e2e/src/rabbit-job-integration.ts"), "utf8"),
    readFile(resolve(root, "scripts/check/run-e2e-flowable-workflow-integration.mjs"), "utf8"),
    readFile(resolve(root, "tests/e2e/src/flowable-workflow-integration.ts"), "utf8"),
  ]);
  if (!apiReadme.includes("Workflow remains uncomposed")) throw new Error("e2e_environment_preflight_workflow_boundary_changed");
  if (!apiComposition.includes("task_source_router_unavailable")) throw new Error("e2e_environment_preflight_task_boundary_changed");
  if (!asyncApi.includes("taskProjectionLifecycleQueue") || /notification/i.test(asyncApi)) {
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
}

export async function runEnvironmentPreflight(options = {}) {
  const root = options.root ?? repositoryRoot;
  const execute = options.command ?? command;
  const nodeMajor = Number((options.nodeVersion ?? process.versions.node).split(".")[0]);
  if (nodeMajor !== 24) throw new Error("e2e_environment_preflight_node_version_invalid");
  await assertRepositoryEvidence(root);
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
    },
  });
  return Object.freeze({
    contractBlockers: Object.freeze([]),
    evidenceMode: "reviewed-contract-and-composition-anchor-checks",
    implementationGaps,
    composeScope: "full-process-skeleton",
    mainWalkingSkeletonReady: false,
    nodeMajor,
    rabbitJobChain: "real-rabbitmq-with-postgresql-stores",
    services: Object.freeze(validateServices(serviceOutput)),
    status: "environment-preflight-passed",
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
