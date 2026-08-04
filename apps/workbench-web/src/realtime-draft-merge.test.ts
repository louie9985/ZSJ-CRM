import { describe, expect, it } from "vitest";
import { mergeRealtimeSnapshot, type RealtimeDraftState } from "./realtime-draft-merge";

describe("realtime draft merge", () => {
  it("keeps local input, applies untouched server fields, and marks same-field conflicts", () => {
    const state: RealtimeDraftState<{ name: string; note: string }> = { basedOnVersion: 1, conflicts: [], localDraft: { note: "local" }, serverSnapshot: { name: "Before", note: "before" }, serverVersion: 1 };
    const next = mergeRealtimeSnapshot(state, { name: "After", note: "remote" }, 2);
    expect({ ...next.serverSnapshot, ...next.localDraft }).toEqual({ name: "After", note: "local" });
    expect(next.conflicts).toEqual(["note"]);
    expect(mergeRealtimeSnapshot(next, { name: "stale", note: "stale" }, 1)).toBe(next);
  });
});
