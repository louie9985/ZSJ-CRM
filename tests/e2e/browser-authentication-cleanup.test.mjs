import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runnerPath = new URL("../../scripts/check/run-e2e-browser-authentication.mjs", import.meta.url);

test("browser authentication runner owns allocations and cleanup in one lifecycle", async () => {
  const source = await readFile(runnerPath, "utf8");
  const mainTry = source.indexOf("try {\n  [edgePort, keycloakPort, redisPort, bffPort] = await availablePorts(4);");
  const secretAllocation = source.indexOf("secretDirectory = await mkdtemp", mainTry);
  const finallyBlock = source.indexOf("} finally {", mainTry);
  const guardedDirectories = source.indexOf(
    "[secretDirectory, chromeProfile, harnessBuildDirectory].filter(Boolean)",
    finallyBlock,
  );

  assert.notEqual(mainTry, -1, "resource allocation must begin inside the outer try");
  assert.ok(secretAllocation > mainTry, "temporary directories must be allocated inside the outer try");
  assert.ok(finallyBlock > secretAllocation, "the outer lifecycle must have a finally block");
  assert.ok(guardedDirectories > finallyBlock, "cleanup must ignore directories that were not allocated");
});

test("browser launch failure always terminates the spawned process", async () => {
  const source = await readFile(runnerPath, "utf8");
  const launchStart = source.indexOf("async function launchBrowser(initialUrl)");
  const launchEnd = source.indexOf("async function browserLogin", launchStart);
  const launchSource = source.slice(launchStart, launchEnd);

  assert.match(
    launchSource,
    /catch \(error\) \{\s*try \{ socket\?\.close\(\); \} finally \{ await terminateProcess\(processHandle\); \}/u,
  );
});
