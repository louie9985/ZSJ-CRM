import { executeCombinedEvidence, runNodeScenario } from "./e2e-combined-evidence.mjs";

const result = await executeCombinedEvidence(runNodeScenario);
process.stdout.write(`${JSON.stringify(result)}\n`);
