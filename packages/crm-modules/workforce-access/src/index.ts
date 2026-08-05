export { WORKFORCE_ACCESS_ERROR_CODES, WorkforceAccessError, type WorkforceAccessErrorCode } from "./errors.js";
export { InMemoryWorkforceAccessStore } from "./memory-store.js";
export { createPostgresWorkforceAccessStore, createPrismaWorkforceAccessStore, type WorkforceAccessPersistenceRuntime } from "./postgres-store.js";
export { WorkforceAccessService } from "./service.js";
export { createPasswordCredentialPort, DUMMY_PASSWORD_HASH, hashPassword, validatePassword, verifyPassword, verifyPasswordOrDummy, type LocalLoginAccount, type PasswordCredentialPort } from "./password-credentials.js";
export type { CreateWorkforceAccountCommand, LoginIdentifierHistory, ReleasePhoneCommand, SetAccountStatusCommand, UpdateLoginIdentifiersCommand, WorkforceAccessActor, WorkforceAccessAuthorizer, WorkforceAccessServiceApi, WorkforceAccount, WorkforceAccountPage, WorkforceAccountStatus } from "./types.js";
export const packageId = "@ai-crm/crm-workforce-access" as const;
