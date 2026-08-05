import { WorkforceAccessError } from "./errors.js";
import type { WorkforceAccessCommit, WorkforceAccessStore } from "./store.js";
import type { LoginIdentifierHistory, WorkforceAccount, WorkforceAccountPage, WorkforceAccountStatus } from "./types.js";

export class InMemoryWorkforceAccessStore implements WorkforceAccessStore {
  readonly #accounts = new Map<string, WorkforceAccount>(); readonly #identifiers = new Map<string, LoginIdentifierHistory>(); readonly #operations = new Map<string, string>();
  commit(command: WorkforceAccessCommit): Promise<Readonly<{ replayed: boolean }>> {
    const prior = this.#operations.get(command.operation.operationId); if (prior !== undefined) { if (prior !== command.fingerprint) throw new WorkforceAccessError("idempotency_conflict"); return Promise.resolve({ replayed: true }); }
    const accounts = new Map(this.#accounts); const identifiers = new Map(this.#identifiers); const mutation = command.mutation;
    if (mutation.kind === "create") {
      if (accounts.has(mutation.account.accountId) || [...accounts.values()].some(({ workforcePersonId }) => workforcePersonId === mutation.account.workforcePersonId)) throw new WorkforceAccessError("entity_conflict");
      for (const item of mutation.identifiers) this.#occupy(identifiers, item); accounts.set(mutation.account.accountId, mutation.account);
    } else {
      const current = accounts.get(mutation.accountId); if (current === undefined) throw new WorkforceAccessError("entity_not_found");
      if (mutation.kind === "release_phone") {
        if (current.revision !== mutation.expectedRevision) throw new WorkforceAccessError("revision_conflict");
        const entry = [...identifiers.entries()].find(([, item]) => item.accountId === mutation.accountId && item.kind === "phone" && item.normalizedValue === mutation.normalizedPhone && item.releasedAt === undefined);
        if (entry === undefined || current.phone === entry[1].value) throw new WorkforceAccessError("state_transition_invalid"); identifiers.set(entry[0], { ...entry[1], releasedAt: mutation.releasedAt });
      } else {
        if (current.revision !== mutation.expectedRevision) throw new WorkforceAccessError("revision_conflict");
        if (mutation.kind === "update_identifiers") { for (const item of mutation.identifiers) this.#occupy(identifiers, item); accounts.set(current.accountId, { ...current, ...(mutation.username === undefined ? {} : { username: mutation.username, usernameNormalized: mutation.usernameNormalized ?? current.usernameNormalized }), ...(mutation.phone === undefined ? {} : { phone: mutation.phone ?? undefined }), revision: current.revision + 1, updatedAt: mutation.updatedAt }); }
        else accounts.set(current.accountId, { ...current, securityRevision: current.securityRevision + 1, status: mutation.status, revision: current.revision + 1, updatedAt: mutation.updatedAt });
      }
    }
    this.#accounts.clear(); accounts.forEach((value, key) => this.#accounts.set(key, value)); this.#identifiers.clear(); identifiers.forEach((value, key) => this.#identifiers.set(key, value)); this.#operations.set(command.operation.operationId, command.fingerprint); return Promise.resolve({ replayed: false });
  }
  findAccount(accountId: string): Promise<WorkforceAccount | undefined> { return Promise.resolve(this.#accounts.get(accountId)); }
  findIdentifier(kind: "phone" | "username", normalizedValue: string): Promise<LoginIdentifierHistory | undefined> { return Promise.resolve([...this.#identifiers.values()].find((item) => item.kind === kind && item.normalizedValue === normalizedValue && item.releasedAt === undefined)); }
  listIdentifierHistory(accountId: string): Promise<readonly LoginIdentifierHistory[]> { return Promise.resolve([...this.#identifiers.values()].filter((item) => item.accountId === accountId)); }
  listAccounts(input: Readonly<{ cursor?: string; limit: number; status?: WorkforceAccountStatus }>): Promise<WorkforceAccountPage> { const rows = [...this.#accounts.values()].filter((item) => input.status === undefined || item.status === input.status).sort((a, b) => a.accountId.localeCompare(b.accountId)).filter((item) => input.cursor === undefined || item.accountId > input.cursor); const items = rows.slice(0, input.limit); return Promise.resolve({ items, ...(rows.length > input.limit ? { nextCursor: items.at(-1)?.accountId } : {}) }); }
  #occupy(identifiers: Map<string, LoginIdentifierHistory>, item: LoginIdentifierHistory): void { const matches = [...identifiers.values()].filter((existing) => existing.kind === item.kind && existing.normalizedValue === item.normalizedValue); if (matches.some(({ releasedAt }) => releasedAt === undefined) || (item.kind === "username" && matches.length > 0)) throw new WorkforceAccessError("login_identifier_occupied"); identifiers.set(item.identifierId, item); }
}
