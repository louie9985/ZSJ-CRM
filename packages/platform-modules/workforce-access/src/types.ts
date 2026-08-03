export type WorkforceAccountStatus = "provisioning" | "credential_pending" | "active" | "disabled" | "failed";
export type LoginIdentifierKind = "phone" | "username";
export type IdentitySyncAction = "disable" | "revoke_sessions" | "synchronize_login_identifiers";
export type IdentitySyncStatus = "failed" | "pending" | "succeeded" | "superseded";
export type IdentitySyncFailureCode = "eventing_handler_timeout" | "identity_sync_failed" | "keycloak_administration_unavailable" | "keycloak_entity_conflict";

export interface IdentitySyncOperation {
  readonly accountId: string;
  readonly action: IdentitySyncAction;
  readonly completedAt?: string;
  readonly errorCode?: IdentitySyncFailureCode;
  readonly operationId: string;
  readonly requestedAt: string;
  readonly retryOfOperationId?: string;
  readonly status: IdentitySyncStatus;
  readonly traceId: string;
}

export interface WorkforceAccessActor {
  readonly actorId: string;
  readonly actorType: "authenticated_subject" | "system";
}

export interface WorkforceAccessCommandMetadata {
  readonly actor: WorkforceAccessActor;
  readonly operationId: string;
  readonly reason: string;
  readonly traceId: string;
}

export interface WorkforceAccount {
  readonly accountId: string;
  readonly createdAt: string;
  readonly keycloakUserId?: string;
  readonly latestIdentitySync?: IdentitySyncOperation;
  readonly phone?: string | undefined;
  readonly revision: number;
  readonly status: WorkforceAccountStatus;
  readonly updatedAt: string;
  readonly username: string;
  readonly usernameNormalized: string;
  readonly workforcePersonId?: string;
}

export interface WorkforceAccessSubjectAccount {
  readonly keycloakUserId: string;
  readonly status: WorkforceAccountStatus;
  readonly workforcePersonId?: string;
}

export interface BeginIdentitySyncCommand extends WorkforceAccessCommandMetadata {
  readonly accountId: string;
  readonly action: IdentitySyncAction;
  readonly requestedAt: string;
  readonly retryOfOperationId?: string;
}

export interface FinishIdentitySyncCommand extends WorkforceAccessCommandMetadata {
  readonly accountId: string;
  readonly completedAt: string;
  readonly errorCode?: IdentitySyncFailureCode;
  readonly status: Exclude<IdentitySyncStatus, "pending">;
}

export interface LoginIdentifierHistory {
  readonly accountId: string;
  readonly identifierId: string;
  readonly kind: LoginIdentifierKind;
  readonly normalizedValue: string;
  readonly releasedAt?: string;
  readonly value: string;
}

export interface WorkforceAccessOperation {
  readonly accountId: string;
  readonly errorCode?: string;
  readonly fingerprint: string;
  readonly operationId: string;
  readonly recordedAt: string;
  readonly status: "failed" | "pending" | "succeeded";
  readonly traceId: string;
}

export interface CreateWorkforceAccountCommand extends WorkforceAccessCommandMetadata {
  readonly accountId: string;
  readonly createdAt: string;
  readonly phone?: string;
  readonly username: string;
  readonly workforcePersonId?: string;
}

export interface UpdateLoginIdentifiersCommand extends WorkforceAccessCommandMetadata {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly phone?: string | null;
  readonly updatedAt: string;
  readonly username?: string;
}

export interface SetAccountStatusCommand extends WorkforceAccessCommandMetadata {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly status: WorkforceAccountStatus;
  readonly updatedAt: string;
}

export interface LinkKeycloakUserCommand extends WorkforceAccessCommandMetadata {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly keycloakUserId: string;
  readonly updatedAt: string;
}

export interface ReleasePhoneCommand extends WorkforceAccessCommandMetadata {
  readonly accountId: string;
  readonly phone: string;
  readonly releasedAt: string;
}

export interface WorkforceAccountPage {
  readonly items: readonly WorkforceAccount[];
  readonly nextCursor?: string | undefined;
}

export interface WorkforceAccessAuthorizer {
  authorize(input: {
    readonly accountId: string;
    readonly action: "account_create" | "account_identity_update" | "account_keycloak_link" | "account_phone_release" | "account_status_update" | "identity_sync_begin" | "identity_sync_result_record";
    readonly actor: WorkforceAccessActor;
    readonly operationId: string;
  }): Promise<void>;
}

export interface WorkforceAccessServiceApi {
  beginIdentitySync(command: BeginIdentitySyncCommand): Promise<IdentitySyncOperation>;
  createAccount(command: CreateWorkforceAccountCommand): Promise<WorkforceAccount>;
  getAccount(accountId: string): Promise<WorkforceAccount>;
  getIdentitySyncOperation(operationId: string): Promise<IdentitySyncOperation>;
  getSubjectAccountByKeycloakUserId(keycloakUserId: string): Promise<WorkforceAccessSubjectAccount>;
  linkKeycloakUser(command: LinkKeycloakUserCommand): Promise<WorkforceAccount>;
  listAccounts(input: { readonly cursor?: string; readonly limit?: number; readonly status?: WorkforceAccountStatus }): Promise<WorkforceAccountPage>;
  listIdentifierHistory(accountId: string): Promise<readonly LoginIdentifierHistory[]>;
  finishIdentitySync(command: FinishIdentitySyncCommand): Promise<IdentitySyncOperation>;
  releasePhone(command: ReleasePhoneCommand): Promise<void>;
  setStatus(command: SetAccountStatusCommand): Promise<WorkforceAccount>;
  updateLoginIdentifiers(command: UpdateLoginIdentifiersCommand): Promise<WorkforceAccount>;
}
