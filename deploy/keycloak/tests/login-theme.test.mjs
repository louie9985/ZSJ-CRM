import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const login = await readFile(new URL("../theme/src/login/Login.tsx", import.meta.url), "utf8");
const updatePassword = await readFile(new URL("../theme/src/login/UpdatePassword.tsx", import.meta.url), "utf8");
const ceremony = await readFile(new URL("../theme/src/login/CredentialCeremony.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../theme/src/theme.css", import.meta.url), "utf8");

test("custom login keeps Keycloak-compatible stable form controls", () => {
  assert.match(login, /id="username"/u);
  assert.match(login, /name="username"/u);
  assert.match(login, /id="password"/u);
  assert.match(login, /name="password"/u);
  assert.match(login, /id="kc-login"/u);
  assert.match(login, /htmlType="submit"/u);
});

test("authentication forms use vertical labels, centered titles, and a unified login failure", () => {
  for (const page of [login, updatePassword, ceremony]) assert.match(page, /component=\{false\} layout="vertical"/u);
  assert.match(styles, /\.auth-title\.ant-typography\s*\{[^}]*text-align:\s*center;/su);
  assert.match(login, /用户名\/手机号或密码错误，请重新输入/u);
  assert.doesNotMatch(login, /账号不存在|账号停用|账号暂时不可用/u);
});
