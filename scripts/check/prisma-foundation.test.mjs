import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";

const script = resolve(import.meta.dirname, "../prisma/compose-schema.mjs");
const boundaryScript = resolve(import.meta.dirname, "../prisma/verify-boundaries.mjs");
const base = `generator client {\n  provider = "prisma-client"\n  output = "../generated"\n}\ndatasource db {\n  provider = "postgresql"\n  schemas = ["public"]\n}\n`;

async function fixture(fragments) {
  const root = await mkdtemp(resolve(tmpdir(), "ai-crm-prisma-"));
  mkdirSync(resolve(root, "prisma"));
  writeFileSync(resolve(root, "prisma/base.prisma"), base);
  for (const [name, contents] of Object.entries(fragments)) {
    const dir = resolve(root, `packages/platform-modules/${name}/prisma`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${name}.prisma`), contents);
  }
  return root;
}

test("Prisma schema composition is deterministic and collects PostgreSQL schemas", async () => {
  const root = await fixture({ zed: `model Zed { id String @id\n @@schema("zed")\n}`, alpha: `model Alpha { id String @id\n @@schema("alpha")\n}` });
  execFileSync(process.execPath, [script], { env: { ...process.env, AI_CRM_PRISMA_ROOT: root } });
  const first = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
  execFileSync(process.execPath, [script], { env: { ...process.env, AI_CRM_PRISMA_ROOT: root } });
  assert.equal(readFileSync(resolve(root, "prisma/schema.prisma"), "utf8"), first);
  assert.ok(first.indexOf("source: packages/platform-modules/alpha") < first.indexOf("source: packages/platform-modules/zed"));
  assert.match(first, /schemas = \["alpha", "public", "zed"\]/);
});

test("Prisma schema composition rejects duplicate models and cross-module relations", async () => {
  const duplicate = await fixture({ one: `model Same { id String @id\n @@schema("one")\n}`, two: `model Same { id String @id\n @@schema("two")\n}` });
  assert.notEqual(spawnSync(process.execPath, [script], { env: { ...process.env, AI_CRM_PRISMA_ROOT: duplicate } }).status, 0);
  const relation = await fixture({ one: `model One { id String @id\n two Two?\n @@schema("one")\n}`, two: `model Two { id String @id\n @@schema("two")\n}` });
  assert.notEqual(spawnSync(process.execPath, [script], { env: { ...process.env, AI_CRM_PRISMA_ROOT: relation } }).status, 0);
});

test("Prisma boundaries reject Drizzle package dependencies", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ai-crm-prisma-boundary-"));
  mkdirSync(resolve(root, "packages/example/src"), { recursive: true });
  mkdirSync(resolve(root, "apps"), { recursive: true });
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ private: true }));
  writeFileSync(resolve(root, "packages/example/package.json"), JSON.stringify({ dependencies: { "drizzle-orm": "1.0.0" } }));
  writeFileSync(resolve(root, "packages/example/src/index.ts"), "export const value = true;\n");
  const result = spawnSync(process.execPath, [boundaryScript], { encoding: "utf8", env: { ...process.env, AI_CRM_PRISMA_ROOT: root } });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Drizzle dependency/);
});
