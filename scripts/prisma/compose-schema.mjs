import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.env.AI_CRM_PRISMA_ROOT ? resolve(process.env.AI_CRM_PRISMA_ROOT) : resolve(import.meta.dirname, "../..");
const out = resolve(root, "prisma/schema.prisma");
const base = readFileSync(resolve(root, "prisma/base.prisma"), "utf8");
const check = process.argv.includes("--check");

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() && entry.name.endsWith(".prisma") ? [path] : [];
  });
}

const fragments = files(resolve(root, "packages")).filter((path) => path.split(/[/\\]/).includes("prisma"));
const modelNames = new Map();
const schemas = new Set(["public"]);
const sources = fragments.sort().map((path) => {
  const text = readFileSync(path, "utf8");
  const relative = path.slice(root.length + 1).replaceAll("\\", "/");
  for (const match of text.matchAll(/\bmodel\s+([A-Za-z_]\w*)\b/g)) {
    const name = match[1];
    if (modelNames.has(name)) throw new Error(`duplicate Prisma model ${name}: ${modelNames.get(name)} and ${relative}`);
    modelNames.set(name, relative);
  }
  for (const match of text.matchAll(/@@schema\(\s*"([^"]+)"\s*\)/g)) schemas.add(match[1]);
  for (const block of text.matchAll(/\bmodel\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\n\}/g)) {
    if (!/@@schema\(\s*"[^"]+"\s*\)/.test(block[2])) throw new Error(`Prisma model ${block[1]} in ${relative} must declare @@schema`);
  }
  return { relative, text };
});
for (const source of sources) {
  for (const block of source.text.matchAll(/\bmodel\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\n\}/g)) {
    for (const field of block[2].matchAll(/^\s*[A-Za-z_]\w*\s+([A-Za-z_]\w*)(?:\?|\[\])?\s*(?:@relation\b[^\n]*)?$/gm)) {
      const owner = modelNames.get(field[1]);
      if (owner && owner !== source.relative) throw new Error(`cross-module Prisma relation from ${block[1]} in ${source.relative} to ${field[1]} in ${owner}`);
    }
  }
}
const rendered = sources.map(({ relative, text }) => `// source: ${relative}\n${text.trim()}\n`);
const header = base.trim().replace(/schemas\s*=\s*\[[^\]]*\]/, `schemas = [${[...schemas].sort().map((value) => JSON.stringify(value)).join(", ")}]`);
const schema = `${header}\n\n${rendered.join("\n")}\n`;
if (check) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== schema) throw new Error("prisma/schema.prisma is stale; run pnpm prisma:generate");
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, schema, "utf8");
}
process.stdout.write(`Prisma schema composed: ${fragments.length} fragments, ${modelNames.size} models, ${schemas.size} schemas\n`);
