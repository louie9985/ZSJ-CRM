import { describe, expect, it } from "vitest";
import { createWorkspaceProfileRegistry, resolveWorkspaceProfile, UNCONFIGURED_WORKSPACE_PROFILE_ID } from "./workspace-profiles";

describe("workspace profile registry", () => {
  it("falls back to the neutral unconfigured workspace", () => {
    expect(resolveWorkspaceProfile("crm.workspace.unknown").profileId).toBe(UNCONFIGURED_WORKSPACE_PROFILE_ID);
  });

  it("rejects duplicate registrations at startup", () => {
    const profile = { contentComponentKey: UNCONFIGURED_WORKSPACE_PROFILE_ID, defaultRoute: "/crm/workspace", navigationIds: [UNCONFIGURED_WORKSPACE_PROFILE_ID], profileId: UNCONFIGURED_WORKSPACE_PROFILE_ID, render: () => <div /> };
    expect(() => createWorkspaceProfileRegistry([profile, profile])).toThrow("workspace_profile_registration_conflict");
  });
});
