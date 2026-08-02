import { executeCombinedEvidence, runNodeScenario } from "./e2e-combined-evidence.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const directory = await mkdtemp(resolve(tmpdir(), "ai-crm-e2e-causal-command-"));
try {
  const result = await executeCombinedEvidence(
    runNodeScenario,
    resolve(directory, "browser-identity.json"),
    resolve(directory, "keycloak.dump"),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await rm(directory, { force: true, recursive: true });
}
