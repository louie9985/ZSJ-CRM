import { resolve } from "node:path";
import process from "node:process";
import { readAndValidateRecoveryEvidence } from "./recovery-evidence.mjs";

const manifestPath = resolve(process.cwd(), process.argv[2] ?? "scripts/backup/recovery-evidence.example.json");
const { errors } = await readAndValidateRecoveryEvidence(manifestPath);

if (errors.length > 0) {
  console.error("Recovery evidence manifest is invalid:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Recovery evidence manifest structure and evidence bindings are valid.");
  console.log("Referenced evidence must still be resolved, re-hashed, and independently approved outside this validator.");
}
