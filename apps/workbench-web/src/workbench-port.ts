export interface PlatformItem {
  id: string;
  title: string;
  status: string;
  summary: string;
  tab: "active" | "history";
  bodyMarkdown?: string;
  bodyFormat?: "plain-text" | "restricted-markdown";
  createdAt?: string;
  deepLink?: {
    applicationId: string;
    routeId: string;
    resourceId: string;
    resourceType: string;
  };
  stateVersion?: number;
}

export interface PlatformCollection {
  title: string;
  fixture: boolean;
  statuses: string[];
  items: PlatformItem[];
}

export type BootstrapResult =
  | { kind: "logged-out" }
  | { kind: "signed-out" }
  | { kind: "session-expired" }
  | { kind: "forbidden" }
  | { kind: "maintenance" }
  | {
      kind: "ready";
      fixture: boolean;
      context: {
        accountKind?: "system_administrator" | "workforce";
        assignmentReference?: string;
        displayName: string;
        sessionScope?: string;
      };
      counts: { tasks: number; notifications: number; forms: number; files: number };
      collections: Record<"tasks" | "notifications" | "forms" | "files", PlatformCollection>;
      applicationIds?: readonly string[];
      navigationIds?: readonly string[];
      workspaceProfileId?: string;
    };

export type WorkforceAccountStatus = "active" | "credential_pending" | "disabled" | "failed" | "provisioning";
export type WorkforceAccountAction = "deactivate" | "edit" | "grant_crm_administrator" | "reactivate" | "release_phone" | "reset_password" | "retry_identity_sync" | "revoke_crm_administrator" | "transfer";

export interface WorkforceIdentitySyncOperationView {
  readonly action: "disable" | "revoke_sessions" | "synchronize_login_identifiers";
  readonly completedAt?: string;
  readonly errorCode?: "eventing_handler_timeout" | "identity_sync_failed" | "keycloak_administration_unavailable" | "keycloak_entity_conflict";
  readonly operationId: string;
  readonly requestedAt: string;
  readonly retryOfOperationId?: string;
  readonly status: "failed" | "pending" | "succeeded" | "superseded";
}

export interface WorkforceAccountView {
  readonly accountId: string;
  readonly allowedActions: readonly WorkforceAccountAction[];
  readonly crmAdministrator: boolean;
  readonly departmentId?: string;
  readonly departmentName?: string;
  readonly legalName: string;
  readonly latestIdentitySync?: WorkforceIdentitySyncOperationView;
  readonly phone?: string;
  readonly positionId?: string;
  readonly positionName?: string;
  readonly releasablePhones: readonly string[];
  readonly revision: number;
  readonly status: WorkforceAccountStatus;
  readonly username: string;
}

export interface OrganizationUnitView {
  readonly allowedActions: readonly ("deactivate" | "edit" | "reactivate")[];
  readonly departmentId: string;
  readonly name: string;
  readonly parentDepartmentId?: string;
  readonly revision: number;
  readonly status: "active" | "disabled";
}

export interface PositionView {
  readonly allowedActions: readonly ("deactivate" | "edit" | "reactivate")[];
  readonly departmentId: string;
  readonly name: string;
  readonly positionId: string;
  readonly revision: number;
  readonly status: "active" | "disabled";
}

export interface WorkforceAdministrationSnapshot {
  readonly accounts: readonly WorkforceAccountView[];
  readonly departments: readonly OrganizationUnitView[];
  readonly positions: readonly PositionView[];
  readonly systemAccount?: WorkforceAccountView;
}

export interface WorkforceAccountQuery {
  readonly departmentId?: string;
  readonly legalName?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly phone?: string;
  readonly positionId?: string;
  readonly status?: WorkforceAccountStatus;
  readonly username?: string;
}

export interface WorkforceAccountPage {
  readonly items: readonly WorkforceAccountView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export type WorkforceAdministrationCommand =
  | { readonly kind: "create_account"; readonly departmentId: string; readonly initialPassword: string; readonly legalName: string; readonly phone?: string; readonly positionId: string; readonly username: string }
  | { readonly accountId: string; readonly departmentId: string; readonly expectedRevision: number; readonly kind: "update_account"; readonly legalName: string; readonly phone?: string; readonly positionId: string; readonly username: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "update_system_account"; readonly legalName: string; readonly phone?: string; readonly username: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "deactivate_account" }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "reset_password"; readonly password: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "release_phone"; readonly phone: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly failedOperationId: string; readonly kind: "retry_identity_sync" }
  | { readonly accountId: string; readonly ceremonyOperationId: string; readonly expectedRevision: number; readonly kind: "complete_credential_ceremony" }
  | { readonly accountId: string; readonly departmentId: string; readonly expectedRevision: number; readonly kind: "reactivate_account"; readonly positionId: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "set_crm_administrator"; readonly enabled: boolean }
  | { readonly departmentId: string; readonly kind: "create_department"; readonly name: string; readonly parentDepartmentId?: string }
  | { readonly departmentId: string; readonly expectedRevision: number; readonly kind: "update_department"; readonly name: string; readonly parentDepartmentId?: string | null }
  | { readonly departmentId: string; readonly expectedRevision: number; readonly kind: "deactivate_department" | "reactivate_department" }
  | { readonly departmentId: string; readonly kind: "create_position"; readonly name: string; readonly positionId: string }
  | { readonly expectedRevision: number; readonly kind: "update_position"; readonly name: string; readonly positionId: string }
  | { readonly expectedRevision: number; readonly kind: "deactivate_position" | "reactivate_position"; readonly positionId: string };

export interface WorkforceAdministrationPort {
  beginSystemAccountReauthentication?(): Promise<void>;
  execute(command: WorkforceAdministrationCommand): Promise<{ readonly credentialRedirectUrl?: string }>;
  listAccounts(query: WorkforceAccountQuery): Promise<WorkforceAccountPage>;
  load(): Promise<WorkforceAdministrationSnapshot>;
}

export interface WorkbenchPort {
  beginLogin(returnTo: string): void;
  bootstrap(): Promise<BootstrapResult>;
  logout(): Promise<{ kind: "logged-out" | "session-expired" }>;
  pollCollections?(): Promise<Readonly<Pick<Extract<BootstrapResult, { kind: "ready" }>["collections"], "tasks" | "notifications">>>;
  notificationTemplates?: import("./notification-template-port").NotificationTemplatePort;
  sessionPolicy?: import("./session-policy-port").SessionPolicyPort;
  workforceAdministration?: WorkforceAdministrationPort;
  syntheticFormEvidence?: import("./synthetic-form-evidence-page").SyntheticFormEvidencePort & {
    readonly fileReference: import("./synthetic-form-evidence-page").SyntheticFormFileReference;
    loadRelease(): Promise<import("./synthetic-form-evidence-page").SyntheticFormEvidenceRelease>;
  };
}
