import type {
  ActorReference,
  Assignment,
  DepartmentDirectoryEntry,
  DepartmentTreeNode,
  OrganizationDirectoryServiceApi,
  OrganizationServiceApi,
  PositionDirectoryEntry,
  WorkforcePersonContext,
  WorkforcePersonProfile,
} from "@ai-crm/platform-organization";
import type { AuthorizationSubjectContext, PermissionRequest } from "@ai-crm/platform-authorization";

import type { WorkforceAccountPage, WorkforceAccountQuery, WorkforceAdministrationCommand, WorkforceAdministrationSnapshot } from "../platform-http/workforce-administration-http.js";

export type AccountStatus = "active" | "credential_pending" | "disabled" | "failed" | "provisioning";
export type IdentitySyncAction = "disable" | "revoke_sessions" | "synchronize_login_identifiers";
export type IdentitySyncFailureCode = "eventing_handler_timeout" | "identity_sync_failed" | "keycloak_administration_unavailable" | "keycloak_entity_conflict";

export interface IdentitySyncOperationRecord {
  readonly accountId: string;
  readonly action: IdentitySyncAction;
  readonly completedAt?: string;
  readonly errorCode?: IdentitySyncFailureCode;
  readonly operationId: string;
  readonly requestedAt: string;
  readonly retryOfOperationId?: string;
  readonly status: "failed" | "pending" | "succeeded" | "superseded";
  readonly traceId: string;
}

export interface AccountRecord {
  readonly accountId: string;
  readonly keycloakUserId?: string | undefined;
  readonly latestIdentitySync?: IdentitySyncOperationRecord;
  readonly phone?: string | undefined;
  readonly revision: number;
  readonly status: AccountStatus;
  readonly username: string;
  readonly workforcePersonId?: string | undefined;
}

export interface LoginIdentifierHistoryRecord {
  readonly accountId: string;
  readonly kind: "phone" | "username";
  readonly normalizedValue: string;
  readonly releasedAt?: string;
  readonly value: string;
}

export interface AccountDirectoryPort {
  beginIdentitySync(command: Readonly<{ accountId: string; action: IdentitySyncAction; actor: ActorReference; operationId: string; reason: string; requestedAt: string; retryOfOperationId?: string; traceId: string }>): Promise<IdentitySyncOperationRecord>;
  createAccount(command: Readonly<{ accountId: string; actor: ActorReference; createdAt: string; operationId: string; phone?: string; reason: string; traceId: string; username: string; workforcePersonId: string }>): Promise<AccountRecord>;
  getAccount(accountId: string): Promise<AccountRecord>;
  getIdentitySyncOperation(operationId: string): Promise<IdentitySyncOperationRecord>;
  linkKeycloakUser(command: Readonly<{ accountId: string; actor: ActorReference; expectedRevision: number; keycloakUserId: string; operationId: string; reason: string; traceId: string; updatedAt: string }>): Promise<AccountRecord>;
  listAccounts(input: Readonly<{ cursor?: string; limit?: number; status?: AccountStatus }>): Promise<Readonly<{ items: readonly AccountRecord[]; nextCursor?: string | undefined }>>;
  listIdentifierHistory(accountId: string): Promise<readonly LoginIdentifierHistoryRecord[]>;
  releasePhone(command: Readonly<{ accountId: string; actor: ActorReference; operationId: string; phone: string; reason: string; releasedAt: string; traceId: string }>): Promise<void>;
  setStatus(command: Readonly<{ accountId: string; actor: ActorReference; expectedRevision: number; operationId: string; reason: string; status: AccountStatus; traceId: string; updatedAt: string }>): Promise<AccountRecord>;
  updateLoginIdentifiers(command: Readonly<{ accountId: string; actor: ActorReference; expectedRevision: number; operationId: string; phone?: string | null; reason: string; traceId: string; updatedAt: string; username?: string }>): Promise<AccountRecord>;
}

export interface AdministrationPrincipal {
  readonly actor: ActorReference;
  readonly identitySubjectId: string;
  readonly reauthenticated?: boolean;
  readonly subject: AuthorizationSubjectContext;
}

export interface AdministrationPrincipalPort {
  resolve(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<AdministrationPrincipal>>;
}

export interface AdministrationAuthorizerPort {
  requireAllowed(subject: AuthorizationSubjectContext, request: PermissionRequest): Promise<unknown>;
}

export interface CrmAdministratorGrantPort {
  hasGrant(workforcePersonId: string): Promise<boolean>;
  isSuperAdministrator(workforcePersonId: string): Promise<boolean>;
  setGrant(input: Readonly<{ actor: ActorReference; assignmentId: string; enabled: boolean; operationId: string; traceId: string; workforcePersonId: string }>): Promise<void>;
}

export interface IdentityAdministrationPort {
  createDisabledAccount(input: Readonly<{ accountId: string; operationId: string; phone?: string; traceId: string; username: string }>): Promise<Readonly<{ keycloakUserId: string }>>;
  disableAccount(input: Readonly<{ accountId: string; keycloakUserId: string; operationId: string; retryOfOperationId?: string; traceId: string }>): Promise<void>;
  revokeSessions(input: Readonly<{ accountId: string; keycloakUserId: string; operationId: string; retryOfOperationId?: string; traceId: string }>): Promise<void>;
  synchronizeLoginIdentifiers(input: Readonly<{ accountId: string; keycloakUserId: string; operationId: string; phone?: string; retryOfOperationId?: string; traceId: string; username: string }>): Promise<void>;
}

export interface CredentialCeremonyPort {
  complete(input: Readonly<{ accountId: string; keycloakUserId: string; operationId: string; operatorSubjectId: string; traceId: string }>): Promise<void>;
  start(input: Readonly<{ accountId: string; keycloakUserId: string; kind: "create" | "recover" | "reset"; operationId: string; operatorSubjectId: string; traceId: string }>): Promise<Readonly<{ redirectUrl: string }>>;
}

export interface WorkforceRecoveryPort {
  restore(input: Readonly<{ accountId: string; actor: ActorReference; departmentId: string; effectiveFrom: string; operationId: string; positionId: string; traceId: string; workforcePersonId: string }>): Promise<void>;
}

export interface AdministrationAuditPort {
  record(input: Readonly<{ action: WorkforceAdministrationCommand["kind"]; actorId: string; operationId: string; result: "succeeded"; targetId: string; traceId: string }>): Promise<void>;
}

export interface DurableAdministrationOperationPort {
  execute<T>(input: Readonly<{ fingerprint: string; operationId: string; traceId: string }>, work: () => Promise<Readonly<T>>): Promise<Readonly<{ replayed: boolean; value: Readonly<T> }>>;
}

export interface AdministrationTransactionPort {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface WorkforceAdministrationDependencies {
  readonly accounts: AccountDirectoryPort;
  readonly audit: AdministrationAuditPort;
  readonly authorization: AdministrationAuthorizerPort;
  readonly clock: () => Date;
  readonly credentialCeremonies: CredentialCeremonyPort;
  readonly crmAdministratorDepartmentId: string;
  readonly grants: CrmAdministratorGrantPort;
  readonly identity: IdentityAdministrationPort;
  readonly operations: DurableAdministrationOperationPort;
  readonly organization: Pick<OrganizationServiceApi,
    "closeAssignment" | "closeEmployment" | "createAssignment" | "createEmployment" | "createOrganizationUnit" | "createPosition" | "createWorkforcePerson" | "resolveWorkforcePersonContext">;
  readonly organizationDirectory: OrganizationDirectoryServiceApi;
  readonly principals: AdministrationPrincipalPort;
  readonly recovery: WorkforceRecoveryPort;
  readonly transactions: AdministrationTransactionPort;
}

export interface WorkforceAdministrationApplicationFacade {
  execute(input: Readonly<{ command: WorkforceAdministrationCommand; credential: string; operationId: string; traceId: string }>): Promise<Readonly<{ credentialRedirectUrl?: string; replayed: boolean }>>;
  listAccounts(input: Readonly<{ credential: string; query: WorkforceAccountQuery; traceId: string }>): Promise<Readonly<WorkforceAccountPage>>;
  load(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<WorkforceAdministrationSnapshot>>;
}

export type { Assignment, DepartmentDirectoryEntry, DepartmentTreeNode, PositionDirectoryEntry, WorkforcePersonContext, WorkforcePersonProfile };
