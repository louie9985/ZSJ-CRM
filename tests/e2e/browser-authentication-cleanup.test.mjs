import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runnerPath = new URL("../../scripts/check/run-e2e-browser-authentication.mjs", import.meta.url);
const bffPath = new URL("./src/browser-authentication-bff.ts", import.meta.url);
const nginxPath = new URL("../../deploy/nginx/nginx.e2e-browser-auth.conf", import.meta.url);

test("browser authentication Nginx serves JavaScript modules with registered MIME types", async () => {
  const source = await readFile(nginxPath, "utf8");
  assert.match(source, /include \/etc\/nginx\/mime\.types;/u);
  assert.match(source, /default_type application\/octet-stream;/u);
});

test("browser authentication runner owns allocations and cleanup in one lifecycle", async () => {
  const source = await readFile(runnerPath, "utf8");
  const mainTry = source.indexOf("try {\n  [edgePort, keycloakPort, redisPort, bffPort, chromePort] = await availablePorts(5);");
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

test("browser form input settles before submit runs in a separate browser task", async () => {
  const source = await readFile(runnerPath, "utf8");
  const formInputStart = source.indexOf('browser.command("Input.insertText", { text: "synthetic-approved" })');
  const formInputEnd = source.indexOf(";", formInputStart);
  const formInputWait = source.indexOf("e2e_browser_form_input_not_updated", formInputEnd);
  const formSubmit = source.indexOf("document.querySelector('button[type=\"submit\"]').click()", formInputWait);

  assert.notEqual(formInputStart, -1, "the runner must populate the synthetic form input through the browser input domain");
  assert.ok(formInputEnd > formInputStart, "the input browser task must complete");
  assert.equal(
    source.slice(formInputStart, formInputEnd).includes("button[type=\"submit\"]"),
    false,
    "the input browser task must not submit before React flushes state",
  );
  assert.ok(formInputWait > formInputEnd, "the runner must observe the populated input before submitting");
  assert.ok(formSubmit > formInputWait, "submit must run in a later browser task");
});

test("browser evidence authorization wiring fails closed without debug response wrappers", async () => {
  const [runnerSource, bffSource] = await Promise.all([readFile(runnerPath, "utf8"), readFile(bffPath, "utf8")]);

  assert.match(bffSource, /authorizeBrowserTaskFixture\(taskFixtures, taskAuthorizationScenario, subject,/u);
  assert.doesNotMatch(bffSource, /taskPermission \? taskAuthorizationScenario : "allowed"/u);
  assert.match(bffSource, /permission: input\.permission/u);
  assert.match(bffSource, /forms: formHttp/u);
  assert.doesNotMatch(bffSource, /e2eBodyPresent|e2eMethod|e2ePath/u);
  assert.match(runnerSource, /items\?\.find\(\(item\) => item\.sourceType === observation\.taskProjection/u);
  assert.match(runnerSource, /items\?\.find\(\(item\) => item\.sourceType === observation\.notificationProjection/u);
  for (const scenario of ["unlinked", "inactive_employment", "permission_denied"]) {
    assert.match(runnerSource, new RegExp(`e2e_browser_form_read_\\$\\{scenario\\}_not_rejected`, "u"), scenario);
    assert.match(runnerSource, new RegExp(`e2e_browser_observation_\\$\\{scenario\\}_not_rejected`, "u"), scenario);
  }
});
