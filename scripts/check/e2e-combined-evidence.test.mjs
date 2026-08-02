import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertCombinedEvidence,
  assertBrowserDurableObservation,
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
  applicationRegistryLoaded: true,
  browserTraceId: traceId,
  browserTraceparent: traceparent,
  deepLinkNavigated: true,
  deepLinkResolved: true,
  formFileReferenceMatched: true,
  formRendered: true,
  formServerValidated: true,
  status: "e2e-browser-authentication-passed",
  syntheticIssuer: "http://localhost:24567/realms/ai-crm-dev",
  syntheticSubjectId: "91000000-0000-4000-8000-000000000001",
  taskAuthorizationDenied: true,
  taskCompletionAccepted: true,
  taskCompletionReplayed: true,
});
const fileEvidence = Object.freeze({ cleanFileReference: fileReference });
const identityFixtureFile = "D:\\e2e\\browser-identity.json";
const keycloakDumpFile = "D:\\e2e\\keycloak.dump";

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
    assert.deepEqual(externalEvidenceEnvironment(browserEvidence, fileEvidence, identityFixtureFile, keycloakDumpFile), {
      AI_CRM_E2E_BROWSER_OBSERVATION: "true",
      AI_CRM_E2E_BROWSER_TRACE_ID: traceId,
      AI_CRM_E2E_BROWSER_TRACEPARENT: traceparent,
      AI_CRM_E2E_FILE_REFERENCE_JSON: JSON.stringify(fileReference),
      AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE: "true",
      AI_CRM_E2E_IDENTITY_FIXTURE_FILE: identityFixtureFile,
      AI_CRM_E2E_KEYCLOAK_DUMP_FILE: keycloakDumpFile,
      AI_CRM_E2E_SYNTHETIC_ISSUER: browserEvidence.syntheticIssuer,
      AI_CRM_E2E_SYNTHETIC_USER_ID: browserEvidence.syntheticSubjectId,
    });
    assert.throws(
      () => externalEvidenceEnvironment({ ...browserEvidence, browserTraceparent: `00-${"a".repeat(32)}-00f067aa0ba902b7-01` }, fileEvidence, identityFixtureFile, keycloakDumpFile),
      /traceparent is invalid/u,
    );
    assert.throws(
      () => externalEvidenceEnvironment({ ...browserEvidence, deepLinkNavigated: false }, fileEvidence, identityFixtureFile, keycloakDumpFile),
      /deep link was not navigated/u,
    );
  });

  it("runs browser, file, and durable main chain in order and injects exact evidence", async () => {
    const calls = [];
    const mainEvidence = {
      auditCorrelationVerified: true,
      browserTaskApiEvidence: true,
      externalEvidence: true,
      fileReference,
      formSubmissionReference: "submission.93000000-0000-4000-8000-000000000099",
      status: "e2e-main-chain-durable-evidence-passed",
      traceId,
      traceparent,
      taskProjection: { sourceTaskId: "source-task.main-chain-synthetic", sourceType: "tests.walking-skeleton", status: "completed" },
      notificationProjection: { notificationId: "notification.synthetic", sourceId: "source-task.main-chain-synthetic", sourceType: "tests.walking-skeleton" },
    };
    const observationEvidence = { durableNotificationObserved: true, durableTaskObserved: true, status: "e2e-browser-durable-observation-passed" };
    const outputs = [fileEvidence, browserEvidence, mainEvidence];
    const result = await executeCombinedEvidence(async (name, script, environment) => {
      calls.push({ environment, name, script });
      const output = outputs[calls.length - 1];
      return `step log\n${JSON.stringify(output)}\n${name === "main-chain" ? `${JSON.stringify(browserEvidence)}\n${JSON.stringify(observationEvidence)}\n` : ""}`;
    }, identityFixtureFile, keycloakDumpFile);
    assert.deepEqual(calls.map((call) => call.name), ["file-clamav", "browser-auth", "main-chain"]);
    assert.deepEqual(calls[0].environment, {});
    assert.deepEqual(calls[1].environment, {
      AI_CRM_E2E_IDENTITY_FIXTURE_OUTPUT: identityFixtureFile,
      AI_CRM_E2E_KEYCLOAK_DUMP_OUTPUT: keycloakDumpFile,
    });
    assert.deepEqual(calls[2].environment, externalEvidenceEnvironment(browserEvidence, fileEvidence, identityFixtureFile, keycloakDumpFile));
    assert.equal(result.status, "e2e-browser-to-worker-causal-evidence-passed");
    assert.equal(result.mainWalkingSkeletonReady, true);
    assert.equal(result.durableTaskObserved, true);
    assert.equal(result.durableNotificationObserved, true);
  });

  it("fails closed when the browser does not observe both durable projections", () => {
    assert.throws(() => assertBrowserDurableObservation({ status: "e2e-browser-durable-observation-passed", durableTaskObserved: true, durableNotificationObserved: false }, {
      taskProjection: { sourceTaskId: "source-task.main-chain-synthetic" }, notificationProjection: { sourceId: "source-task.main-chain-synthetic" },
    }));
  });

  it("fails closed when the durable chain changes either linked evidence value", () => {
    assert.throws(
      () => assertCombinedEvidence(browserEvidence, fileEvidence, {
        auditCorrelationVerified: true,
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
        auditCorrelationVerified: true,
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
