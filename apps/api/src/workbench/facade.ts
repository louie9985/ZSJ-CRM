import { createHash } from "node:crypto";

import type { OrganizationDirectoryServiceApi, WorkforcePersonContext } from "@ai-crm/crm-organization";

import type { WorkbenchBootstrapFacade, WorkbenchBootstrapView } from "../platform-http/workbench-http.js";
import { createWorkforceAuthorizationContext } from "../workforce-authorization-context.js";
import { crmWorkspaceRegistry, type WorkspaceRegistry } from "./workspace-registry.js";

export interface WorkbenchPrincipalPort {
  resolve(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<{
    actorId: string;
    workforce: WorkforcePersonContext;
  }>>;
}

export interface CrmNavigationRegistry {
  readonly resolveDeepLink?: (...input: readonly unknown[]) => Promise<unknown>;
  loadRegistry(input: Readonly<{
    readonly audience: "internal";
    readonly context: Readonly<{
      readonly actor: Readonly<{ readonly actorId: string; readonly assignmentId?: string; readonly actorType: string; readonly workforcePersonId: string }>;
      readonly subject: unknown;
      readonly traceId: string;
    }>;
  }>): Promise<Readonly<{
    readonly applications?: readonly unknown[];
    readonly navigation: readonly Readonly<{ enabled: boolean; navigationId: string; order: number; applicationId?: string; routeId?: string }>[];
    readonly routes?: readonly unknown[];
    readonly version?: number;
  }>>;
}

export interface WorkbenchAccountKindPort {
  isSystemAdministrator(workforcePersonId: string): Promise<boolean>;
}

export interface WorkbenchFacadeDependencies {
  readonly accountKinds: WorkbenchAccountKindPort;
  readonly directory: Pick<OrganizationDirectoryServiceApi, "getPersonProfile">;
  readonly principals: WorkbenchPrincipalPort;
  readonly registry: CrmNavigationRegistry;
  readonly workspaces?: WorkspaceRegistry;
}

function sessionScope(credential: string): string {
  return `session:${createHash("sha256").update(credential).digest("hex").slice(0, 32)}`;
}

export function createWorkbenchBootstrapFacade(dependencies: WorkbenchFacadeDependencies): Readonly<WorkbenchBootstrapFacade> {
  return Object.freeze({
    async load(input: Parameters<WorkbenchBootstrapFacade["load"]>[0]): Promise<Readonly<WorkbenchBootstrapView>> {
      const resolved = await dependencies.principals.resolve(input);
      const workforcePersonId = resolved.workforce.workforcePersonId;
      if (resolved.workforce.assignments.length > 1) {
        throw Object.assign(new Error("organization_context_ambiguous"), { code: "organization_context_ambiguous" });
      }
      const [profile, systemAdministrator] = await Promise.all([
        dependencies.directory.getPersonProfile(workforcePersonId),
        dependencies.accountKinds.isSystemAdministrator(workforcePersonId),
      ]);
      const subject = createWorkforceAuthorizationContext({
        activeAssignmentIds: resolved.workforce.assignments.map(({ assignmentId }) => assignmentId),
        systemAdministrator,
        workforcePersonId,
      });
      const selectedAssignmentId = subject.selectedAssignmentId;
      const registry = await dependencies.registry.loadRegistry({
        audience: "internal",
        context: {
          actor: {
            actorId: resolved.actorId,
            actorType: "authenticated_subject",
            ...(selectedAssignmentId === undefined ? {} : { assignmentId: selectedAssignmentId }),
            workforcePersonId,
          },
          subject,
          traceId: input.traceId,
        },
      });
      const navigationIds = registry.navigation
        .filter(({ enabled }) => enabled)
        .sort((left, right) => left.order - right.order || left.navigationId.localeCompare(right.navigationId, "en"))
        .map(({ navigationId }) => navigationId);
      const workspaces = dependencies.workspaces ?? crmWorkspaceRegistry;
      const assignmentReference = systemAdministrator ? undefined : selectedAssignmentId;
      const assignment = resolved.workforce.assignments[0];
      const workspaceProfileId = workspaces.resolve({
        applicationId: "crm",
        ...(assignment === undefined ? {} : { organizationUnitId: assignment.organizationUnitId, positionId: assignment.positionId }),
      });
      return Object.freeze({
        accountKind: systemAdministrator ? "system_administrator" : "workforce",
        ...(assignmentReference === undefined ? {} : { assignmentReference }),
        displayName: profile.realName,
        navigationIds: Object.freeze(navigationIds),
        sessionScope: sessionScope(input.credential),
        workspaceProfileId,
      });
    },
  });
}
