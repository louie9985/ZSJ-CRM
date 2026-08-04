import { Empty } from "antd";

const ID = /^[a-z][a-z0-9_.-]{0,127}$/u;
const ROUTE = /^\/crm(?:\/[a-z0-9-]+)*$/u;

export const UNCONFIGURED_WORKSPACE_PROFILE_ID = "crm.workspace.unconfigured";

export interface WorkspaceProfile {
  readonly contentComponentKey: string;
  readonly defaultRoute: string;
  readonly navigationIds: readonly string[];
  readonly profileId: string;
  render(): React.JSX.Element;
}

function UnconfiguredWorkspace(): React.JSX.Element {
  return (
    <section className="unconfigured-workspace" aria-labelledby="unconfigured-workspace-title">
      <Empty
        description={<span id="unconfigured-workspace-title">当前部门与岗位尚未配置工作台内容</span>}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    </section>
  );
}

export function createWorkspaceProfileRegistry(profiles: readonly WorkspaceProfile[]): ReadonlyMap<string, Readonly<WorkspaceProfile>> {
  const registry = new Map<string, Readonly<WorkspaceProfile>>();
  for (const profile of profiles) {
    if (!ID.test(profile.profileId) || !ID.test(profile.contentComponentKey) || !ROUTE.test(profile.defaultRoute) ||
      profile.navigationIds.length > 128 || profile.navigationIds.some((item) => !ID.test(item)) ||
      new Set(profile.navigationIds).size !== profile.navigationIds.length || registry.has(profile.profileId)) {
      throw new Error("workspace_profile_registration_conflict");
    }
    registry.set(profile.profileId, Object.freeze({ ...profile, navigationIds: Object.freeze([...profile.navigationIds]) }));
  }
  if (!registry.has(UNCONFIGURED_WORKSPACE_PROFILE_ID)) throw new Error("workspace_unconfigured_profile_missing");
  return registry;
}

export const workspaceProfiles = createWorkspaceProfileRegistry([{
  contentComponentKey: "crm.workspace.unconfigured",
  defaultRoute: "/crm/workspace",
  navigationIds: ["crm.workspace.unconfigured"],
  profileId: UNCONFIGURED_WORKSPACE_PROFILE_ID,
  render: () => <UnconfiguredWorkspace />,
}]);

export function resolveWorkspaceProfile(profileId: string | undefined): Readonly<WorkspaceProfile> {
  const resolved = workspaceProfiles.get(profileId ?? "") ?? workspaceProfiles.get(UNCONFIGURED_WORKSPACE_PROFILE_ID);
  if (resolved === undefined) throw new Error("workspace_unconfigured_profile_missing");
  return resolved;
}
