import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { expectedServices, implementationGaps, runEnvironmentPreflight, validateServices } from "./environment-preflight.mjs";

test("reports the full process skeleton without claiming the main walking skeleton", async () => {
  const calls = [];
  const result = await runEnvironmentPreflight({
    command(executable, args) {
      calls.push([executable, ...args]);
      return args.at(-1) === "--services" ? [...expectedServices].reverse().join("\n") : "synthetic-version";
    },
    nodeVersion: "24.15.0",
  });
  assert.equal(result.status, "environment-preflight-passed");
  assert.equal(result.composeScope, "full-process-skeleton");
  assert.equal(result.externalEvidenceBridge, "verified-by-combined-execution");
  assert.equal(result.evidenceMode, "reviewed-contract-and-composition-anchor-checks");
  assert.deepEqual(result.contractBlockers, []);
  assert.equal(result.mainWalkingSkeletonReady, false);
  assert.equal(result.rabbitJobChain, "real-rabbitmq-with-postgresql-stores");
  assert.equal(result.taskProjectionWorkerChain, "verified-by-current-compose-execution");
  assert.equal(result.workflowChain, "real-flowable-rabbit-postgresql-combined-slice");
  assert.deepEqual(result.services, expectedServices);
  assert.deepEqual(result.implementationGaps.map((item) => item.acceptanceId), ["17-16"]);
  assert.equal(calls.length, 3);
});

test("fails closed for runtime or Compose topology drift", async () => {
  await assert.rejects(runEnvironmentPreflight({ command: () => "", nodeVersion: "22.0.0" }), /node_version_invalid/u);
  assert.throws(() => validateServices("postgres\nredis\napi"), /service_mismatch/u);
  assert.equal(implementationGaps.length, 1);
});

test("fails closed when closed-gap implementation evidence drifts", async () => {
  await assert.rejects(runEnvironmentPreflight({
    command: () => "synthetic-version",
    nodeVersion: "24.15.0",
    readText(path) {
      return /tests[\\/]e2e[\\/]src[\\/]api-main\.test\.ts$/u.test(path)
        ? Promise.resolve("")
        : readFile(path, "utf8");
    },
  }), /task_api_evidence_changed/u);
});

test("fails closed when the external evidence bridge drifts", async () => {
  await assert.rejects(runEnvironmentPreflight({
    command: () => "synthetic-version",
    nodeVersion: "24.15.0",
    readText(path) {
      return /tests[\\/]e2e[\\/]src[\\/]file-clamav-integration\.mjs$/u.test(path)
        ? Promise.resolve("")
        : readFile(path, "utf8");
    },
  }), /external_evidence_bridge_changed/u);
});

test("fails closed when the real isolated Worker evidence drifts", async () => {
  await assert.rejects(runEnvironmentPreflight({
    command: () => "synthetic-version",
    nodeVersion: "24.15.0",
    readText(path) {
      return /tests[\\/]e2e[\\/]src[\\/]worker-main\.ts$/u.test(path)
        ? Promise.resolve("")
        : readFile(path, "utf8");
    },
  }), /real_worker_evidence_changed/u);
});
