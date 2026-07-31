import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { validateDatabaseConfig, type DatabaseConfig } from "./config.js";
import type { DatabaseHealth, DatabaseQueryResult, DatabaseRuntime } from "./runtime.js";

interface RawClient {
  $executeRaw(query: Prisma.Sql): Promise<number>;
  $queryRaw<Result = unknown>(query: Prisma.Sql): Promise<Result>;
}

interface TransactionState {
  readonly client: RawClient;
  aborted: boolean;
  failure?: Error;
}

export class DatabasePersistenceError extends Error {
  constructor(public readonly code: string) {
    super("The database operation failed.");
    this.name = "DatabasePersistenceError";
  }
}

export interface PrismaPersistenceRuntime extends DatabaseRuntime {
  readonly implementation: "prisma";
  readonly queryInterruptionSupport: false;
}

export class PrismaDatabaseRuntime implements PrismaPersistenceRuntime {
  public readonly implementation = "prisma" as const;
  public readonly queryInterruptionSupport = false as const;
  readonly #client: PrismaClient;
  readonly #transaction = new AsyncLocalStorage<TransactionState>();

  constructor(config: DatabaseConfig, client?: PrismaClient) {
    const valid = validateDatabaseConfig(config);
    this.#client = client ?? new PrismaClient({
      adapter: new PrismaPg({
        application_name: valid.applicationName,
        connectionString: valid.connectionString,
        connectionTimeoutMillis: valid.connectionTimeoutMs,
        idleTimeoutMillis: valid.idleTimeoutMs,
        max: valid.maxConnections,
        statement_timeout: valid.statementTimeoutMs,
      }),
    });
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }

  async execute<Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = [], signal?: AbortSignal): Promise<DatabaseQueryResult<Row>> {
    signal?.throwIfAborted();
    const state = this.#transaction.getStore();
    if (state?.aborted) throw abortError();
    const abort = (): void => { if (state) state.aborted = true; };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const client = state?.client ?? this.#client;
      const query = compileParameterizedSql(sql, values);
      if (returnsRows(sql)) {
        const rows = await client.$queryRaw<Row[]>(query);
        signal?.throwIfAborted();
        if (state?.aborted) throw abortError();
        return { rowCount: rows.length, rows };
      }
      const rowCount = await client.$executeRaw(query);
      signal?.throwIfAborted();
      if (state?.aborted) throw abortError();
      return { rowCount, rows: [] };
    } catch (error) {
      const normalized = normalizePrismaError(error, true);
      if (state && normalized.name !== "AbortError") state.failure ??= normalized;
      throw normalized;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  async healthCheck(): Promise<DatabaseHealth> {
    const started = performance.now();
    try {
      await this.#client.$queryRaw(Prisma.sql`select 1`);
      return { latencyMs: performance.now() - started, status: "ready" };
    } catch {
      return { latencyMs: performance.now() - started, status: "unavailable" };
    }
  }

  async withTransaction<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const current = this.#transaction.getStore();
    try {
      if (current) return await this.#nestedTransaction(current, work, signal);
      return await this.#client.$transaction(async (client) => {
        const state: TransactionState = { aborted: false, client };
        return this.#transaction.run(state, async () => {
          const abort = (): void => { state.aborted = true; };
          signal?.addEventListener("abort", abort, { once: true });
          try {
            const result = await work();
            signal?.throwIfAborted();
            if (state.aborted) throw abortError();
            if (state.failure) throw state.failure;
            return result;
          } finally {
            signal?.removeEventListener("abort", abort);
          }
        });
      });
    } catch (error) {
      throw normalizePrismaError(error);
    }
  }

  async #nestedTransaction<T>(state: TransactionState, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (state.aborted) throw abortError();
    if (signal?.aborted === true) {
      state.aborted = true;
      signal.throwIfAborted();
    }
    const abort = (): void => { state.aborted = true; };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const result = await work();
      signal?.throwIfAborted();
      if (state.aborted) throw abortError();
      return result;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }
}

export function compileParameterizedSql(sql: string, values: readonly unknown[]): Prisma.Sql {
  const strings: string[] = [];
  const parameters: unknown[] = [];
  let offset = 0;
  let maximumIndex = 0;
  for (const placeholder of parameterPlaceholders(sql)) {
    const index = placeholder.index;
    if (index < 1 || index > values.length) throw new Error(`SQL placeholder $${String(index)} has no binding.`);
    strings.push(sql.slice(offset, placeholder.start));
    parameters.push(values[index - 1]);
    offset = placeholder.end;
    maximumIndex = Math.max(maximumIndex, index);
  }
  if (values.length !== maximumIndex) throw new Error(`SQL has ${String(values.length)} bindings but requires ${String(maximumIndex)}.`);
  strings.push(sql.slice(offset));
  const template = strings as unknown as TemplateStringsArray;
  Object.defineProperty(template, "raw", { value: [...strings] });
  return Prisma.sql(template, ...parameters);
}

interface ParameterPlaceholder {
  readonly start: number;
  readonly end: number;
  readonly index: number;
}

/**
 * Finds PostgreSQL positional parameters without rewriting literals, quoted
 * identifiers, comments, or dollar-quoted function bodies. This keeps the
 * legacy `execute(sql, values)` contract parameterized when it is executed
 * through Prisma's safe raw-query API.
 */
function parameterPlaceholders(sql: string): readonly ParameterPlaceholder[] {
  const placeholders: ParameterPlaceholder[] = [];
  for (let position = 0; position < sql.length;) {
    const character = sql[position];
    const next = sql[position + 1];
    if (character === "'") {
      position = skipQuoted(sql, position, "'");
    } else if (character === '"') {
      position = skipQuoted(sql, position, '"');
    } else if (character === "-" && next === "-") {
      position = sql.indexOf("\n", position + 2);
      if (position === -1) break;
      position += 1;
    } else if (character === "/" && next === "*") {
      position = skipBlockComment(sql, position);
    } else if (character === "$") {
      const dollarQuote = sql.slice(position).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*|)\$/)?.[0];
      if (dollarQuote) {
        const closing = sql.indexOf(dollarQuote, position + dollarQuote.length);
        position = closing === -1 ? sql.length : closing + dollarQuote.length;
      } else {
        const parameter = sql.slice(position).match(/^\$(\d+)/)?.[1];
        if (parameter) {
          const index = Number(parameter);
          if (!Number.isSafeInteger(index)) throw new Error(`SQL placeholder $${parameter} is invalid.`);
          placeholders.push({ start: position, end: position + parameter.length + 1, index });
          position += parameter.length + 1;
        } else {
          position += 1;
        }
      }
    } else {
      position += 1;
    }
  }
  return placeholders;
}

function skipQuoted(sql: string, opening: number, quote: "'" | '"'): number {
  for (let position = opening + 1; position < sql.length; position += 1) {
    // PostgreSQL E'' literals use backslash escapes. Treating a backslash as
    // an escape in an ordinary string can only reject an ambiguous query; it
    // never turns text inside a literal into an executable parameter.
    if (quote === "'" && sql[position] === "\\") {
      position += 1;
      continue;
    }
    if (sql[position] !== quote) continue;
    if (sql[position + 1] === quote) {
      position += 1;
      continue;
    }
    return position + 1;
  }
  return sql.length;
}

function skipBlockComment(sql: string, opening: number): number {
  let depth = 1;
  for (let position = opening + 2; position < sql.length; position += 1) {
    if (sql[position] === "/" && sql[position + 1] === "*") {
      depth += 1;
      position += 1;
    } else if (sql[position] === "*" && sql[position + 1] === "/") {
      depth -= 1;
      position += 1;
      if (depth === 0) return position + 1;
    }
  }
  return sql.length;
}

function returnsRows(sql: string): boolean {
  const normalized = sql.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").toLowerCase();
  // PostgreSQL advisory-lock functions return void. Prisma cannot deserialize
  // that native type through $queryRaw, while $executeRaw executes it safely.
  if (/^select\s+pg_advisory_xact_lock\s*\(/.test(normalized)) return false;
  return /^(?:select|show|values|table|explain|with)\b/.test(normalized) || /\breturning\b/.test(normalized);
}

function normalizePrismaError(error: unknown, wrapUnknown = false): Error {
  if (error instanceof DatabasePersistenceError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return error;
  const source = error as { code?: unknown; meta?: { code?: unknown }; cause?: { code?: unknown; meta?: { code?: unknown } } };
  const providerCodes = [source.code, source.meta?.code, source.cause?.code, source.cause?.meta?.code].filter((code): code is string => typeof code === "string");
  // Prefer PostgreSQL SQLSTATE metadata from a raw-query P2010 wrapper over
  // the Prisma wrapper code itself.
  const postgresCode = providerCodes.find((code) => /^[0-9A-Z]{5}$/.test(code) && !/^P\d{4}$/.test(code));
  if (postgresCode) return new DatabasePersistenceError(postgresCode);
  for (const code of providerCodes) {
    if (code === "P2002") return new DatabasePersistenceError("23505");
    if (code === "P2003") return new DatabasePersistenceError("23503");
    if (code === "P2004" || code === "P2014") return new DatabasePersistenceError("23514");
    // Prisma P2010 places the PostgreSQL error code in `meta.code`. Preserve
    // approved five-character PostgreSQL SQLSTATEs so existing repository
    // conflict mapping continues to work without exposing provider messages.
    if (/^P\d{4}$/.test(code)) return new DatabasePersistenceError("database_operation_failed");
  }
  return wrapUnknown || !(error instanceof Error) ? new DatabasePersistenceError("database_operation_failed") : error;
}

function abortError(): Error {
  return new DOMException("The database operation was aborted.", "AbortError");
}

export function createPrismaDatabaseRuntime(config: DatabaseConfig): PrismaPersistenceRuntime {
  return new PrismaDatabaseRuntime(config);
}
