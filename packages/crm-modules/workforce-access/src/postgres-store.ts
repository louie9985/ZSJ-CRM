import type { DatabaseRuntime } from "@ai-crm/database";

import { WorkforceAccessError } from "./errors.js";
import type { WorkforceAccessCommit, WorkforceAccessMutation, WorkforceAccessStore } from "./store.js";
import type { LoginIdentifierHistory, WorkforceAccount, WorkforceAccountPage, WorkforceAccountStatus } from "./types.js";

export type WorkforceAccessPersistenceRuntime = Pick<DatabaseRuntime, "execute" | "withTransaction">;
interface AccountRow { account_id: string; workforce_person_id: string; username: string; username_normalized: string; phone: string | null; status: WorkforceAccountStatus; revision: number; security_revision: number; created_at: Date | string; updated_at: Date | string }
interface IdentifierRow { identifier_id: string; account_id: string; kind: "phone" | "username"; value: string; normalized_value: string; released_at: Date | string | null }
const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const account = (row: AccountRow): WorkforceAccount => ({ accountId: row.account_id, createdAt: iso(row.created_at), ...(row.phone === null ? {} : { phone: row.phone }), revision: row.revision, securityRevision: row.security_revision, status: row.status, updatedAt: iso(row.updated_at), username: row.username, usernameNormalized: row.username_normalized, workforcePersonId: row.workforce_person_id });
const identifier = (row: IdentifierRow): LoginIdentifierHistory => ({ accountId: row.account_id, identifierId: row.identifier_id, kind: row.kind, normalizedValue: row.normalized_value, ...(row.released_at === null ? {} : { releasedAt: iso(row.released_at) }), value: row.value });

class PrismaWorkforceAccessStore implements WorkforceAccessStore {
  constructor(private readonly db: WorkforceAccessPersistenceRuntime) {}
  commit(command: WorkforceAccessCommit): Promise<Readonly<{ replayed: boolean }>> {
    return this.db.withTransaction(async () => {
      const claimed = await this.db.execute("insert into workforce_access.operations(operation_id,account_id,fingerprint,status,trace_id,recorded_at) values($1,$2,$3,'succeeded',$4,$5) on conflict(operation_id) do nothing", [command.operation.operationId, command.operation.accountId, command.fingerprint, command.operation.traceId, command.operation.recordedAt]);
      if (claimed.rowCount === 0) {
        const prior = await this.db.execute<{ fingerprint: string }>("select fingerprint from workforce_access.operations where operation_id=$1", [command.operation.operationId]);
        if (prior.rows[0]?.fingerprint !== command.fingerprint) throw new WorkforceAccessError("idempotency_conflict");
        return { replayed: true };
      }
      try { await this.#apply(command.mutation); }
      catch (error) { const code = (error as { code?: string }).code; if (code === "23505") throw new WorkforceAccessError("login_identifier_occupied"); if (code === "23503") throw new WorkforceAccessError("entity_not_found"); throw error; }
      return { replayed: false };
    });
  }
  async findAccount(accountId: string): Promise<WorkforceAccount | undefined> { const result = await this.db.execute<AccountRow>("select * from workforce_access.accounts where account_id=$1", [accountId]); return result.rows[0] === undefined ? undefined : account(result.rows[0]); }
  async findIdentifier(kind: "phone" | "username", normalizedValue: string): Promise<LoginIdentifierHistory | undefined> { const result = await this.db.execute<IdentifierRow>("select * from workforce_access.login_identifier_history where kind=$1 and normalized_value=$2 and released_at is null order by identifier_id limit 1", [kind, normalizedValue]); return result.rows[0] === undefined ? undefined : identifier(result.rows[0]); }
  async listIdentifierHistory(accountId: string): Promise<readonly LoginIdentifierHistory[]> { const result = await this.db.execute<IdentifierRow>("select * from workforce_access.login_identifier_history where account_id=$1 order by identifier_id", [accountId]); return result.rows.map(identifier); }
  async listAccounts(input: Readonly<{ cursor?: string; limit: number; status?: WorkforceAccountStatus }>): Promise<WorkforceAccountPage> { const result = await this.db.execute<AccountRow>("select * from workforce_access.accounts where ($1::uuid is null or account_id>$1::uuid) and ($2::text is null or status=$2) order by account_id limit $3", [input.cursor ?? null, input.status ?? null, input.limit + 1]); const items = result.rows.slice(0, input.limit).map(account); return { items, ...(result.rows.length > input.limit ? { nextCursor: items.at(-1)?.accountId } : {}) }; }
  async #apply(mutation: WorkforceAccessMutation): Promise<void> {
    if (mutation.kind === "create") {
      await this.db.execute("insert into workforce_access.accounts(account_id,workforce_person_id,username,username_normalized,phone,status,revision,security_revision,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [mutation.account.accountId, mutation.account.workforcePersonId, mutation.account.username, mutation.account.usernameNormalized, mutation.account.phone ?? null, mutation.account.status, mutation.account.revision, mutation.account.securityRevision, mutation.account.createdAt, mutation.account.updatedAt]);
      for (const item of mutation.identifiers) await this.#insertIdentifier(item); return;
    }
    if (mutation.kind === "release_phone") { const result = await this.db.execute("update workforce_access.login_identifier_history set released_at=$4 where account_id=$1 and kind='phone' and normalized_value=$2 and released_at is null and exists(select 1 from workforce_access.accounts a where a.account_id=$1 and a.revision=$3 and a.phone is distinct from workforce_access.login_identifier_history.value)", [mutation.accountId, mutation.normalizedPhone, mutation.expectedRevision, mutation.releasedAt]); if (result.rowCount !== 1) throw new WorkforceAccessError("revision_conflict"); return; }
    if (mutation.kind === "update_identifiers") {
      for (const item of mutation.identifiers) await this.#insertIdentifier(item);
      const result = await this.db.execute("update workforce_access.accounts set username=coalesce($3,username),username_normalized=coalesce($4,username_normalized),phone=case when $5::boolean then $6 else phone end,revision=revision+1,updated_at=$7 where account_id=$1 and revision=$2", [mutation.accountId, mutation.expectedRevision, mutation.username ?? null, mutation.usernameNormalized ?? null, mutation.phone !== undefined, mutation.phone ?? null, mutation.updatedAt]); this.#revision(result.rowCount); return;
    }
    const result = await this.db.execute("update workforce_access.accounts set status=$3,revision=revision+1,security_revision=security_revision+1,updated_at=$4 where account_id=$1 and revision=$2", [mutation.accountId, mutation.expectedRevision, mutation.status, mutation.updatedAt]); this.#revision(result.rowCount);
  }
  #revision(rowCount: number): void { if (rowCount !== 1) throw new WorkforceAccessError("revision_conflict"); }
  async #insertIdentifier(item: LoginIdentifierHistory): Promise<void> { await this.db.execute("insert into workforce_access.login_identifier_history(identifier_id,account_id,kind,value,normalized_value,released_at) values($1,$2,$3,$4,$5,$6)", [item.identifierId, item.accountId, item.kind, item.value, item.normalizedValue, item.releasedAt ?? null]); }
}

export const createPrismaWorkforceAccessStore = (runtime: WorkforceAccessPersistenceRuntime): WorkforceAccessStore => new PrismaWorkforceAccessStore(runtime);
export const createPostgresWorkforceAccessStore = createPrismaWorkforceAccessStore;
