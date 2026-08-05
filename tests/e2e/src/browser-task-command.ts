import { isAbsolute } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import type { CompleteTaskCommand, TaskCommandResult } from "@ai-crm/crm-task-center";

export const browserTaskIdempotencyKey = "task-complete.browser-causal-0001";
export const browserTaskSourceTaskId = "source-task.main-chain-synthetic";
export const browserTaskSourceType = "tests.walking-skeleton";
const sourceCommandId = "94000000-0000-5000-8000-000000000001";
const TRACE_ID = /^(?!0{32})[0-9a-f]{32}$/u;
const ACTOR_ID = /^subject:[0-9a-f]{64}$/u;
export const browserTaskAssignmentId = "71000000-0000-4000-8000-000000000007";

export interface BrowserTaskCommandEvidence extends CompleteTaskCommand {
  readonly traceId: string;
  readonly version: 1;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBrowserTaskCommand(value: unknown): Readonly<BrowserTaskCommandEvidence> {
  if (!record(value) || Object.keys(value).some((key) => !["actor", "idempotencyKey", "sourceCommandReference", "sourceTaskId", "sourceType", "traceId", "version"].includes(key)) ||
    value["version"] !== 1 || value["idempotencyKey"] !== browserTaskIdempotencyKey ||
    value["sourceTaskId"] !== browserTaskSourceTaskId || value["sourceType"] !== browserTaskSourceType ||
    typeof value["traceId"] !== "string" || !TRACE_ID.test(value["traceId"]) || !record(value["actor"]) ||
    Object.keys(value["actor"]).some((key) => !["activeAssignmentIds", "principalId", "workforcePersonId"].includes(key)) ||
    typeof value["actor"]["principalId"] !== "string" || !ACTOR_ID.test(value["actor"]["principalId"]) ||
    !Array.isArray(value["actor"]["activeAssignmentIds"]) || value["actor"]["activeAssignmentIds"].length !== 1 ||
    value["actor"]["activeAssignmentIds"][0] !== browserTaskAssignmentId ||
    (value["actor"]["workforcePersonId"] !== undefined && (typeof value["actor"]["workforcePersonId"] !== "string" || !/^[0-9a-f-]{36}$/u.test(value["actor"]["workforcePersonId"]))) ||
    (value["sourceCommandReference"] !== undefined && (typeof value["sourceCommandReference"] !== "string" || value["sourceCommandReference"].length > 255))) {
    throw new Error("e2e_browser_task_command_invalid");
  }
  return Object.freeze({
    actor: Object.freeze({ activeAssignmentIds: Object.freeze([browserTaskAssignmentId]), principalId: value["actor"]["principalId"], ...(typeof value["actor"]["workforcePersonId"] === "string" ? { workforcePersonId: value["actor"]["workforcePersonId"] } : {}) }),
    idempotencyKey: browserTaskIdempotencyKey,
    sourceTaskId: browserTaskSourceTaskId,
    sourceType: browserTaskSourceType,
    ...(typeof value["sourceCommandReference"] === "string" ? { sourceCommandReference: value["sourceCommandReference"] } : {}),
    traceId: value["traceId"],
    version: 1,
  });
}

export async function readBrowserTaskCommand(path: string): Promise<Readonly<BrowserTaskCommandEvidence>> {
  if (!isAbsolute(path)) throw new Error("e2e_browser_task_command_path_invalid");
  let value: unknown;
  try { value = JSON.parse(await readFile(path, "utf8")) as unknown; }
  catch (error) { throw new Error("e2e_browser_task_command_unavailable", { cause: error }); }
  return parseBrowserTaskCommand(value);
}

export async function recordBrowserTaskCommand(
  path: string,
  command: CompleteTaskCommand,
  traceId: string,
): Promise<Readonly<TaskCommandResult>> {
  if (!isAbsolute(path)) throw new Error("e2e_browser_task_command_path_invalid");
  const evidence = parseBrowserTaskCommand({ ...command, traceId, version: 1 });
  const serialized = `${JSON.stringify(evidence)}\n`;
  try {
    await writeFile(path, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if (typeof error !== "object" || error === null || Reflect.get(error, "code") !== "EEXIST") throw error;
    if (await readFile(path, "utf8") !== serialized) throw new Error("e2e_browser_task_command_conflict");
  }
  return Object.freeze({ sourceCommandId, status: "accepted" });
}
