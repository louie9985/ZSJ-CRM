import type { DatabaseRuntime } from "@ai-crm/database";
import { WorkforceAccessError } from "./errors.js";
import type { WorkforceAccessCommit, WorkforceAccessMutation, WorkforceAccessStore } from "./store.js";
import type { IdentitySyncFailureCode, IdentitySyncOperation, LoginIdentifierHistory, WorkforceAccount, WorkforceAccountPage, WorkforceAccountStatus } from "./types.js";

export type WorkforceAccessPersistenceRuntime = Pick<DatabaseRuntime, "execute" | "withTransaction">;
interface AccountRow { account_id: string; workforce_person_id: string | null; keycloak_user_id: string | null; username: string; username_normalized: string; phone: string | null; status: WorkforceAccountStatus; revision: number; created_at: Date | string; updated_at: Date | string; sync_operation_id?: string | null; sync_action?: IdentitySyncOperation["action"] | null; sync_status?: IdentitySyncOperation["status"] | null; sync_retry_of_operation_id?: string | null; sync_error_code?: IdentitySyncFailureCode | null; sync_trace_id?: string | null; sync_requested_at?: Date | string | null; sync_completed_at?: Date | string | null }
interface IdentifierRow { identifier_id: string; account_id: string; kind: "phone" | "username"; value: string; normalized_value: string; released_at: Date | string | null }
interface IdentitySyncRow { operation_id: string; account_id: string; action: IdentitySyncOperation["action"]; status: IdentitySyncOperation["status"]; retry_of_operation_id: string | null; error_code: IdentitySyncFailureCode | null; trace_id: string; requested_at: Date | string; completed_at: Date | string | null }
const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const identitySync = (row: IdentitySyncRow): IdentitySyncOperation => ({ accountId: row.account_id, action: row.action, ...(row.completed_at ? { completedAt: iso(row.completed_at) } : {}), ...(row.error_code ? { errorCode: row.error_code } : {}), operationId: row.operation_id, requestedAt: iso(row.requested_at), ...(row.retry_of_operation_id ? { retryOfOperationId: row.retry_of_operation_id } : {}), status: row.status, traceId: row.trace_id });
const account = (row: AccountRow): WorkforceAccount => {
  const latestIdentitySync = row.sync_operation_id && row.sync_action && row.sync_status && row.sync_trace_id && row.sync_requested_at ? identitySync({ operation_id: row.sync_operation_id, account_id: row.account_id, action: row.sync_action, status: row.sync_status, retry_of_operation_id: row.sync_retry_of_operation_id ?? null, error_code: row.sync_error_code ?? null, trace_id: row.sync_trace_id, requested_at: row.sync_requested_at, completed_at: row.sync_completed_at ?? null }) : undefined;
  return { accountId: row.account_id, createdAt: iso(row.created_at), ...(row.keycloak_user_id ? { keycloakUserId: row.keycloak_user_id } : {}), ...(latestIdentitySync ? { latestIdentitySync } : {}), ...(row.phone ? { phone: row.phone } : {}), revision: row.revision, status: row.status, updatedAt: iso(row.updated_at), username: row.username, usernameNormalized: row.username_normalized, ...(row.workforce_person_id ? { workforcePersonId: row.workforce_person_id } : {}) };
};
const identifier = (row: IdentifierRow): LoginIdentifierHistory => ({ accountId: row.account_id, identifierId: row.identifier_id, kind: row.kind, normalizedValue: row.normalized_value, ...(row.released_at ? { releasedAt: iso(row.released_at) } : {}), value: row.value });
const sameIdentitySyncRequest = (left: IdentitySyncOperation, right: IdentitySyncOperation): boolean => left.accountId === right.accountId && left.action === right.action && left.operationId === right.operationId && left.requestedAt === right.requestedAt && left.retryOfOperationId === right.retryOfOperationId && left.traceId === right.traceId;
const accountSelect = "select a.*,s.operation_id sync_operation_id,s.action sync_action,s.status sync_status,s.retry_of_operation_id sync_retry_of_operation_id,s.error_code sync_error_code,s.trace_id sync_trace_id,s.requested_at sync_requested_at,s.completed_at sync_completed_at from workforce_access.accounts a left join lateral (select * from workforce_access.identity_sync_operations i where i.account_id=a.account_id order by i.requested_at desc,i.operation_id desc limit 1) s on true";

class PrismaWorkforceAccessStore implements WorkforceAccessStore {
  constructor(private readonly db: WorkforceAccessPersistenceRuntime) {}
  commit(command: WorkforceAccessCommit): Promise<{ readonly replayed: boolean }> {
    return this.db.withTransaction(async () => {
      const claimed = await this.db.execute<{ fingerprint: string }>("insert into workforce_access.operations (operation_id,account_id,fingerprint,status,trace_id,recorded_at) values ($1,$2,$3,$4,$5,$6) on conflict (operation_id) do nothing returning fingerprint", [command.operation.operationId, command.operation.accountId, command.fingerprint, command.operation.status, command.operation.traceId, command.operation.recordedAt]);
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
  async createIdentitySyncOperation(operation: IdentitySyncOperation): Promise<{ readonly replayed: boolean }> {
    try {
      const inserted = await this.db.execute("insert into workforce_access.identity_sync_operations(operation_id,account_id,action,status,retry_of_operation_id,error_code,trace_id,requested_at,completed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(operation_id) do nothing", [operation.operationId, operation.accountId, operation.action, operation.status, operation.retryOfOperationId ?? null, operation.errorCode ?? null, operation.traceId, operation.requestedAt, operation.completedAt ?? null]);
      if (inserted.rowCount === 1) return { replayed: false };
      const existing = await this.findIdentitySyncOperation(operation.operationId);
      if (existing === undefined || !sameIdentitySyncRequest(existing, operation)) throw new WorkforceAccessError("idempotency_conflict");
      return { replayed: true };
    } catch (error) { const code = (error as { code?: string }).code; if (code === "23505") throw new WorkforceAccessError("entity_conflict"); if (code === "23503") throw new WorkforceAccessError("entity_not_found"); throw error; }
  }
  async findAccount(id: string): Promise<WorkforceAccount | undefined> { const result = await this.db.execute<AccountRow>(`${accountSelect} where a.account_id=$1`, [id]); return result.rows[0] ? account(result.rows[0]) : undefined; }
  async findIdentifier(kind: "phone" | "username", value: string): Promise<LoginIdentifierHistory | undefined> { const result = await this.db.execute<IdentifierRow>("select * from workforce_access.login_identifier_history where kind=$1 and normalized_value=$2 and released_at is null order by identifier_id limit 1", [kind, value]); return result.rows[0] ? identifier(result.rows[0]) : undefined; }
  async findIdentitySyncOperation(operationId: string): Promise<IdentitySyncOperation | undefined> { const result = await this.db.execute<IdentitySyncRow>("select * from workforce_access.identity_sync_operations where operation_id=$1", [operationId]); return result.rows[0] ? identitySync(result.rows[0]) : undefined; }
  async findLatestIdentitySyncOperation(accountId: string): Promise<IdentitySyncOperation | undefined> { const result = await this.db.execute<IdentitySyncRow>("select * from workforce_access.identity_sync_operations where account_id=$1 order by requested_at desc,operation_id desc limit 1", [accountId]); return result.rows[0] ? identitySync(result.rows[0]) : undefined; }
  async listIdentifierHistory(id: string): Promise<readonly LoginIdentifierHistory[]> { const result = await this.db.execute<IdentifierRow>("select * from workforce_access.login_identifier_history where account_id=$1 order by identifier_id", [id]); return result.rows.map(identifier); }
  async listAccounts(input: { readonly cursor?: string; readonly limit: number; readonly status?: WorkforceAccountStatus }): Promise<WorkforceAccountPage> { const result = await this.db.execute<AccountRow>(`${accountSelect} where ($1::uuid is null or a.account_id>$1::uuid) and ($2::text is null or a.status=$2) order by a.account_id limit $3`, [input.cursor ?? null, input.status ?? null, input.limit + 1]); const items = result.rows.slice(0, input.limit).map(account); return { items, ...(result.rows.length > input.limit ? { nextCursor: items.at(-1)?.accountId } : {}) }; }
  async finishIdentitySyncOperation(input: Readonly<{ accountId: string; completedAt: string; errorCode?: IdentitySyncFailureCode; operationId: string; status: "failed" | "succeeded" | "superseded"; traceId: string }>): Promise<IdentitySyncOperation> {
    const updated = await this.db.execute<IdentitySyncRow>("update workforce_access.identity_sync_operations set status=$3,error_code=$4,trace_id=$5,completed_at=$6 where operation_id=$1 and account_id=$2 and status='pending' returning *", [input.operationId, input.accountId, input.status, input.errorCode ?? null, input.traceId, input.completedAt]);
    if (updated.rows[0]) return identitySync(updated.rows[0]);
    const existing = await this.findIdentitySyncOperation(input.operationId);
    if (existing === undefined || existing.accountId !== input.accountId) throw new WorkforceAccessError("entity_not_found");
    if (existing.status === input.status && existing.errorCode === input.errorCode) return existing;
    throw new WorkforceAccessError("state_transition_invalid");
  }
  async #apply(mutation: WorkforceAccessMutation): Promise<void> {
    if (mutation.kind === "create") { await this.db.execute("insert into workforce_access.accounts (account_id,workforce_person_id,username,username_normalized,phone,status,revision,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [mutation.account.accountId, mutation.account.workforcePersonId ?? null, mutation.account.username, mutation.account.usernameNormalized, mutation.account.phone ?? null, mutation.account.status, mutation.account.revision, mutation.account.createdAt, mutation.account.updatedAt]); for (const item of mutation.identifiers) await this.#insertIdentifier(item); return; }
    if (mutation.kind === "release_phone") { const result = await this.db.execute("update workforce_access.login_identifier_history set released_at=$3 where account_id=$1 and kind='phone' and normalized_value=$2 and released_at is null and not exists (select 1 from workforce_access.accounts a where a.account_id=$1 and a.phone=workforce_access.login_identifier_history.value)", [mutation.accountId, mutation.normalizedPhone, mutation.releasedAt]); if (result.rowCount !== 1) throw new WorkforceAccessError("state_transition_invalid"); return; }
    if (mutation.kind === "update_identifiers") { for (const item of mutation.identifiers) await this.#insertIdentifier(item); const result = await this.db.execute("update workforce_access.accounts set username=coalesce($3,username),username_normalized=coalesce($4,username_normalized),phone=case when $5::boolean then $6 else phone end,revision=revision+1,updated_at=$7 where account_id=$1 and revision=$2", [mutation.accountId, mutation.expectedRevision, mutation.username ?? null, mutation.usernameNormalized ?? null, mutation.phone !== undefined, mutation.phone ?? null, mutation.updatedAt]); this.#revision(result.rowCount); return; }
    const columns = mutation.kind === "link_keycloak" ? ["keycloak_user_id", mutation.keycloakUserId] as const : ["status", mutation.status] as const;
    const result = await this.db.execute(`update workforce_access.accounts set ${columns[0]}=$3,revision=revision+1,updated_at=$4 where account_id=$1 and revision=$2`, [mutation.accountId, mutation.expectedRevision, columns[1], mutation.updatedAt]); this.#revision(result.rowCount);
  }
  #revision(count: number): void { if (count !== 1) throw new WorkforceAccessError("revision_conflict"); }
  async #insertIdentifier(item: LoginIdentifierHistory): Promise<void> { await this.db.execute("insert into workforce_access.login_identifier_history (identifier_id,account_id,kind,value,normalized_value,released_at) values ($1,$2,$3,$4,$5,$6)", [item.identifierId, item.accountId, item.kind, item.value, item.normalizedValue, item.releasedAt ?? null]); }
}
export const createPrismaWorkforceAccessStore = (runtime: WorkforceAccessPersistenceRuntime): WorkforceAccessStore => new PrismaWorkforceAccessStore(runtime);
export const createPostgresWorkforceAccessStore = createPrismaWorkforceAccessStore;
