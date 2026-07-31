import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  browserTaskIdempotencyKey,
  browserTaskSourceTaskId,
  browserTaskSourceType,
  readBrowserTaskCommand,
  recordBrowserTaskCommand,
} from "./browser-task-command.js";

const actor = Object.freeze({ activeAssignmentIds: Object.freeze(["assignment.synthetic"]), principalId: `subject:${"a".repeat(64)}` });
const command = Object.freeze({ actor, idempotencyKey: browserTaskIdempotencyKey, sourceTaskId: browserTaskSourceTaskId, sourceType: browserTaskSourceType });
const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";

describe("browser Task command evidence", () => {
  it("records one bounded command and accepts only an identical replay", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "ai-crm-browser-task-command-"));
    const path = resolve(directory, "command.json");
    try {
      await expect(recordBrowserTaskCommand(path, command, traceId)).resolves.toEqual({ sourceCommandId: "94000000-0000-5000-8000-000000000001", status: "accepted" });
      await expect(recordBrowserTaskCommand(path, command, traceId)).resolves.toMatchObject({ status: "accepted" });
      await expect(readBrowserTaskCommand(path)).resolves.toEqual({ ...command, traceId, version: 1 });
      await expect(recordBrowserTaskCommand(path, { ...command, actor: { ...actor, principalId: `subject:${"b".repeat(64)}` } }, traceId)).rejects.toThrow("e2e_browser_task_command_conflict");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects unreviewed source, assignment, trace, and relative paths", async () => {
    await expect(recordBrowserTaskCommand("relative.json", command, traceId)).rejects.toThrow("e2e_browser_task_command_path_invalid");
    await expect(recordBrowserTaskCommand(resolve(tmpdir(), "unused-browser-task-command.json"), { ...command, sourceType: "crm.unreviewed" }, traceId)).rejects.toThrow("e2e_browser_task_command_invalid");
    await expect(recordBrowserTaskCommand(resolve(tmpdir(), "unused-browser-task-command.json"), command, "0".repeat(32))).rejects.toThrow("e2e_browser_task_command_invalid");
  });
});
