import assert from "node:assert/strict";
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
  assert.equal(result.evidenceMode, "reviewed-contract-and-composition-anchor-checks");
  assert.deepEqual(result.contractBlockers, []);
  assert.equal(result.mainWalkingSkeletonReady, false);
  assert.equal(result.rabbitJobChain, "real-rabbitmq-with-postgresql-stores");
  assert.equal(result.workflowChain, "real-flowable-rabbit-postgresql-combined-slice");
  assert.deepEqual(result.services, expectedServices);
  assert.deepEqual(result.implementationGaps.map((item) => item.acceptanceId), ["09-05", "17-01", "17-09", "17-16"]);
  assert.equal(calls.length, 3);
});

test("fails closed for runtime or Compose topology drift", async () => {
  await assert.rejects(runEnvironmentPreflight({ command: () => "", nodeVersion: "22.0.0" }), /node_version_invalid/u);
  assert.throws(() => validateServices("postgres\nredis\napi"), /service_mismatch/u);
  assert.equal(implementationGaps.length, 4);
});
