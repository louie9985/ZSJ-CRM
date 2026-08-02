import { createHash } from "node:crypto";
import { WorkforceAccessError } from "./errors.js";
import type { WorkforceAccessCommit, WorkforceAccessMutation, WorkforceAccessStore } from "./store.js";
import type {
  BeginIdentitySyncCommand, CreateWorkforceAccountCommand, FinishIdentitySyncCommand, IdentitySyncFailureCode, IdentitySyncOperation, LinkKeycloakUserCommand, LoginIdentifierHistory, ReleasePhoneCommand,
  SetAccountStatusCommand, UpdateLoginIdentifiersCommand, WorkforceAccessAuthorizer, WorkforceAccessCommandMetadata,
  WorkforceAccessServiceApi, WorkforceAccount, WorkforceAccountPage, WorkforceAccountStatus,
} from "./types.js";
import { normalizePhone, normalizeUsername, requireId, requireText, requireTimestamp } from "./validation.js";

const transitions: Readonly<Record<WorkforceAccountStatus, readonly WorkforceAccountStatus[]>> = {
  active: ["disabled", "failed"],
  credential_pending: ["active", "disabled", "failed"],
  disabled: ["credential_pending", "active"],
  failed: ["provisioning", "disabled"],
  provisioning: ["credential_pending", "disabled", "failed"],
};
const identitySyncFailures = new Set<IdentitySyncFailureCode>(["eventing_handler_timeout", "identity_sync_failed", "keycloak_administration_unavailable", "keycloak_entity_conflict"]);

export class WorkforceAccessService implements WorkforceAccessServiceApi {
  constructor(private readonly store: WorkforceAccessStore, private readonly authorizer: WorkforceAccessAuthorizer) {}

  async beginIdentitySync(command: BeginIdentitySyncCommand): Promise<IdentitySyncOperation> {
    this.#metadata(command); requireId(command.accountId); requireTimestamp(command.requestedAt);
    await this.getAccount(command.accountId);
    if (command.retryOfOperationId !== undefined) {
      requireId(command.retryOfOperationId);
      if (command.retryOfOperationId === command.operationId) throw new WorkforceAccessError("input_invalid");
      const prior = await this.getIdentitySyncOperation(command.retryOfOperationId);
      if (prior.accountId !== command.accountId || prior.action !== command.action || prior.status !== "failed") throw new WorkforceAccessError("state_transition_invalid");
    }
    await this.#authorize(command, command.accountId, "identity_sync_begin");
    const operation = Object.freeze({ accountId: command.accountId, action: command.action, operationId: command.operationId, requestedAt: command.requestedAt, ...(command.retryOfOperationId === undefined ? {} : { retryOfOperationId: command.retryOfOperationId }), status: "pending" as const, traceId: command.traceId });
    await this.store.createIdentitySyncOperation(operation);
    return this.getIdentitySyncOperation(command.operationId);
  }

  async createAccount(command: CreateWorkforceAccountCommand): Promise<WorkforceAccount> {
    this.#metadata(command); requireId(command.accountId); requireTimestamp(command.createdAt);
    if (command.workforcePersonId) requireId(command.workforcePersonId);
    const usernameNormalized = normalizeUsername(command.username);
    const phone = command.phone === undefined ? undefined : normalizePhone(command.phone);
    await this.#authorize(command, command.accountId, "account_create");
    const account: WorkforceAccount = {
      accountId: command.accountId, createdAt: command.createdAt, ...(phone ? { phone } : {}), revision: 0,
      status: "provisioning", updatedAt: command.createdAt, username: command.username,
      usernameNormalized, ...(command.workforcePersonId ? { workforcePersonId: command.workforcePersonId } : {}),
    };
    const identifiers = [this.#identifier(account.accountId, "username", command.username, usernameNormalized, command.operationId),
      ...(phone ? [this.#identifier(account.accountId, "phone", phone, phone, command.operationId)] : [])];
    await this.#commit(command, account, { account, identifiers, kind: "create" });
    return this.getAccount(command.accountId);
  }

  async getAccount(accountId: string): Promise<WorkforceAccount> {
    requireId(accountId); const account = await this.store.findAccount(accountId);
    if (!account) throw new WorkforceAccessError("entity_not_found"); return account;
  }

  async getIdentitySyncOperation(operationId: string): Promise<IdentitySyncOperation> {
    requireId(operationId); const operation = await this.store.findIdentitySyncOperation(operationId);
    if (!operation) throw new WorkforceAccessError("entity_not_found"); return operation;
  }

  async finishIdentitySync(command: FinishIdentitySyncCommand): Promise<IdentitySyncOperation> {
    this.#metadata(command); requireId(command.accountId); requireTimestamp(command.completedAt);
    const operation = await this.getIdentitySyncOperation(command.operationId);
    if (operation.accountId !== command.accountId) throw new WorkforceAccessError("entity_not_found");
    if (command.status === "failed") {
      if (command.errorCode === undefined || !identitySyncFailures.has(command.errorCode)) throw new WorkforceAccessError("input_invalid");
    } else if (command.errorCode !== undefined) throw new WorkforceAccessError("input_invalid");
    await this.#authorize(command, command.accountId, "identity_sync_result_record");
    return this.store.finishIdentitySyncOperation({ accountId: command.accountId, completedAt: command.completedAt, ...(command.errorCode === undefined ? {} : { errorCode: command.errorCode }), operationId: command.operationId, status: command.status, traceId: command.traceId });
  }


  listAccounts(input: { readonly cursor?: string; readonly limit?: number; readonly status?: WorkforceAccountStatus }): Promise<WorkforceAccountPage> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new WorkforceAccessError("input_invalid");
    if (input.cursor) requireId(input.cursor);
    return this.store.listAccounts({ ...input, limit });
  }

  async listIdentifierHistory(accountId: string): Promise<readonly LoginIdentifierHistory[]> {
    await this.getAccount(accountId); return this.store.listIdentifierHistory(accountId);
  }

  async updateLoginIdentifiers(command: UpdateLoginIdentifiersCommand): Promise<WorkforceAccount> {
    this.#metadata(command); requireId(command.accountId); requireTimestamp(command.updatedAt);
    if (!Number.isInteger(command.expectedRevision) || command.expectedRevision < 0) throw new WorkforceAccessError("input_invalid");
    if (command.username === undefined && command.phone === undefined) throw new WorkforceAccessError("input_invalid");
    const existing = await this.getAccount(command.accountId);
    const usernameNormalized = command.username === undefined ? undefined : normalizeUsername(command.username);
    const phone = command.phone === undefined || command.phone === null ? command.phone : normalizePhone(command.phone);
    await this.#authorize(command, command.accountId, "account_identity_update");
    const identifiers: LoginIdentifierHistory[] = [];
    if (command.username && usernameNormalized !== existing.usernameNormalized) identifiers.push(this.#identifier(command.accountId, "username", command.username, normalizeUsername(command.username), command.operationId));
    if (phone && phone !== existing.phone) identifiers.push(this.#identifier(command.accountId, "phone", phone, phone, command.operationId));
    await this.#commit(command, existing, { accountId: command.accountId, expectedRevision: command.expectedRevision, identifiers, kind: "update_identifiers", ...(command.username === undefined ? {} : { username: command.username, usernameNormalized }), ...(phone === undefined ? {} : { phone }), updatedAt: command.updatedAt });
    return this.getAccount(command.accountId);
  }

  async linkKeycloakUser(command: LinkKeycloakUserCommand): Promise<WorkforceAccount> {
    this.#metadata(command); requireId(command.accountId); requireId(command.keycloakUserId); requireTimestamp(command.updatedAt);
    const existing = await this.getAccount(command.accountId);
    await this.#authorize(command, command.accountId, "account_keycloak_link");
    await this.#commit(command, existing, { accountId: command.accountId, expectedRevision: command.expectedRevision, keycloakUserId: command.keycloakUserId, kind: "link_keycloak", updatedAt: command.updatedAt });
    return this.getAccount(command.accountId);
  }

  async setStatus(command: SetAccountStatusCommand): Promise<WorkforceAccount> {
    this.#metadata(command); requireId(command.accountId); requireTimestamp(command.updatedAt);
    const existing = await this.getAccount(command.accountId);
    if (existing.status !== command.status && !transitions[existing.status].includes(command.status)) throw new WorkforceAccessError("state_transition_invalid");
    await this.#authorize(command, command.accountId, "account_status_update");
    await this.#commit(command, existing, { accountId: command.accountId, expectedRevision: command.expectedRevision, kind: "set_status", status: command.status, updatedAt: command.updatedAt });
    return this.getAccount(command.accountId);
  }

  async releasePhone(command: ReleasePhoneCommand): Promise<void> {
    this.#metadata(command); requireId(command.accountId); requireTimestamp(command.releasedAt);
    const normalizedPhone = normalizePhone(command.phone); const existing = await this.getAccount(command.accountId);
    await this.#authorize(command, command.accountId, "account_phone_release");
    await this.#commit(command, existing, { accountId: command.accountId, kind: "release_phone", normalizedPhone, releasedAt: command.releasedAt });
  }

  async #authorize(command: WorkforceAccessCommandMetadata, accountId: string, action: Parameters<WorkforceAccessAuthorizer["authorize"]>[0]["action"]): Promise<void> {
    await this.authorizer.authorize({ accountId, action, actor: command.actor, operationId: command.operationId });
  }
  async #commit(command: WorkforceAccessCommandMetadata, account: WorkforceAccount, mutation: WorkforceAccessMutation): Promise<void> {
    const { operationId, traceId, ...request } = command;
    void operationId; void traceId;
    const fingerprint = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    const commit: WorkforceAccessCommit = { fingerprint, mutation, operation: { accountId: account.accountId, fingerprint, operationId: command.operationId, recordedAt: "updatedAt" in mutation ? mutation.updatedAt : "releasedAt" in mutation ? mutation.releasedAt : account.createdAt, status: "succeeded", traceId: command.traceId } };
    await this.store.commit(commit);
  }
  #identifier(accountId: string, kind: "phone" | "username", value: string, normalizedValue: string, operationId: string): LoginIdentifierHistory {
    const hex = createHash("sha256").update(`${operationId}:${kind}:${normalizedValue}`).digest("hex");
    const identifierId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    return { accountId, identifierId, kind, normalizedValue, value };
  }
  #metadata(command: WorkforceAccessCommandMetadata): void {
    requireId(command.operationId); requireText(command.actor.actorId); requireText(command.reason, 500); requireText(command.traceId, 128);
  }
}
