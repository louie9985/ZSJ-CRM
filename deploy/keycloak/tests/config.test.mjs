import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const realmUrl = new URL("../realm-dev.json", import.meta.url);
const realm = JSON.parse(await readFile(realmUrl, "utf8"));
const userProfile = JSON.parse(
  await readFile(new URL("../user-profile-dev.json", import.meta.url), "utf8"),
);
const ceremonyProvider = await readFile(
  new URL("../providers/src/main/java/cn/zsj/crm/keycloak/CredentialCeremonyResource.java", import.meta.url),
  "utf8",
);
const ceremonyPage = await readFile(
  new URL("../theme/src/login/CredentialCeremony.tsx", import.meta.url),
  "utf8",
);
const ceremonyErrorPage = await readFile(
  new URL("../theme/src/login/CredentialCeremonyError.tsx", import.meta.url),
  "utf8",
);
const themeContext = await readFile(
  new URL("../theme/src/login/KcContext.ts", import.meta.url),
  "utf8",
);

test("realm uses the ZSJ CRM theme and username-or-phone browser flow", () => {
  assert.equal(realm.loginTheme, "zsj-crm");
  assert.equal(realm.browserFlow, "browser-with-phone");
  const formFlow = realm.authenticationFlows.find(
    (flow) => flow.alias === "browser-with-phone-forms",
  );
  const browserFlow = realm.authenticationFlows.find(
    (flow) => flow.alias === "browser-with-phone",
  );
  assert.equal(browserFlow.authenticationExecutions[0].authenticatorFlow, false);
  assert.equal(browserFlow.authenticationExecutions[1].authenticatorFlow, true);
  assert.equal(formFlow.authenticationExecutions[0].authenticatorFlow, false);
  assert.equal(
    formFlow.authenticationExecutions[0].authenticator,
    "ai-crm-username-or-phone",
  );
});

test("realm disables recovery and keeps email optional and admin-only", () => {
  assert.equal(realm.registrationAllowed, false);
  assert.equal(realm.resetPasswordAllowed, false);
  assert.equal(realm.loginWithEmailAllowed, false);
  assert.equal(realm.verifyEmail, false);
  const names = userProfile.attributes.map(({ name }) => name);
  const email = userProfile.attributes.find(({ name }) => name === "email");
  assert.equal("required" in email, false);
  assert.deepEqual(email.permissions.view, ["admin"]);
  assert.deepEqual(names.includes("firstName"), false);
  assert.deepEqual(names.includes("lastName"), false);
  assert.equal("unmanagedAttributePolicy" in userProfile, false);
});

test("realm locks after five failures for a fifteen minute window", () => {
  assert.equal(realm.bruteForceProtected, true);
  assert.equal(realm.permanentLockout, false);
  assert.equal(realm.failureFactor, 5);
  assert.equal(realm.waitIncrementSeconds, 900);
  assert.equal(realm.maxFailureWaitSeconds, 900);
});

test("realm contains only purpose-specific least-privilege technical users and no literal client Secret", () => {
  assert.deepEqual(realm.users.map(({ username }) => username), ["service-account-ai-crm-workforce-provisioner", "service-account-ai-crm-workforce-sync-worker"]);
  for (const user of realm.users) assert.deepEqual(user.clientRoles["realm-management"], ["manage-users", "view-users"]);
  assert.equal(realm.clients[0].secret, "__AI_CRM_PC_CLIENT_SECRET__");
  assert.equal(realm.clients[1].secret, "__AI_CRM_WORKFORCE_ADMIN_CLIENT_SECRET__");
  assert.equal(realm.clients[2].secret, "__AI_CRM_WORKFORCE_WORKER_CLIENT_SECRET__");
});

test("credential ceremony is rendered only through reviewed Keycloakify theme pages", () => {
  assert.match(ceremonyProvider, /LoginFormsProvider/);
  assert.match(ceremonyProvider, /createForm\(FORM_TEMPLATE\)/);
  assert.match(ceremonyProvider, /createForm\(FAILURE_TEMPLATE\)/);
  assert.doesNotMatch(ceremonyProvider, /<!doctype|<style>|<form|type=\"password\"/i);
  assert.match(themeContext, /"credential-ceremony\.ftl"/);
  assert.match(themeContext, /"credential-ceremony-error\.ftl"/);
  assert.match(ceremonyPage, /Input\.Password/);
  assert.match(ceremonyPage, /action=\{kcContext\.url\.loginAction\}/);
  assert.doesNotMatch(ceremonyErrorPage, /operation|secret|targetUserId|username|phone/i);
});
