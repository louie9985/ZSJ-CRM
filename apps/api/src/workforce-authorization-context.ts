import type { AuthorizationSubjectContext } from "@ai-crm/crm-authorization";

export interface WorkforceAuthorizationContextInput {
  readonly activeAssignmentIds: readonly string[];
  readonly selectedAssignmentId?: string;
  readonly systemAdministrator: boolean;
  readonly workforcePersonId: string;
}

export function createWorkforceAuthorizationContext(
  input: Readonly<WorkforceAuthorizationContextInput>,
): Readonly<AuthorizationSubjectContext> {
  const activeAssignmentIds = Object.freeze([...input.activeAssignmentIds]);
  if (input.selectedAssignmentId !== undefined && !activeAssignmentIds.includes(input.selectedAssignmentId)) {
    throw new Error("authorization_selected_assignment_inactive");
  }
  const selectedAssignmentId = input.selectedAssignmentId ?? (activeAssignmentIds.length === 1 ? activeAssignmentIds[0] : undefined);
  return Object.freeze({
    activeAssignmentIds,
    ...(selectedAssignmentId === undefined ? {} : { selectedAssignmentId }),
    workforcePersonId: input.workforcePersonId,
  });
}
