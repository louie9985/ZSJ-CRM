const ID = /^[a-z][a-z0-9_.-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ROUTE = /^\/crm(?:\/[a-z0-9-]+)*$/u;

export const UNCONFIGURED_WORKSPACE_PROFILE_ID = "crm.workspace.unconfigured";

export interface WorkspaceBindingRegistration {
  readonly applicationId: string;
  readonly organizationUnitId: string;
  readonly positionId: string;
  readonly workspaceProfileId: string;
}

export interface WorkspaceProfileRegistration {
  readonly applicationId: string;
  readonly contentComponentKey: string;
  readonly defaultRoute: string;
  readonly navigationIds: readonly string[];
  readonly profileId: string;
}

export interface WorkspaceRegistry {
  hasApplication(applicationId: string): boolean;
  profile(profileId: string): Readonly<WorkspaceProfileRegistration> | undefined;
  resolve(input: Readonly<{ applicationId: string; organizationUnitId?: string; positionId?: string }>): string;
}

function key(applicationId: string, organizationUnitId: string, positionId: string): string {
  return `${applicationId}\0${organizationUnitId.toLowerCase()}\0${positionId.toLowerCase()}`;
}

function validProfile(profile: WorkspaceProfileRegistration): boolean {
  return ID.test(profile.applicationId) && ID.test(profile.contentComponentKey) && ID.test(profile.profileId) &&
    ROUTE.test(profile.defaultRoute) && profile.navigationIds.length <= 128 &&
    profile.navigationIds.every((item) => ID.test(item)) && new Set(profile.navigationIds).size === profile.navigationIds.length;
}

export function createWorkspaceRegistry(input: Readonly<{
  bindings: readonly WorkspaceBindingRegistration[];
  profiles: readonly WorkspaceProfileRegistration[];
}>): Readonly<WorkspaceRegistry> {
  const profiles = new Map<string, Readonly<WorkspaceProfileRegistration>>();
  const applications = new Set<string>();
  for (const profile of input.profiles) {
    if (!validProfile(profile) || profiles.has(profile.profileId)) throw new Error("workspace_profile_registration_conflict");
    const registered = Object.freeze({ ...profile, navigationIds: Object.freeze([...profile.navigationIds]) });
    profiles.set(profile.profileId, registered);
    applications.add(profile.applicationId);
  }
  const fallback = profiles.get(UNCONFIGURED_WORKSPACE_PROFILE_ID);
  if (fallback === undefined || fallback.applicationId !== "crm") throw new Error("workspace_unconfigured_profile_missing");

  const bindings = new Map<string, string>();
  for (const binding of input.bindings) {
    const profile = profiles.get(binding.workspaceProfileId);
    if (!ID.test(binding.applicationId) || !UUID.test(binding.organizationUnitId) || !UUID.test(binding.positionId) ||
      profile === undefined || profile.applicationId !== binding.applicationId) throw new Error("workspace_binding_registration_invalid");
    const bindingKey = key(binding.applicationId, binding.organizationUnitId, binding.positionId);
    if (bindings.has(bindingKey)) throw new Error("workspace_binding_registration_conflict");
    bindings.set(bindingKey, binding.workspaceProfileId);
  }

  return Object.freeze({
    hasApplication: (applicationId: string) => applications.has(applicationId),
    profile: (profileId: string) => profiles.get(profileId),
    resolve(value: Readonly<{ applicationId: string; organizationUnitId?: string; positionId?: string }>) {
      if (!applications.has(value.applicationId)) throw new Error("workspace_application_unknown");
      if (value.organizationUnitId === undefined || value.positionId === undefined) return UNCONFIGURED_WORKSPACE_PROFILE_ID;
      return bindings.get(key(value.applicationId, value.organizationUnitId, value.positionId)) ?? UNCONFIGURED_WORKSPACE_PROFILE_ID;
    },
  });
}

export const crmWorkspaceRegistry = createWorkspaceRegistry({
  bindings: [],
  profiles: [{
    applicationId: "crm",
    contentComponentKey: "crm.workspace.unconfigured",
    defaultRoute: "/crm/workspace",
    navigationIds: ["crm.workspace.unconfigured"],
    profileId: UNCONFIGURED_WORKSPACE_PROFILE_ID,
  }],
});
