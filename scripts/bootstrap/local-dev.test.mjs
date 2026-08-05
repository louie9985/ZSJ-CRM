import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const source = await readFile(new URL("./local-dev.mjs", import.meta.url), "utf8");

test("local API build includes every directly composed configuration dependency", () => {
  assert.match(source, /"packages\/crm-modules\/business-configuration\/tsconfig\.json"/u);
});

test("long-running pnpm commands use the resolved CLI through Node when available", () => {
  assert.match(source, /function runPnpmLong\(args, env\) \{\s+if \(pnpmCli\) runLong\(node, \[pnpmCli, \.\.\.args\], env\);/u);
  assert.doesNotMatch(source, /internal-mobile|commandMobile/u);
});
