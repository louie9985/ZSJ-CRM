export const packageId = "@ai-crm/crm-authorization" as const;
export { AuthorizationDeniedError, AuthorizationUnavailableError } from "./errors.js";
export {
  createFixedRoleAuthorizationService,
  createFixedRoleDecisionRecorder,
  createFixedRoleGrantStore,
  FIXED_ROLE_KEYS,
  FIXED_ROLE_PERMISSION_BUNDLES,
  type FixedRoleAuthorizationOptions,
  type FixedRoleGrant,
  type FixedRoleGrantStore,
  type FixedRoleKey,
} from "./fixed-roles.js";
export type {
  AuthorizationDecision,
  AuthorizationDecisionReason,
  AuthorizationDecisionRecord,
  AuthorizationDecisionRecorder,
  AuthorizationService,
  AuthorizationSubjectContext,
  DataScope,
  DataScopeResolution,
  DataScopeTerm,
  PermissionRequest,
  ScopeConstraint,
} from "./types.js";
