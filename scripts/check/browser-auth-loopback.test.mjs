import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("./run-e2e-browser-authentication.mjs", import.meta.url), "utf8");

test("browser authentication E2E keeps explicit loopback API and client origins", () => {
  assert.match(source, /AI_CRM_E2E_API_ORIGIN \?\? "http:\/\/127\.0\.0\.1:13001"/u);
  assert.match(source, /AI_CRM_E2E_PC_ORIGIN \?\? "http:\/\/127\.0\.0\.1:3000"/u);
  assert.match(source, /AI_CRM_E2E_INTERNAL_H5_ORIGIN \?\? "http:\/\/127\.0\.0\.1:10086"/u);
  assert.doesNotMatch(source, /keycloak|oidc|openid(?:-connect)?|\/realms(?:\/|\b)|token[-_ ]?verifier/iu);
});

test("browser authentication E2E cleans up every session that was established before a failure", () => {
  assert.match(source, /Promise\.allSettled\(\[establishSession\("pc", password\), establishSession\("internal-h5", password\)\]\)/u);
  assert.match(source, /Promise\.allSettled\(sessions\.map\(logoutSession\)\)/u);
});
