export interface ScopeConstraint {
  readonly dimension: string;
  readonly values: readonly string[];
}

export type DataScopeTerm = { readonly kind: "all" } | { readonly constraints: readonly ScopeConstraint[]; readonly kind: "match" };

export interface DataScope {
  readonly terms: readonly DataScopeTerm[];
  readonly version: 1;
}

export interface AuthorizationSubjectContext {
  readonly activeAssignmentIds: readonly string[];
  readonly selectedAssignmentId?: string;
  readonly workforcePersonId: string;
}

export interface PermissionRequest {
  readonly action: string;
  readonly resource: string;
  readonly resourceContext?: Readonly<Record<string, string>>;
}

export type AuthorizationDecisionReason = "allowed" | "unknown_permission" | "no_applicable_grant";

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly decisionId: string;
  readonly evaluatedAt: string;
  readonly policyVersion: "fixed-roles.v1";
  readonly reason: AuthorizationDecisionReason;
}

export interface DataScopeResolution {
  readonly decision: Readonly<AuthorizationDecision>;
  readonly scope?: Readonly<DataScope>;
}

export interface AuthorizationDecisionRecord {
  readonly action: string;
  readonly allowed: boolean;
  readonly decisionId: string;
  readonly evaluatedAt: string;
  readonly operation: "batch_check" | "check" | "resolve_data_scope";
  readonly permissionCode: string;
  readonly policyVersion: "fixed-roles.v1";
  readonly reason: AuthorizationDecisionReason;
  readonly resource: string;
  readonly selectedAssignmentId?: string;
  readonly traceId: string;
  readonly workforcePersonId: string;
}

export interface AuthorizationDecisionRecorder {
  record(record: AuthorizationDecisionRecord): Promise<void>;
}

export interface AuthorizationService {
  batchCheck(subject: AuthorizationSubjectContext, requests: readonly PermissionRequest[]): Promise<readonly Readonly<AuthorizationDecision>[]>;
  check(subject: AuthorizationSubjectContext, request: PermissionRequest): Promise<Readonly<AuthorizationDecision>>;
  requireAllowed(subject: AuthorizationSubjectContext, request: PermissionRequest): Promise<Readonly<AuthorizationDecision>>;
  resolveDataScope(subject: AuthorizationSubjectContext, request: Omit<PermissionRequest, "resourceContext">): Promise<Readonly<DataScopeResolution>>;
}
