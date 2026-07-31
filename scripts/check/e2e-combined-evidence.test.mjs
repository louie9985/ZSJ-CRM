import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertCombinedEvidence,
  executeCombinedEvidence,
  externalEvidenceEnvironment,
  parseFinalJsonObject,
} from "./e2e-combined-evidence.mjs";

const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const traceparent = `00-${traceId}-00f067aa0ba902b7-01`;
const fileReference = Object.freeze({
  contentVersionId: "93000000-0000-4000-8000-000000000002",
  displayName: "clamav-clean.txt",
  fileId: "93000000-0000-4000-8000-000000000001",
  mediaType: "text/plain",
  sizeBytes: 24,
  version: 1,
});
const browserEvidence = Object.freeze({
  browserTraceId: traceId,
  browserTraceparent: traceparent,
  status: "e2e-browser-authentication-passed",
  taskCompletionAccepted: true,
});
const fileEvidence = Object.freeze({ cleanFileReference: fileReference });
const taskCommandFile = "D:\\e2e\\browser-task-command.json";

describe("combined external-evidence E2E runner", () => {
  it("parses the final matching JSON object without treating surrounding logs as evidence", () => {
    const output = [
      "docker build {not-json}",
      JSON.stringify({ status: "unrelated" }),
      "container | {still-not-json}",
      JSON.stringify(browserEvidence),
      "cleanup completed",
    ].join("\n");
    assert.deepEqual(parseFinalJsonObject(output, (value) => value.status === browserEvidence.status, "browser_auth"), browserEvidence);
    assert.throws(() => parseFinalJsonObject("logs only", () => true, "missing"), /e2e_combined_missing_evidence_missing/u);
  });

  it("builds a strict external-evidence environment", () => {
    assert.deepEqual(externalEvidenceEnvironment(browserEvidence, fileEvidence, taskCommandFile), {
      AI_CRM_E2E_BROWSER_TRACE_ID: traceId,
      AI_CRM_E2E_BROWSER_TRACEPARENT: traceparent,
      AI_CRM_E2E_FILE_REFERENCE_JSON: JSON.stringify(fileReference),
      AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE: "true",
      AI_CRM_E2E_TASK_COMMAND_FILE: taskCommandFile,
    });
    assert.throws(
      () => externalEvidenceEnvironment({ ...browserEvidence, browserTraceparent: `00-${"a".repeat(32)}-00f067aa0ba902b7-01` }, fileEvidence, taskCommandFile),
      /traceparent is invalid/u,
    );
  });

  it("runs browser, file, and durable main chain in order and injects exact evidence", async () => {
    const calls = [];
    const mainEvidence = {
      browserTaskApiEvidence: true,
      externalEvidence: true,
      fileReference,
      status: "e2e-main-chain-durable-evidence-passed",
      traceId,
      traceparent,
    };
    const outputs = [browserEvidence, fileEvidence, mainEvidence];
    const result = await executeCombinedEvidence(async (name, script, environment) => {
      calls.push({ environment, name, script });
      return `step log\n${JSON.stringify(outputs[calls.length - 1])}\n`;
    }, taskCommandFile);
    assert.deepEqual(calls.map((call) => call.name), ["browser-auth", "file-clamav", "main-chain"]);
    assert.deepEqual(calls[0].environment, { AI_CRM_E2E_TASK_COMMAND_FILE: taskCommandFile });
    assert.deepEqual(calls[1].environment, {});
    assert.deepEqual(calls[2].environment, externalEvidenceEnvironment(browserEvidence, fileEvidence, taskCommandFile));
    assert.equal(result.status, "e2e-browser-to-worker-causal-evidence-passed");
    assert.equal(result.mainWalkingSkeletonReady, true);
  });

  it("fails closed when the durable chain changes either linked evidence value", () => {
    assert.throws(
      () => assertCombinedEvidence(browserEvidence, fileEvidence, {
        browserTaskApiEvidence: true,
        externalEvidence: true,
        fileReference: { ...fileReference, version: 2 },
        status: "e2e-main-chain-durable-evidence-passed",
        traceId,
        traceparent,
      }),
      /Expected values to be strictly deep-equal/u,
    );
    assert.throws(
      () => assertCombinedEvidence(browserEvidence, fileEvidence, {
        browserTaskApiEvidence: true,
        externalEvidence: true,
        fileReference,
        status: "e2e-main-chain-durable-evidence-passed",
        traceId: "a".repeat(32),
        traceparent,
      }),
      /Expected values to be strictly equal/u,
    );
  });
});
