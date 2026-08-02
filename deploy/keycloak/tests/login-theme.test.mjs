import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const login = await readFile(new URL("../theme/src/login/Login.tsx", import.meta.url), "utf8");

test("custom login keeps Keycloak-compatible stable form controls", () => {
  assert.match(login, /id="username"/u);
  assert.match(login, /name="username"/u);
  assert.match(login, /id="password"/u);
  assert.match(login, /name="password"/u);
  assert.match(login, /id="kc-login"/u);
  assert.match(login, /htmlType="submit"/u);
});
