import type { IdentitySyncFailureCode, IdentitySyncOperation, LoginIdentifierHistory, WorkforceAccessOperation, WorkforceAccessSubjectAccount, WorkforceAccount, WorkforceAccountPage, WorkforceAccountStatus } from "./types.js";

export type WorkforceAccessMutation =
  | { readonly account: WorkforceAccount; readonly identifiers: readonly LoginIdentifierHistory[]; readonly kind: "create" }
  | { readonly accountId: string; readonly expectedRevision: number; readonly identifiers: readonly LoginIdentifierHistory[]; readonly kind: "update_identifiers"; readonly phone?: string | null; readonly updatedAt: string; readonly username?: string; readonly usernameNormalized?: string | undefined }
  | { readonly accountId: string; readonly expectedRevision: number; readonly keycloakUserId: string; readonly kind: "link_keycloak"; readonly updatedAt: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "set_status"; readonly status: WorkforceAccountStatus; readonly updatedAt: string }
  | { readonly accountId: string; readonly kind: "release_phone"; readonly normalizedPhone: string; readonly releasedAt: string };

export interface WorkforceAccessCommit {
  readonly fingerprint: string;
  readonly operation: WorkforceAccessOperation;
  readonly mutation: WorkforceAccessMutation;
}

export interface WorkforceAccessStore {
  createIdentitySyncOperation(operation: IdentitySyncOperation): Promise<{ readonly replayed: boolean }>;
  commit(command: WorkforceAccessCommit): Promise<{ readonly replayed: boolean }>;
  findAccount(accountId: string): Promise<WorkforceAccount | undefined>;
  findSubjectAccountByKeycloakUserId(keycloakUserId: string): Promise<WorkforceAccessSubjectAccount | undefined>;
  findIdentifier(kind: "phone" | "username", normalizedValue: string): Promise<LoginIdentifierHistory | undefined>;
  findIdentitySyncOperation(operationId: string): Promise<IdentitySyncOperation | undefined>;
  findLatestIdentitySyncOperation(accountId: string): Promise<IdentitySyncOperation | undefined>;
  listAccounts(input: { readonly cursor?: string; readonly limit: number; readonly status?: WorkforceAccountStatus }): Promise<WorkforceAccountPage>;
  listIdentifierHistory(accountId: string): Promise<readonly LoginIdentifierHistory[]>;
  finishIdentitySyncOperation(input: Readonly<{ accountId: string; completedAt: string; errorCode?: IdentitySyncFailureCode; operationId: string; status: "failed" | "succeeded" | "superseded"; traceId: string }>): Promise<IdentitySyncOperation>;
}
