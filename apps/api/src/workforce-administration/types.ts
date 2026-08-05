import type {
  ActorReference,
  DepartmentTreeNode,
  OrganizationDirectoryServiceApi,
  OrganizationServiceApi,
  WorkforcePersonContext,
} from "@ai-crm/crm-organization";
import type {
  AuthorizationSubjectContext,
  FixedRoleGrantStore,
  PermissionRequest,
} from "@ai-crm/crm-authorization";
import type {
  LoginIdentifierHistory,
  PasswordCredentialPort,
  WorkforceAccessServiceApi,
  WorkforceAccount,
} from "@ai-crm/crm-workforce-access";

import type {
  WorkforceAccountPage,
  WorkforceAccountQuery,
  WorkforceAdministrationCommand,
  WorkforceAdministrationSnapshot,
} from "../platform-http/workforce-administration-http.js";

export type AccountRecord = WorkforceAccount;
export type LoginIdentifierHistoryRecord = LoginIdentifierHistory;
export type AccountDirectoryPort = Pick<WorkforceAccessServiceApi,
  "createAccount" | "getAccount" | "listAccounts" | "listIdentifierHistory" | "releasePhone" | "setStatus" | "updateLoginIdentifiers">;

export interface AdministrationPrincipal {
  readonly actor: ActorReference & Readonly<{ assignmentId?: string }>;
  readonly accountId: string;
  readonly reauthenticated: boolean;
  readonly subject: AuthorizationSubjectContext;
}

export interface AdministrationPrincipalPort {
  resolve(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<AdministrationPrincipal>>;
}

export interface AdministrationAuthorizerPort {
  requireAllowed(subject: AuthorizationSubjectContext, request: PermissionRequest): Promise<unknown>;
}

export interface AdministrationAuditPort {
  record(input: Readonly<{
    action: WorkforceAdministrationCommand["kind"];
    actorId: string;
    operationId: string;
    result: "succeeded";
    targetId: string;
    traceId: string;
  }>): Promise<void>;
}

export interface DurableAdministrationOperationPort {
  execute<T extends Readonly<Record<string, unknown>>>(
    input: Readonly<{ fingerprint: string; operationId: string; traceId: string }>,
    work: () => Promise<Readonly<T>>,
  ): Promise<Readonly<{ replayed: boolean; value: Readonly<T> }>>;
}

export interface AdministrationTransactionPort {
  lockSystemAdministratorSet(): Promise<void>;
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface WorkforceAdministrationDependencies {
  readonly accounts: AccountDirectoryPort;
  readonly audit: AdministrationAuditPort;
  readonly authorization: AdministrationAuthorizerPort;
  readonly clock: () => Date;
  readonly credentials: PasswordCredentialPort;
  readonly operations: DurableAdministrationOperationPort;
  readonly organization: Pick<OrganizationServiceApi,
    "closeAssignment" | "closeEmployment" | "createAssignment" | "createEmployment" |
    "createOrganizationUnit" | "createPosition" | "createWorkforcePerson" | "resolveWorkforcePersonContext">;
  readonly organizationDirectory: OrganizationDirectoryServiceApi;
  readonly principals: AdministrationPrincipalPort;
  readonly roles: FixedRoleGrantStore;
  readonly transactions: AdministrationTransactionPort;
}

export interface WorkforceAdministrationApplicationFacade {
  execute(input: Readonly<{
    command: WorkforceAdministrationCommand;
    credential: string;
    operationId: string;
    traceId: string;
  }>): Promise<Readonly<{ replayed: boolean }>>;
  listAccounts(input: Readonly<{
    credential: string;
    query: WorkforceAccountQuery;
    traceId: string;
  }>): Promise<Readonly<WorkforceAccountPage>>;
  load(input: Readonly<{
    credential: string;
    traceId: string;
  }>): Promise<Readonly<WorkforceAdministrationSnapshot>>;
}

export type { DepartmentTreeNode, WorkforcePersonContext };
