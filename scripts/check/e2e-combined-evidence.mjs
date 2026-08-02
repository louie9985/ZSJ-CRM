import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const browserStatus = "e2e-browser-authentication-passed";
const mainChainStatus = "e2e-main-chain-durable-evidence-passed";

export function parseFinalJsonObject(output, accepts, scenario) {
  const lines = output.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const value = JSON.parse(line);
      if (value !== null && typeof value === "object" && !Array.isArray(value) && accepts(value)) return value;
    } catch {
      // Build and container logs may contain non-JSON lines that start with braces.
    }
  }
  throw new Error(`e2e_combined_${scenario}_evidence_missing`);
}

export function externalEvidenceEnvironment(browserEvidence, fileEvidence, identityFixtureFile, keycloakDumpFile) {
  assert.equal(browserEvidence.status, browserStatus, "browser authentication evidence did not pass");
  assert.match(browserEvidence.browserTraceId, /^[0-9a-f]{32}$/u, "browser trace id is invalid");
  assert.match(
    browserEvidence.browserTraceparent,
    new RegExp(`^00-${browserEvidence.browserTraceId}-[0-9a-f]{16}-0[01]$`, "u"),
    "browser traceparent is invalid or does not match its trace id",
  );
  assert.ok(fileEvidence.cleanFileReference && typeof fileEvidence.cleanFileReference === "object", "clean FileReference is missing");
  assert.equal(browserEvidence.applicationRegistryLoaded, true, "Workbench Application Registry was not loaded");
  assert.equal(browserEvidence.deepLinkResolved, true, "Workbench deep link was not resolved");
  assert.equal(browserEvidence.deepLinkNavigated, true, "Workbench deep link was not navigated");
  assert.equal(typeof identityFixtureFile, "string", "browser identity fixture file is missing");
  assert.equal(typeof keycloakDumpFile, "string", "Keycloak dump file is missing");
  assert.match(browserEvidence.syntheticSubjectId, /^[0-9a-f-]{36}$/u, "synthetic browser subject is invalid");
  assert.match(browserEvidence.syntheticIssuer, /^http:\/\/localhost:\d+\/realms\/ai-crm-dev$/u, "synthetic browser issuer is invalid");

  return Object.freeze({
    AI_CRM_E2E_BROWSER_TRACE_ID: browserEvidence.browserTraceId,
    AI_CRM_E2E_BROWSER_TRACEPARENT: browserEvidence.browserTraceparent,
    AI_CRM_E2E_FILE_REFERENCE_JSON: JSON.stringify(fileEvidence.cleanFileReference),
    AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE: "true",
    AI_CRM_E2E_BROWSER_OBSERVATION: "true",
    AI_CRM_E2E_SYNTHETIC_ISSUER: browserEvidence.syntheticIssuer,
    AI_CRM_E2E_SYNTHETIC_USER_ID: browserEvidence.syntheticSubjectId,
    AI_CRM_E2E_IDENTITY_FIXTURE_FILE: identityFixtureFile,
    AI_CRM_E2E_KEYCLOAK_DUMP_FILE: keycloakDumpFile,
  });
}

export function assertCombinedEvidence(browserEvidence, fileEvidence, mainChainEvidence) {
  assert.equal(mainChainEvidence.status, mainChainStatus);
  assert.equal(mainChainEvidence.externalEvidence, true);
  assert.equal(mainChainEvidence.browserTaskApiEvidence, true);
  assert.equal(mainChainEvidence.auditCorrelationVerified, true);
  assert.equal(mainChainEvidence.traceId, browserEvidence.browserTraceId);
  assert.equal(mainChainEvidence.traceparent, browserEvidence.browserTraceparent);
  assert.deepEqual(mainChainEvidence.fileReference, fileEvidence.cleanFileReference);
  assert.equal(browserEvidence.formRendered, true);
  assert.equal(browserEvidence.formServerValidated, true);
  assert.equal(browserEvidence.formFileReferenceMatched, true);
  assert.equal(browserEvidence.taskAuthorizationDenied, true);
  assert.equal(browserEvidence.taskCompletionAccepted, true);
  assert.equal(browserEvidence.taskCompletionReplayed, true);
  assert.equal(mainChainEvidence.formSubmissionReference?.startsWith("submission."), true);
  return Object.freeze({
    applicationRegistryLoaded: true,
    auditCorrelationVerified: true,
    browserTraceId: browserEvidence.browserTraceId,
    deepLinkNavigated: true,
    deepLinkResolved: true,
    externalEvidence: true,
    fileReference: fileEvidence.cleanFileReference,
    formFileReferenceMatched: true,
    formRendered: true,
    formServerValidated: true,
    mainWalkingSkeletonReady: true,
    status: "e2e-browser-to-worker-causal-evidence-passed",
    traceparent: browserEvidence.browserTraceparent,
  });
}

export function assertBrowserDurableObservation(observationEvidence, mainChainEvidence) {
  assert.equal(observationEvidence.status, "e2e-browser-durable-observation-passed");
  assert.equal(observationEvidence.durableTaskObserved, true);
  assert.equal(observationEvidence.durableNotificationObserved, true);
  assert.equal(mainChainEvidence.taskProjection?.sourceTaskId, "source-task.main-chain-synthetic");
  assert.equal(mainChainEvidence.notificationProjection?.sourceId, "source-task.main-chain-synthetic");
}

export async function executeCombinedEvidence(runScenario, identityFixtureFile, keycloakDumpFile) {
  const fileOutput = await runScenario("file-clamav", "scripts/check/run-e2e-file-clamav-integration.mjs", {});
  const fileEvidence = parseFinalJsonObject(fileOutput, (value) => value.cleanFileReference !== undefined, "file_clamav");

  const browserOutput = await runScenario("browser-auth", "scripts/check/run-e2e-browser-authentication.mjs", {
    AI_CRM_E2E_IDENTITY_FIXTURE_OUTPUT: identityFixtureFile,
    AI_CRM_E2E_KEYCLOAK_DUMP_OUTPUT: keycloakDumpFile,
  });
  const browserEvidence = parseFinalJsonObject(browserOutput, (value) => value.status === browserStatus, "browser_auth");

  const evidenceEnvironment = externalEvidenceEnvironment(browserEvidence, fileEvidence, identityFixtureFile, keycloakDumpFile);
  const mainOutput = await runScenario("main-chain", "scripts/check/run-e2e-main-chain-integration.mjs", evidenceEnvironment);
  const mainChainEvidence = parseFinalJsonObject(mainOutput, (value) => value.status === mainChainStatus, "main_chain");
  const causalBrowserEvidence = parseFinalJsonObject(mainOutput, (value) => value.status === browserStatus, "causal_browser");
  const observationEvidence = parseFinalJsonObject(mainOutput, (value) => value.status === "e2e-browser-durable-observation-passed", "browser_observation");
  assertBrowserDurableObservation(observationEvidence, mainChainEvidence);
  return Object.freeze({ ...assertCombinedEvidence(causalBrowserEvidence, fileEvidence, mainChainEvidence), durableNotificationObserved: true, durableTaskObserved: true });
}

export async function runNodeScenario(name, script, extraEnvironment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...extraEnvironment },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`e2e_combined_${name.replaceAll("-", "_")}_failed:${signal ?? String(code)}`));
    });
  });
}
