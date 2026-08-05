import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const source = await readFile(new URL("./local-account-bootstrap.mjs", import.meta.url), "utf8");
const secretBootstrap = await readFile(new URL("./compose-secrets.mjs", import.meta.url), "utf8");

test("bootstrap preserves printable password spaces while removing only the file line ending", () => {
  assert.match(source, /preservePrintableSpaces \? contents\.replace\(\/\\r\?\\n\$\/u, ""\) : contents\.trim\(\)/u);
  assert.match(source, /"bootstrap_password", true/u);
});

test("bootstrap validates link and Windows ACL boundaries", () => {
  assert.match(source, /linkInfo\.isSymbolicLink\(\)/u);
  assert.match(source, /AreAccessRulesProtected/u);
  assert.match(source, /S-1-5-18/u);
  assert.match(source, /S-1-5-32-544/u);
  assert.match(source, /allowed -notcontains \$sid/u);
  assert.match(secretBootstrap, /icacls\.exe/u);
  assert.match(secretBootstrap, /\/inheritance:r/u);
});

test("bootstrap is restricted to the explicit loopback ai_crm development target", () => {
  assert.match(source, /AI_CRM_LOCAL_BOOTSTRAP !== "1"/u);
  assert.match(source, /\["127\.0\.0\.1", "\[::1\]", "localhost"\]/u);
  assert.match(source, /databaseTarget\.pathname !== "\/ai_crm"/u);
});

test("idempotent bootstrap verifies the stable organization placement", () => {
  assert.match(source, /join organization\.organization_unit_placements l/u);
  assert.match(source, /select placement_id::text from organization\.organization_unit_placements/u);
});
