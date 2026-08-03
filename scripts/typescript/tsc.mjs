import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function tscCli() {
  const pnpmRoot = resolve(repositoryRoot, "node_modules/.pnpm");
  const entries = await readdir(pnpmRoot, { withFileTypes: true });
  const selected = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("typescript@"))
    .map((entry) => resolve(pnpmRoot, entry.name, "node_modules/typescript/lib/tsc.js"))
    .sort()
    .at(-1);
  if (selected === undefined) throw new Error("typescript_cli_unavailable");
  return selected;
}

const result = spawnSync(process.execPath, [await tscCli(), ...process.argv.slice(2)], {
  cwd: repositoryRoot,
  env: process.env,
  shell: false,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
