import { WorkforceAccessError } from "./errors.js";
import type { WorkforceAccessCommit, WorkforceAccessStore } from "./store.js";
import type { IdentitySyncFailureCode, IdentitySyncOperation, LoginIdentifierHistory, WorkforceAccount, WorkforceAccountPage, WorkforceAccountStatus } from "./types.js";

export class InMemoryWorkforceAccessStore implements WorkforceAccessStore {
  readonly #accounts = new Map<string, WorkforceAccount>();
  readonly #identifiers = new Map<string, LoginIdentifierHistory>();
  readonly #identitySyncOperations = new Map<string, IdentitySyncOperation>();
  readonly #operations = new Map<string, string>();

  commit(command: WorkforceAccessCommit): Promise<{ readonly replayed: boolean }> {
    const previous = this.#operations.get(command.operation.operationId);
    if (previous !== undefined) {
      if (previous !== command.fingerprint) throw new WorkforceAccessError("idempotency_conflict");
      return Promise.resolve({ replayed: true });
    }
    const accounts = new Map(this.#accounts);
    const identifiers = new Map(this.#identifiers);
    this.#apply(command, accounts, identifiers);
    this.#accounts.clear(); accounts.forEach((value, key) => this.#accounts.set(key, value));
    this.#identifiers.clear(); identifiers.forEach((value, key) => this.#identifiers.set(key, value));
    this.#operations.set(command.operation.operationId, command.fingerprint);
    return Promise.resolve({ replayed: false });
  }

  createIdentitySyncOperation(operation: IdentitySyncOperation): Promise<{ readonly replayed: boolean }> {
    const existing = this.#identitySyncOperations.get(operation.operationId);
    if (existing !== undefined) {
      if (existing.accountId !== operation.accountId || existing.action !== operation.action || existing.operationId !== operation.operationId || existing.requestedAt !== operation.requestedAt || existing.retryOfOperationId !== operation.retryOfOperationId || existing.traceId !== operation.traceId) throw new WorkforceAccessError("idempotency_conflict");
      return Promise.resolve({ replayed: true });
    }
    if (!this.#accounts.has(operation.accountId)) throw new WorkforceAccessError("entity_not_found");
    if (operation.retryOfOperationId !== undefined && [...this.#identitySyncOperations.values()].some((item) => item.retryOfOperationId === operation.retryOfOperationId)) throw new WorkforceAccessError("entity_conflict");
    this.#identitySyncOperations.set(operation.operationId, operation);
    return Promise.resolve({ replayed: false });
  }
  findAccount(accountId: string): Promise<WorkforceAccount | undefined> {
    const account = this.#accounts.get(accountId);
    if (account === undefined) return Promise.resolve(undefined);
    const latestIdentitySync = this.#latest(accountId);
    return Promise.resolve({ ...account, ...(latestIdentitySync === undefined ? {} : { latestIdentitySync }) });
  }
  findIdentifier(kind: "phone" | "username", normalizedValue: string): Promise<LoginIdentifierHistory | undefined> {
    return Promise.resolve([...this.#identifiers.values()].find((item) => item.kind === kind && item.normalizedValue === normalizedValue && !item.releasedAt));
  }
  findIdentitySyncOperation(operationId: string): Promise<IdentitySyncOperation | undefined> { return Promise.resolve(this.#identitySyncOperations.get(operationId)); }
  findLatestIdentitySyncOperation(accountId: string): Promise<IdentitySyncOperation | undefined> { return Promise.resolve(this.#latest(accountId)); }
  finishIdentitySyncOperation(input: Readonly<{ accountId: string; completedAt: string; errorCode?: IdentitySyncFailureCode; operationId: string; status: "failed" | "succeeded" | "superseded"; traceId: string }>): Promise<IdentitySyncOperation> {
    const existing = this.#identitySyncOperations.get(input.operationId);
    if (existing === undefined || existing.accountId !== input.accountId) throw new WorkforceAccessError("entity_not_found");
    if (existing.status !== "pending") {
      if (existing.status === input.status && existing.errorCode === input.errorCode) return Promise.resolve(existing);
      throw new WorkforceAccessError("state_transition_invalid");
    }
    const completed = Object.freeze({ ...existing, completedAt: input.completedAt, ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }), status: input.status, traceId: input.traceId });
    this.#identitySyncOperations.set(input.operationId, completed);
    return Promise.resolve(completed);
  }
  listIdentifierHistory(accountId: string): Promise<readonly LoginIdentifierHistory[]> {
    return Promise.resolve([...this.#identifiers.values()].filter((item) => item.accountId === accountId));
  }
  listAccounts(input: { readonly cursor?: string; readonly limit: number; readonly status?: WorkforceAccountStatus }): Promise<WorkforceAccountPage> {
    const rows = [...this.#accounts.values()].map((item) => {
      const latestIdentitySync = this.#latest(item.accountId);
      return { ...item, ...(latestIdentitySync === undefined ? {} : { latestIdentitySync }) };
    }).filter((item) => !input.status || item.status === input.status)
      .sort((a, b) => a.accountId.localeCompare(b.accountId)).filter((item) => !input.cursor || item.accountId > input.cursor);
    const items = rows.slice(0, input.limit);
    return Promise.resolve({ items, ...(rows.length > input.limit ? { nextCursor: items.at(-1)?.accountId } : {}) });
  }

  #latest(accountId: string): IdentitySyncOperation | undefined {
    return [...this.#identitySyncOperations.values()].filter((item) => item.accountId === accountId)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt) || right.operationId.localeCompare(left.operationId))[0];
  }

  #apply(command: WorkforceAccessCommit, accounts: Map<string, WorkforceAccount>, identifiers: Map<string, LoginIdentifierHistory>): void {
    const mutation = command.mutation;
    if (mutation.kind === "create") {
      if (accounts.has(mutation.account.accountId)) throw new WorkforceAccessError("entity_conflict");
      for (const item of mutation.identifiers) this.#occupy(identifiers, item);
      accounts.set(mutation.account.accountId, mutation.account);
      return;
    }
    const account = accounts.get(mutation.accountId);
    if (!account) throw new WorkforceAccessError("entity_not_found");
    if (mutation.kind === "release_phone") {
      const entry = [...identifiers.entries()].find(([, item]) => item.kind === "phone" && item.normalizedValue === mutation.normalizedPhone && !item.releasedAt);
      if (!entry) throw new WorkforceAccessError("entity_not_found");
      const [identifierKey, identifier] = entry;
      if (identifier.accountId !== mutation.accountId || identifier.releasedAt) throw new WorkforceAccessError("entity_not_found");
      if (account.phone === identifier.value) throw new WorkforceAccessError("state_transition_invalid");
      identifiers.set(identifierKey, { ...identifier, releasedAt: mutation.releasedAt });
      return;
    }
    if (account.revision !== mutation.expectedRevision) throw new WorkforceAccessError("revision_conflict");
    if (mutation.kind === "update_identifiers") {
      for (const item of mutation.identifiers) this.#occupy(identifiers, item);
      accounts.set(account.accountId, { ...account, ...(mutation.username ? { username: mutation.username, usernameNormalized: mutation.usernameNormalized ?? account.usernameNormalized } : {}), ...(mutation.phone === undefined ? {} : { phone: mutation.phone ?? undefined }), revision: account.revision + 1, updatedAt: mutation.updatedAt });
    }
    if (mutation.kind === "link_keycloak") accounts.set(account.accountId, { ...account, keycloakUserId: mutation.keycloakUserId, revision: account.revision + 1, updatedAt: mutation.updatedAt });
    if (mutation.kind === "set_status") accounts.set(account.accountId, { ...account, status: mutation.status, revision: account.revision + 1, updatedAt: mutation.updatedAt });
  }

  #occupy(identifiers: Map<string, LoginIdentifierHistory>, item: LoginIdentifierHistory): void {
    const matches = [...identifiers.values()].filter((existing) => existing.kind === item.kind && existing.normalizedValue === item.normalizedValue);
    if (matches.some((existing) => !existing.releasedAt) || (item.kind === "username" && matches.length > 0)) throw new WorkforceAccessError("login_identifier_occupied");
    identifiers.set(item.identifierId, item);
  }
}
