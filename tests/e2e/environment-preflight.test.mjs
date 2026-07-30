import assert from "node:assert/strict";
import test from "node:test";

import { blockers, expectedServices, runEnvironmentPreflight, validateServices } from "./environment-preflight.mjs";

test("reports the dependency-only environment without claiming the main walking skeleton", async () => {
  const calls = [];
  const result = await runEnvironmentPreflight({
    command(executable, args) {
      calls.push([executable, ...args]);
      return args.at(-1) === "--services" ? [...expectedServices].reverse().join("\n") : "synthetic-version";
    },
    nodeVersion: "24.15.0",
  });
  assert.equal(result.status, "environment-preflight-passed");
  assert.equal(result.composeScope, "dependencies-only");
  assert.equal(result.blockerEvidenceMode, "manual-snapshot-with-anchor-checks");
  assert.equal(result.mainWalkingSkeletonReady, false);
  assert.deepEqual(result.services, expectedServices);
  assert.deepEqual(result.blockers.map((item) => item.acceptanceId), ["07-09", "08-05", "08-07", "09-05", "10-07"]);
  assert.equal(calls.length, 3);
});

test("fails closed for runtime or Compose topology drift", async () => {
  await assert.rejects(runEnvironmentPreflight({ command: () => "", nodeVersion: "22.0.0" }), /node_version_invalid/u);
  assert.throws(() => validateServices("postgres\nredis\napi"), /service_mismatch/u);
  assert.equal(blockers.length, 5);
});
