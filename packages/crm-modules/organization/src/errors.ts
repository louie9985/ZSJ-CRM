export type OrganizationErrorCode =
  | "assignment_not_active"
  | "effective_interval_invalid"
  | "employment_not_active"
  | "entity_conflict"
  | "entity_not_found"
  | "idempotency_conflict"
  | "organization_hierarchy_cycle"
  | "organization_path_invalid";

export class OrganizationError extends Error {
  constructor(readonly code: OrganizationErrorCode) {
    super(code);
    this.name = "OrganizationError";
  }
}
