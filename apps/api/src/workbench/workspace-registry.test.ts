import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createWorkspaceRegistry, UNCONFIGURED_WORKSPACE_PROFILE_ID } from "./workspace-registry.js";

const profile = { applicationId: "crm", contentComponentKey: "crm.workspace.unconfigured", defaultRoute: "/crm/workspace", navigationIds: ["crm.workspace.unconfigured"], profileId: UNCONFIGURED_WORKSPACE_PROFILE_ID } as const;

describe("workspace registry", () => {
  it("falls back without selecting another position profile", () => {
    const registry = createWorkspaceRegistry({ bindings: [], profiles: [profile] });
    expect(registry.resolve({ applicationId: "crm", organizationUnitId: randomUUID(), positionId: randomUUID() })).toBe(UNCONFIGURED_WORKSPACE_PROFILE_ID);
  });

  it("fails startup on duplicate profiles and bindings", () => {
    expect(() => createWorkspaceRegistry({ bindings: [], profiles: [profile, profile] })).toThrow("workspace_profile_registration_conflict");
    const organizationUnitId = randomUUID();
    const positionId = randomUUID();
    const binding = { applicationId: "crm", organizationUnitId, positionId, workspaceProfileId: profile.profileId } as const;
    expect(() => createWorkspaceRegistry({ bindings: [binding, binding], profiles: [profile] })).toThrow("workspace_binding_registration_conflict");
  });

  it("fails startup when a binding references an unknown profile", () => {
    expect(() => createWorkspaceRegistry({ bindings: [{ applicationId: "crm", organizationUnitId: randomUUID(), positionId: randomUUID(), workspaceProfileId: "crm.workspace.unknown" }], profiles: [profile] })).toThrow("workspace_binding_registration_invalid");
  });
});
