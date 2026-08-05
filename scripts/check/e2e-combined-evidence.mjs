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
    } catch { /* surrounding build logs are not evidence */ }
  }
  throw new Error(`e2e_combined_${scenario}_evidence_missing`);
}

export function assertCombinedEvidence(browserEvidence, fileEvidence, mainChainEvidence) {
  assert.equal(browserEvidence.status, browserStatus);
  assert.deepEqual(browserEvidence.surfaces, ["pc", "internal-h5"]);
  assert.match(browserEvidence.accountId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.ok(fileEvidence.cleanFileReference && typeof fileEvidence.cleanFileReference === "object");
  assert.equal(mainChainEvidence.status, mainChainStatus);
  return Object.freeze({
    accountId: browserEvidence.accountId,
    authenticationSurfaces: Object.freeze([...browserEvidence.surfaces]),
    fileReference: fileEvidence.cleanFileReference,
    mainWalkingSkeletonReady: true,
    status: "e2e-independent-foundation-evidence-passed",
  });
}

export async function executeCombinedEvidence(runScenario) {
  const fileOutput = await runScenario("file-clamav", "scripts/check/run-e2e-file-clamav-integration.mjs", {});
  const fileEvidence = parseFinalJsonObject(fileOutput, (value) => value.cleanFileReference !== undefined, "file_clamav");
  const browserOutput = await runScenario("browser-auth", "scripts/check/run-e2e-browser-authentication.mjs", {});
  const browserEvidence = parseFinalJsonObject(browserOutput, (value) => value.status === browserStatus, "browser_auth");
  const mainOutput = await runScenario("main-chain", "scripts/check/run-e2e-main-chain-integration.mjs", {});
  const mainChainEvidence = parseFinalJsonObject(mainOutput, (value) => value.status === mainChainStatus, "main_chain");
  return assertCombinedEvidence(browserEvidence, fileEvidence, mainChainEvidence);
}

export async function runNodeScenario(name, script, extraEnvironment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...extraEnvironment }, shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code, signal) => { if (code === 0) resolve(stdout); else reject(new Error(`e2e_combined_${name.replaceAll("-", "_")}_failed:${signal ?? String(code)}`)); });
  });
}
