import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = process.env.AI_CRM_PRISMA_ROOT ? resolve(process.env.AI_CRM_PRISMA_ROOT) : resolve(import.meta.dirname, "../..");
const violations = [];
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory() && !["node_modules", "dist", "coverage", ".turbo", "generated"].includes(entry.name)) walk(path);
    else if (entry.isFile() && /\.(ts|tsx|mts|mjs|cjs)$/.test(entry.name)) {
      const text = readFileSync(path, "utf8");
      const rel = path.slice(root.length + 1).replaceAll("\\", "/");
      if (/from\s+["'](?:drizzle-orm|drizzle-kit)/.test(text)) violations.push(`${rel}: Drizzle import`);
      if (/\$(?:query|execute)RawUnsafe\s*\(/.test(text)) violations.push(`${rel}: unsafe Prisma Raw API`);
      if (rel.endsWith("/src/index.ts") && /export\s+(?:type\s+)?\{?[^\n]*(?:PrismaClient|Prisma\.\w+|TransactionClient)/.test(text)) violations.push(`${rel}: public Prisma type export`);
    }
  }
}
walk(resolve(root, "packages"));
walk(resolve(root, "apps"));
for (const packageFile of [resolve(root, "package.json"), ...packageJsonFiles(resolve(root, "packages")), ...packageJsonFiles(resolve(root, "apps"))]) {
  const manifest = JSON.parse(readFileSync(packageFile, "utf8"));
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (dependency === "drizzle-orm" || dependency === "drizzle-kit") {
        violations.push(`${packageFile.slice(root.length + 1).replaceAll("\\", "/")}: Drizzle dependency`);
      }
    }
  }
}
if (violations.length) throw new Error(`Prisma boundary violations:\n${violations.join("\n")}`);
process.stdout.write("Prisma boundary checks passed\n");

function packageJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "coverage", ".turbo", "generated"].includes(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) results.push(...packageJsonFiles(path));
    else if (entry.isFile() && entry.name === "package.json") results.push(path);
  }
  return results;
}
