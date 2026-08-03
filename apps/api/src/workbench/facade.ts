import { createHash } from "node:crypto";

import type { ApplicationRegistryQueryService } from "@ai-crm/platform-app-registry";
import type { OrganizationDirectoryServiceApi, WorkforceContext } from "@ai-crm/platform-organization";

import type { WorkbenchBootstrapFacade, WorkbenchBootstrapView } from "../platform-http/workbench-http.js";
import { createWorkforceAuthorizationContext } from "../workforce-authorization-context.js";

export interface WorkbenchPrincipalPort {
  resolve(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<{
    actorId: string;
    workforce: WorkforceContext;
  }>>;
}

export interface WorkbenchAccountKindPort {
  isSuperAdministrator(workforcePersonId: string): Promise<boolean>;
}

export interface WorkbenchFacadeDependencies {
  readonly accountKinds: WorkbenchAccountKindPort;
  readonly directory: Pick<OrganizationDirectoryServiceApi, "getPersonProfile">;
  readonly principals: WorkbenchPrincipalPort;
  readonly registry: ApplicationRegistryQueryService;
}

function sessionScope(credential: string): string {
  return `session:${createHash("sha256").update(credential).digest("hex").slice(0, 32)}`;
}

export function createWorkbenchBootstrapFacade(dependencies: WorkbenchFacadeDependencies): Readonly<WorkbenchBootstrapFacade> {
  return Object.freeze({
    async load(input: Parameters<WorkbenchBootstrapFacade["load"]>[0]): Promise<Readonly<WorkbenchBootstrapView>> {
      const resolved = await dependencies.principals.resolve(input);
      const workforcePersonId = resolved.workforce.workforcePersonId;
      const [profile, systemAdministrator] = await Promise.all([
        dependencies.directory.getPersonProfile(workforcePersonId),
        dependencies.accountKinds.isSuperAdministrator(workforcePersonId),
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
      const assignmentReference = selectedAssignmentId;
      return Object.freeze({
        accountKind: systemAdministrator ? "system_administrator" : "workforce",
        ...(assignmentReference === undefined ? {} : { assignmentReference }),
        displayName: profile.realName,
        navigationIds: Object.freeze(navigationIds),
        sessionScope: sessionScope(input.credential),
      });
    },
  });
}
