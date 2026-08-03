import type { AuthorizationSubjectContext } from "@ai-crm/platform-authorization";

export interface WorkforceAuthorizationContextInput {
  readonly activeAssignmentIds: readonly string[];
  readonly systemAdministrator: boolean;
  readonly workforcePersonId: string;
}

export function createWorkforceAuthorizationContext(
  input: Readonly<WorkforceAuthorizationContextInput>,
): Readonly<AuthorizationSubjectContext> {
  const activeAssignmentIds = Object.freeze([...input.activeAssignmentIds]);
  const selectedAssignmentId = !input.systemAdministrator && activeAssignmentIds.length === 1
    ? activeAssignmentIds[0]
    : undefined;
  return Object.freeze({
    activeAssignmentIds,
    ...(selectedAssignmentId === undefined ? {} : { selectedAssignmentId }),
    workforcePersonId: input.workforcePersonId,
  });
}
