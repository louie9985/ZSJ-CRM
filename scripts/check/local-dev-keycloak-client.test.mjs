import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const localDev = await readFile(new URL("../bootstrap/local-dev.mjs", import.meta.url), "utf8");
const realm = JSON.parse(await readFile(new URL("../../deploy/keycloak/realm-dev.json", import.meta.url), "utf8"));

test("local API uses the declared workforce provisioning client", () => {
  assert.ok(realm.clients.some(({ clientId }) => clientId === "ai-crm-workforce-provisioner"));
  assert.match(localDev, /AI_CRM_KEYCLOAK_ADMIN_CLIENT_ID: "ai-crm-workforce-provisioner"/u);
  assert.doesNotMatch(localDev, /AI_CRM_KEYCLOAK_ADMIN_CLIENT_ID: "ai-crm-workforce-admin"/u);
});
