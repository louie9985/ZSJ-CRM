import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const callerRoot = process.cwd();

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    shell: false,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function prismaCli() {
  const pnpmRoot = resolve(repositoryRoot, "node_modules/.pnpm");
  const entries = await readdir(pnpmRoot, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("prisma@"))
    .map((entry) => resolve(pnpmRoot, entry.name, "node_modules"))
    .sort();
  const nodeModules = candidates.at(-1);
  if (nodeModules === undefined) throw new Error("prisma_cli_unavailable");
  return {
    cli: resolve(nodeModules, "prisma/build/index.js"),
    nodePath: nodeModules,
  };
}

run(process.execPath, [resolve(repositoryRoot, "scripts/prisma/compose-schema.mjs")]);
const args = process.argv.slice(2).map((arg, index, values) =>
  values[index - 1] === "--config" && !/^[A-Za-z]:[\\/]|^[\\/]/u.test(arg)
    ? resolve(callerRoot, arg)
    : arg);
const prisma = await prismaCli();
run(process.execPath, [prisma.cli, "generate", ...args], {
  NODE_PATH: process.env.NODE_PATH ? `${prisma.nodePath};${process.env.NODE_PATH}` : prisma.nodePath,
});
