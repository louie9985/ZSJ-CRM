import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertCombinedEvidence, executeCombinedEvidence, parseFinalJsonObject } from "./e2e-combined-evidence.mjs";

const browserEvidence = Object.freeze({ accountId: "10000000-0000-4000-8000-000000000001", status: "e2e-browser-authentication-passed", surfaces: ["pc", "internal-h5"] });
const fileEvidence = Object.freeze({ cleanFileReference: { fileId: "file.synthetic", version: 1 } });
const mainEvidence = Object.freeze({ status: "e2e-main-chain-durable-evidence-passed" });

describe("combined foundation evidence runner", () => {
  it("parses the final matching JSON object without treating logs as evidence", () => {
    assert.deepEqual(parseFinalJsonObject(`log\n${JSON.stringify(browserEvidence)}\n`, (value) => value.status === browserEvidence.status, "browser"), browserEvidence);
    assert.throws(() => parseFinalJsonObject("logs only", () => true, "missing"), /e2e_combined_missing_evidence_missing/u);
  });

  it("requires both local authentication surfaces", () => {
    assert.equal(assertCombinedEvidence(browserEvidence, fileEvidence, mainEvidence).status, "e2e-independent-foundation-evidence-passed");
    assert.throws(() => assertCombinedEvidence({ ...browserEvidence, surfaces: ["pc"] }, fileEvidence, mainEvidence));
  });

  it("runs file, authentication and durable main-chain evidence in order", async () => {
    const calls = [];
    const outputs = [fileEvidence, browserEvidence, mainEvidence];
    const result = await executeCombinedEvidence(async (name, script, environment) => { calls.push({ environment, name, script }); return JSON.stringify(outputs[calls.length - 1]); });
    assert.deepEqual(calls.map(({ name }) => name), ["file-clamav", "browser-auth", "main-chain"]);
    assert.deepEqual(calls.map(({ script }) => script), [
      "scripts/check/run-e2e-file-clamav-integration.mjs",
      "scripts/check/run-e2e-browser-authentication.mjs",
      "scripts/check/run-e2e-main-chain-integration.mjs",
    ]);
    assert.ok(calls.every(({ environment }) => Object.keys(environment).length === 0));
    assert.equal(result.mainWalkingSkeletonReady, true);
  });
});
