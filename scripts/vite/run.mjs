import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function viteCli() {
  const pnpmRoot = resolve(repositoryRoot, "node_modules/.pnpm");
  const entries = await readdir(pnpmRoot, { withFileTypes: true });
  const selected = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("vite@"))
    .map((entry) => resolve(pnpmRoot, entry.name, "node_modules/vite/bin/vite.js"))
    .sort()
    .at(-1);
  if (selected === undefined) throw new Error("vite_cli_unavailable");
  return selected;
}

const child = spawn(process.execPath, [await viteCli(), ...process.argv.slice(2)], {
  cwd: resolve(repositoryRoot, "apps/workbench-web"),
  env: process.env,
  shell: false,
  stdio: "inherit",
});
child.once("error", (error) => { throw error; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
