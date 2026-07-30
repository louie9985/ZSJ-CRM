import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const expectedServices = Object.freeze(["clamav", "flowable", "keycloak", "nginx", "postgres", "rabbitmq", "redis"]);
const requiredFiles = Object.freeze([
  "apps/api/src/main.ts",
  "apps/worker/src/main.ts",
  "deploy/compose/compose.base.yml",
  "deploy/compose/compose.test.yml",
  "deploy/flowable/bpmn/synthetic-human-task.v1.bpmn20.xml",
  "deploy/keycloak/realm-dev.json",
]);

const blockers = Object.freeze([
  Object.freeze({
    acceptanceId: "07-09",
    evidence: Object.freeze(["contracts/jobs/README.md", "apps/worker/src/handler-registry.ts"]),
    reason: "No reviewed concrete Worker Job contract and authoritative-state Owner exist.",
  }),
  Object.freeze({
    acceptanceId: "08-05",
    evidence: Object.freeze(["contracts/events/workflow-task-lifecycle.v1.schema.json", "apps/api/README.md"]),
    reason: "Workflow completion has no reviewed owning-source command with which to prove duplicate side-effect safety.",
  }),
  Object.freeze({
    acceptanceId: "08-07",
    evidence: Object.freeze(["apps/api/README.md", "apps/api/src/composition-factory.ts"]),
    reason: "Workflow is intentionally uncomposed and no reviewed source command boundary exists.",
  }),
  Object.freeze({
    acceptanceId: "09-05",
    evidence: Object.freeze(["apps/api/src/composition-factory.ts"]),
    reason: "Task completion routing fails closed because the source router is unavailable.",
  }),
  Object.freeze({
    acceptanceId: "10-07",
    evidence: Object.freeze(["contracts/asyncapi/topology.asyncapi.yaml", "apps/worker/src/handler-registry.ts"]),
    reason: "No reviewed Notification consumer topology or production-composed and activated Handler is declared.",
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
  const [apiReadme, apiComposition, asyncApi, jobsReadme, workerRegistry] = await Promise.all([
    readFile(resolve(root, "apps/api/README.md"), "utf8"),
    readFile(resolve(root, "apps/api/src/composition-factory.ts"), "utf8"),
    readFile(resolve(root, "contracts/asyncapi/topology.asyncapi.yaml"), "utf8"),
    readFile(resolve(root, "contracts/jobs/README.md"), "utf8"),
    readFile(resolve(root, "apps/worker/src/handler-registry.ts"), "utf8"),
  ]);
  if (!apiReadme.includes("Workflow remains uncomposed")) throw new Error("e2e_environment_preflight_workflow_boundary_changed");
  if (!apiComposition.includes("task_source_router_unavailable")) throw new Error("e2e_environment_preflight_task_boundary_changed");
  if (!asyncApi.includes("taskProjectionLifecycleQueue") || /notification/i.test(asyncApi)) {
    throw new Error("e2e_environment_preflight_async_contract_changed");
  }
  if (!jobsReadme.includes("authoritative source state") || !workerRegistry.includes("WorkerHandlerRegistry")) {
    throw new Error("e2e_environment_preflight_job_boundary_changed");
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
    "config", "--services",
  ], {
    env: {
      ...process.env,
      AI_CRM_COMPOSE_SECRET_DIR: resolve(root, "tests/e2e/__preflight-secrets-not-created__"),
    },
  });
  return Object.freeze({
    blockerEvidenceMode: "manual-snapshot-with-anchor-checks",
    blockers,
    composeScope: "dependencies-only",
    mainWalkingSkeletonReady: false,
    nodeMajor,
    services: Object.freeze(validateServices(serviceOutput)),
    status: "environment-preflight-passed",
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

export { blockers, expectedServices, validateServices };
