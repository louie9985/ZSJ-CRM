export const WORKFORCE_ACCESS_ERROR_CODES = [
  "authorization_denied",
  "entity_conflict",
  "entity_not_found",
  "idempotency_conflict",
  "input_invalid",
  "login_identifier_occupied",
  "revision_conflict",
  "state_transition_invalid",
] as const;

export type WorkforceAccessErrorCode = (typeof WORKFORCE_ACCESS_ERROR_CODES)[number];

export class WorkforceAccessError extends Error {
  constructor(public readonly code: WorkforceAccessErrorCode) {
    super(code);
    this.name = "WorkforceAccessError";
  }
}
