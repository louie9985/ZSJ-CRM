import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./local-dev.mjs", import.meta.url), "utf8");

test("local API build includes every directly composed configuration dependency", () => {
  assert.match(source, /"packages\/platform-modules\/business-configuration\/tsconfig\.json"/u);
});
