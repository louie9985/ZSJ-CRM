import { randomBytes } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";
import type { Options as Argon2Options } from "@node-rs/argon2";
import type { DatabaseRuntime } from "@ai-crm/database";

import { WorkforceAccessError } from "./errors.js";
import { normalizePhone, normalizeUsername, requireId, requireTimestamp } from "./validation.js";

const PASSWORD = /^[\x20-\x7e]{8,64}$/u;
const ARGON2_OPTIONS: Readonly<Argon2Options> = Object.freeze({
  algorithm: 2,
  memoryCost: 65_536,
  outputLen: 32,
  parallelism: 1,
  timeCost: 3,
});

export const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$YWktY3JtLWR1bW15LXYxIQ$k6uhbHENOv5p61e8KvZMw48C++qlb02EXoUW4eg9vt0";

export interface LocalLoginAccount {
  readonly accountId: string;
  readonly passwordHash: string;
  readonly securityRevision: number;
  readonly status: "active" | "disabled";
  readonly workforcePersonId: string;
}

export interface PasswordCredentialPort {
  create(input: Readonly<{ accountId: string; passwordHash: string; updatedAt: string }>): Promise<void>;
  findByAccountId(accountId: string): Promise<Readonly<LocalLoginAccount> | undefined>;
  findByIdentifier(identifier: string): Promise<Readonly<LocalLoginAccount> | undefined>;
  replace(input: Readonly<{ accountId: string; expectedSecurityRevision: number; passwordHash: string; updatedAt: string }>): Promise<Readonly<{ securityRevision: number }>>;
}

export function validatePassword(password: string): void {
  if (!PASSWORD.test(password)) throw new WorkforceAccessError("input_invalid");
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  return hash(password, { ...ARGON2_OPTIONS, salt: randomBytes(16) });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (typeof password !== "string" || password.length > 64) {
    await verify(DUMMY_PASSWORD_HASH, "invalid-password").catch(() => false);
    return false;
  }
  try { return await verify(passwordHash, password); }
  catch { return false; }
}

export async function verifyPasswordOrDummy(account: LocalLoginAccount | undefined, password: string): Promise<boolean> {
  return verifyPassword(account?.passwordHash ?? DUMMY_PASSWORD_HASH, password);
}

function normalizedIdentifiers(value: string): readonly Readonly<{ kind: "phone" | "username"; value: string }>[] {
  const identifiers: Array<Readonly<{ kind: "phone" | "username"; value: string }>> = [];
  try { identifiers.push(Object.freeze({ kind: "phone", value: normalizePhone(value) })); } catch { /* The username form may still be valid. */ }
  try { identifiers.push(Object.freeze({ kind: "username", value: normalizeUsername(value) })); } catch { /* The phone form may still be valid. */ }
  if (identifiers.length === 0) throw new WorkforceAccessError("input_invalid");
  return Object.freeze(identifiers);
}

interface LoginAccountRow {
  readonly account_id: string;
  readonly password_hash: string;
  readonly security_revision: number;
  readonly status: "active" | "disabled";
  readonly workforce_person_id: string;
}

export function createPasswordCredentialPort(database: Pick<DatabaseRuntime, "execute" | "withTransaction">, options: Readonly<{ personColumn?: string; schema?: string }> = {}): Readonly<PasswordCredentialPort> {
  const schema = options.schema ?? "workforce_access";
  const personColumn = options.personColumn ?? "workforce_person_id";
  if (!/^[a-z_]+$/u.test(schema) || !/^[a-z_]+$/u.test(personColumn)) throw new WorkforceAccessError("input_invalid");
  const find = async (clause: string, values: readonly unknown[]): Promise<Readonly<LocalLoginAccount> | undefined> => {
    const result = await database.execute<LoginAccountRow>(
      `select a.account_id,a.${personColumn} as workforce_person_id,a.status,a.security_revision,c.password_hash
         from ${schema}.accounts a
         join ${schema}.password_credentials c on c.account_id=a.account_id
        where ${clause} limit 1`,
      values,
    );
    const row = result.rows[0];
    return row === undefined ? undefined : Object.freeze({
      accountId: row.account_id,
      passwordHash: row.password_hash,
      securityRevision: row.security_revision,
      status: row.status,
      workforcePersonId: row.workforce_person_id,
    });
  };
  return Object.freeze({
    async create(input: Parameters<PasswordCredentialPort["create"]>[0]) {
      requireId(input.accountId); requireTimestamp(input.updatedAt);
      if (!input.passwordHash.startsWith("$argon2id$") || input.passwordHash.length > 1024) throw new WorkforceAccessError("input_invalid");
      try {
        await database.execute(
          `insert into ${schema}.password_credentials(account_id,password_hash,revision,updated_at) values($1,$2,0,$3)`,
          [input.accountId, input.passwordHash, input.updatedAt],
        );
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") throw new WorkforceAccessError("entity_conflict");
        if (code === "23503") throw new WorkforceAccessError("entity_not_found");
        throw error;
      }
    },
    async findByAccountId(accountId: string) {
      requireId(accountId);
      return find("a.account_id=$1", [accountId]);
    },
    async findByIdentifier(identifier: string) {
      const normalized = normalizedIdentifiers(identifier);
      const rows = await Promise.all(normalized.map((candidate) => find(
        `exists (select 1 from ${schema}.login_identifier_history i where i.account_id=a.account_id and i.kind=$1 and i.normalized_value=$2 and i.released_at is null)`,
        [candidate.kind, candidate.value],
      )));
      const matches = [...new Map(rows.flatMap((account) => account === undefined ? [] : [[account.accountId, account] as const])).values()];
      if (matches.length > 1) throw new WorkforceAccessError("input_invalid");
      return matches[0];
    },
    async replace(input: Parameters<PasswordCredentialPort["replace"]>[0]) {
      requireId(input.accountId); requireTimestamp(input.updatedAt);
      if (!Number.isSafeInteger(input.expectedSecurityRevision) || input.expectedSecurityRevision < 0 || !input.passwordHash.startsWith("$argon2id$") || input.passwordHash.length > 1024) throw new WorkforceAccessError("input_invalid");
      return database.withTransaction(async () => {
        const account = await database.execute<{ security_revision: number }>(
          `update ${schema}.accounts set security_revision=security_revision+1,revision=revision+1,updated_at=$3 where account_id=$1 and security_revision=$2 returning security_revision`,
          [input.accountId, input.expectedSecurityRevision, input.updatedAt],
        );
        const row = account.rows[0];
        if (row === undefined) throw new WorkforceAccessError("revision_conflict");
        const credential = await database.execute(
          `update ${schema}.password_credentials set password_hash=$2,revision=revision+1,updated_at=$3 where account_id=$1`,
          [input.accountId, input.passwordHash, input.updatedAt],
        );
        if (credential.rowCount !== 1) throw new WorkforceAccessError("entity_not_found");
        return Object.freeze({ securityRevision: row.security_revision });
      });
    },
  });
}
