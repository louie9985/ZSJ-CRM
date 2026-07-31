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

export function externalEvidenceEnvironment(browserEvidence, fileEvidence) {
  assert.equal(browserEvidence.status, browserStatus, "browser authentication evidence did not pass");
  assert.match(browserEvidence.browserTraceId, /^[0-9a-f]{32}$/u, "browser trace id is invalid");
  assert.match(
    browserEvidence.browserTraceparent,
    new RegExp(`^00-${browserEvidence.browserTraceId}-[0-9a-f]{16}-0[01]$`, "u"),
    "browser traceparent is invalid or does not match its trace id",
  );
  assert.ok(fileEvidence.cleanFileReference && typeof fileEvidence.cleanFileReference === "object", "clean FileReference is missing");

  return Object.freeze({
    AI_CRM_E2E_BROWSER_TRACE_ID: browserEvidence.browserTraceId,
    AI_CRM_E2E_BROWSER_TRACEPARENT: browserEvidence.browserTraceparent,
    AI_CRM_E2E_FILE_REFERENCE_JSON: JSON.stringify(fileEvidence.cleanFileReference),
    AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE: "true",
  });
}

export function assertCombinedEvidence(browserEvidence, fileEvidence, mainChainEvidence) {
  assert.equal(mainChainEvidence.status, mainChainStatus);
  assert.equal(mainChainEvidence.externalEvidence, true);
  assert.equal(mainChainEvidence.traceId, browserEvidence.browserTraceId);
  assert.equal(mainChainEvidence.traceparent, browserEvidence.browserTraceparent);
  assert.deepEqual(mainChainEvidence.fileReference, fileEvidence.cleanFileReference);
  return Object.freeze({
    browserTraceId: browserEvidence.browserTraceId,
    externalEvidence: true,
    fileReference: fileEvidence.cleanFileReference,
    mainWalkingSkeletonReady: false,
    status: "e2e-combined-external-evidence-passed",
    traceparent: browserEvidence.browserTraceparent,
  });
}

export async function executeCombinedEvidence(runScenario) {
  const browserOutput = await runScenario("browser-auth", "scripts/check/run-e2e-browser-authentication.mjs", {});
  const browserEvidence = parseFinalJsonObject(browserOutput, (value) => value.status === browserStatus, "browser_auth");

  const fileOutput = await runScenario("file-clamav", "scripts/check/run-e2e-file-clamav-integration.mjs", {});
  const fileEvidence = parseFinalJsonObject(fileOutput, (value) => value.cleanFileReference !== undefined, "file_clamav");

  const evidenceEnvironment = externalEvidenceEnvironment(browserEvidence, fileEvidence);
  const mainOutput = await runScenario("main-chain", "scripts/check/run-e2e-main-chain-integration.mjs", evidenceEnvironment);
  const mainChainEvidence = parseFinalJsonObject(mainOutput, (value) => value.status === mainChainStatus, "main_chain");
  return assertCombinedEvidence(browserEvidence, fileEvidence, mainChainEvidence);
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
