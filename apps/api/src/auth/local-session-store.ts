import { createHmac, randomBytes } from "node:crypto";

import { createClient } from "redis";

import { BrowserSessionFailure } from "./errors.js";

export type AuthenticationSurface = "internal-h5" | "part-time" | "pc";

export interface StoredAccessSession {
  readonly absoluteExpiresAtMs: number;
  readonly accountId: string;
  readonly authenticatedAtMs: number;
  readonly createdAtMs: number;
  readonly csrfToken: string;
  readonly currentAssignmentId?: string;
  readonly reauthenticatedUntilMs?: number;
  readonly securityRevision: number;
  readonly sessionId: string;
  readonly surface: AuthenticationSurface;
  readonly workforcePersonId: string;
}

export interface ObservedAccessSession {
  readonly idleExpiresAtMs: number;
  readonly session: Readonly<StoredAccessSession>;
}

export interface AccessSessionStore {
  admitLoginAttempt(identifier: string, sourceAddress: string, nowMs: number): Promise<boolean>;
  recordLoginSuccess(identifier: string, sourceAddress: string): Promise<void>;
  create(surface: AuthenticationSurface, credential: string, session: StoredAccessSession, ttlMs: number): Promise<void>;
  delete(surface: AuthenticationSurface, credential: string): Promise<void>;
  get(surface: AuthenticationSurface, credential: string, idleTtlMs: number, nowMs: number): Promise<Readonly<StoredAccessSession> | undefined>;
  peek(surface: AuthenticationSurface, credential: string, nowMs: number): Promise<Readonly<ObservedAccessSession> | undefined>;
  rotate(surface: AuthenticationSurface, previousCredential: string, nextCredential: string, session: StoredAccessSession, ttlMs: number, nowMs: number): Promise<void>;
}

export interface RedisAccessSessionConnection {
  readonly store: AccessSessionStore;
  close(): Promise<void>;
  isReady(): boolean;
}

export interface RedisAccessSessionConfiguration {
  readonly connectTimeoutMs: number;
  readonly indexingKey: Uint8Array;
  readonly password: string;
  readonly signal?: AbortSignal;
  readonly url: string;
}

interface RedisExecutor { sendCommand(arguments_: readonly string[]): Promise<unknown> }

const CREDENTIAL = /^[A-Za-z0-9_-]{43}$/u;
const SESSION_MAX_BYTES = 16_384;
const RATE_WINDOW_MS = 15 * 60 * 1_000;

const createScript = [
  "if tonumber(ARGV[3])==nil or tonumber(ARGV[3])<=0 or tonumber(ARGV[5])==nil or tonumber(ARGV[5])<=0 then return -1 end",
  "local previous=redis.call('GET',KEYS[2])",
  "if previous then redis.call('DEL',ARGV[1]..previous) end",
  "redis.call('SET',KEYS[1],ARGV[2],'PX',ARGV[3])",
  "redis.call('SET',KEYS[2],ARGV[4],'PX',ARGV[5])",
  "return 1",
].join("\n");

const rotateScript = [
  "if tonumber(ARGV[3])==nil or tonumber(ARGV[3])<=0 or tonumber(ARGV[5])==nil or tonumber(ARGV[5])<=0 then return -1 end",
  "if redis.call('EXISTS',KEYS[1])==0 then return 0 end",
  "if redis.call('GET',KEYS[3])~=ARGV[1] then return 0 end",
  "redis.call('DEL',KEYS[1])",
  "redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3])",
  "redis.call('SET',KEYS[3],ARGV[4],'PX',ARGV[5])",
  "return 1",
].join("\n");

const deleteScript = [
  "local value=redis.call('GET',KEYS[1])",
  "if not value or value~=ARGV[1] then return 0 end",
  "redis.call('DEL',KEYS[1])",
  "if redis.call('GET',KEYS[2])==ARGV[2] then redis.call('DEL',KEYS[2]) end",
  "return 1",
].join("\n");

const peekScript = [
  "local value=redis.call('GET',KEYS[1])",
  "if not value then return false end",
  "local ok,record=pcall(cjson.decode,value)",
  "if not ok or type(record)~='table' or tonumber(record.absoluteExpiresAtMs)==nil then redis.call('DEL',KEYS[1]); return false end",
  "if tonumber(record.absoluteExpiresAtMs)<=tonumber(ARGV[1]) then redis.call('DEL',KEYS[1]); return false end",
  "local ttl=redis.call('PTTL',KEYS[1])",
  "if ttl<=0 then redis.call('DEL',KEYS[1]); return false end",
  "return {value,tostring(ttl)}",
].join("\n");

const touchScript = [
  "local value=redis.call('GET',KEYS[1])",
  "if not value then return false end",
  "local ok,record=pcall(cjson.decode,value)",
  "if not ok or type(record)~='table' or tonumber(record.absoluteExpiresAtMs)==nil then redis.call('DEL',KEYS[1]); return false end",
  "local remaining=tonumber(record.absoluteExpiresAtMs)-tonumber(ARGV[1])",
  "if remaining<=0 then redis.call('DEL',KEYS[1]); return false end",
  "redis.call('PEXPIRE',KEYS[1],math.min(tonumber(ARGV[2]),remaining))",
  "return value",
].join("\n");

const admissionScript = [
  "local currentA=tonumber(redis.call('GET',KEYS[1]) or '0')",
  "local currentB=tonumber(redis.call('GET',KEYS[2]) or '0')",
  "if currentA>=tonumber(ARGV[2]) or currentB>=tonumber(ARGV[3]) then return 0 end",
  "local a=redis.call('INCR',KEYS[1])",
  "if a==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end",
  "local b=redis.call('INCR',KEYS[2])",
  "if b==1 then redis.call('PEXPIRE',KEYS[2],ARGV[1]) end",
  "return 1",
].join("\n");

const loginSuccessScript = [
  "redis.call('DEL',KEYS[1])",
  "local source=tonumber(redis.call('GET',KEYS[2]) or '0')",
  "if source<=1 then redis.call('DEL',KEYS[2]) else redis.call('DECR',KEYS[2]) end",
  "return 1",
].join("\n");

export function createOpaqueSessionCredential(): string {
  return randomBytes(32).toString("base64url");
}

function digest(key: Uint8Array, domain: string, value: string): string {
  return createHmac("sha256", key).update(domain).update("\0").update(value).digest("base64url");
}

function validCredential(value: string): void {
  if (!CREDENTIAL.test(value)) throw new BrowserSessionFailure("authentication_required");
}

function validTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new BrowserSessionFailure("authentication_required");
}

function validNow(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new BrowserSessionFailure("authentication_required");
}

function parseSession(value: unknown, expectedSurface: AuthenticationSurface): Readonly<StoredAccessSession> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > SESSION_MAX_BYTES) throw new BrowserSessionFailure("authentication_required");
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const required = ["absoluteExpiresAtMs", "accountId", "authenticatedAtMs", "createdAtMs", "csrfToken", "securityRevision", "sessionId", "surface", "workforcePersonId"];
    const optional = ["currentAssignmentId", "reauthenticatedUntilMs"];
    const keys = Object.keys(parsed);
    const integers = [parsed["absoluteExpiresAtMs"], parsed["authenticatedAtMs"], parsed["createdAtMs"], parsed["securityRevision"]];
    const createdAtMs = parsed["createdAtMs"];
    const authenticatedAtMs = parsed["authenticatedAtMs"];
    const absoluteExpiresAtMs = parsed["absoluteExpiresAtMs"];
    if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key)) ||
      parsed["surface"] !== expectedSurface || typeof parsed["accountId"] !== "string" || parsed["accountId"].length === 0 || parsed["accountId"].length > 128 ||
      typeof parsed["workforcePersonId"] !== "string" || parsed["workforcePersonId"].length === 0 || parsed["workforcePersonId"].length > 128 ||
      typeof parsed["sessionId"] !== "string" || !CREDENTIAL.test(parsed["sessionId"]) ||
      typeof parsed["csrfToken"] !== "string" || !CREDENTIAL.test(parsed["csrfToken"]) || integers.some((item) => typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) ||
      typeof createdAtMs !== "number" || typeof authenticatedAtMs !== "number" || typeof absoluteExpiresAtMs !== "number" ||
      authenticatedAtMs < createdAtMs || absoluteExpiresAtMs <= authenticatedAtMs ||
      (parsed["currentAssignmentId"] !== undefined && (typeof parsed["currentAssignmentId"] !== "string" || parsed["currentAssignmentId"].length === 0 || parsed["currentAssignmentId"].length > 128)) ||
      (parsed["reauthenticatedUntilMs"] !== undefined && (typeof parsed["reauthenticatedUntilMs"] !== "number" || !Number.isSafeInteger(parsed["reauthenticatedUntilMs"]) || parsed["reauthenticatedUntilMs"] < authenticatedAtMs))) {
      throw new Error("invalid");
    }
    return Object.freeze(parsed as unknown as StoredAccessSession);
  } catch {
    throw new BrowserSessionFailure("authentication_required");
  }
}

function serializeAndValidateSession(session: StoredAccessSession, surface: AuthenticationSurface): string {
  let serialized: string;
  try { serialized = JSON.stringify(session); }
  catch { throw new BrowserSessionFailure("authentication_required"); }
  if (Buffer.byteLength(serialized, "utf8") > SESSION_MAX_BYTES) throw new BrowserSessionFailure("authentication_required");
  parseSession(serialized, surface);
  return serialized;
}

export function createRedisAccessSessionStore(executor: RedisExecutor, indexingKey: Uint8Array): Readonly<AccessSessionStore> {
  const sessionPrefix = (surface: AuthenticationSurface): string => `ai-crm:auth:${surface}:session:`;
  const sessionKey = (surface: AuthenticationSurface, credential: string): string => `${sessionPrefix(surface)}${digest(indexingKey, `session:${surface}`, credential)}`;
  const accountKey = (surface: AuthenticationSurface, accountId: string): string => `ai-crm:auth:${surface}:account:${digest(indexingKey, `account:${surface}`, accountId)}`;
  const rateKey = (kind: "identifier" | "source", value: string): string => `ai-crm:auth:rate:${kind}:${digest(indexingKey, `rate:${kind}`, value)}`;
  const command = async (arguments_: readonly string[]): Promise<unknown> => {
    try { return await executor.sendCommand(arguments_); }
    catch (error) { if (error instanceof BrowserSessionFailure) throw error; throw new BrowserSessionFailure("authentication_dependency_unavailable"); }
  };
  return Object.freeze({
    async admitLoginAttempt(identifier: string, sourceAddress: string) {
      const result = await command(["EVAL", admissionScript, "2", rateKey("identifier", identifier), rateKey("source", sourceAddress), String(RATE_WINDOW_MS), "5", "30"]);
      if (result !== 0 && result !== 1) throw new BrowserSessionFailure("authentication_dependency_unavailable");
      return result === 1;
    },
    async recordLoginSuccess(identifier: string, sourceAddress: string) {
      await command(["EVAL", loginSuccessScript, "2", rateKey("identifier", identifier), rateKey("source", sourceAddress)]);
    },
    async create(surface: AuthenticationSurface, credential: string, session: StoredAccessSession, ttlMs: number) {
      validCredential(credential);
      validTtl(ttlMs);
      const serialized = serializeAndValidateSession(session, surface);
      const index = digest(indexingKey, `session:${surface}`, credential);
      const accountTtlMs = Math.max(ttlMs, session.absoluteExpiresAtMs - session.createdAtMs);
      validTtl(accountTtlMs);
      const result = await command(["EVAL", createScript, "2", sessionKey(surface, credential), accountKey(surface, session.accountId), sessionPrefix(surface), serialized, String(ttlMs), index, String(accountTtlMs)]);
      if (result !== 1) throw new BrowserSessionFailure("authentication_dependency_unavailable");
    },
    async delete(surface: AuthenticationSurface, credential: string) {
      validCredential(credential);
      const index = digest(indexingKey, `session:${surface}`, credential);
      const raw = await command(["GET", sessionKey(surface, credential)]);
      const stored = parseSession(raw, surface);
      if (stored !== undefined && typeof raw === "string") {
        await command(["EVAL", deleteScript, "2", sessionKey(surface, credential), accountKey(surface, stored.accountId), raw, index]);
      }
    },
    async get(surface: AuthenticationSurface, credential: string, idleTtlMs: number, nowMs: number) {
      validCredential(credential);
      validTtl(idleTtlMs); validNow(nowMs);
      const key = sessionKey(surface, credential);
      const raw = await command(["EVAL", touchScript, "1", key, String(nowMs), String(idleTtlMs)]);
      try { return parseSession(raw, surface); }
      catch (error) { await command(["DEL", key]).catch(() => undefined); throw error; }
    },
    async peek(surface: AuthenticationSurface, credential: string, nowMs: number) {
      validCredential(credential);
      validNow(nowMs);
      const observed = await command(["EVAL", peekScript, "1", sessionKey(surface, credential), String(nowMs)]);
      if (observed === null || observed === undefined || observed === false) return undefined;
      if (!Array.isArray(observed) || observed.length !== 2 || typeof observed[1] !== "string" || !/^\d+$/u.test(observed[1])) throw new BrowserSessionFailure("authentication_required");
      let session: Readonly<StoredAccessSession> | undefined;
      try { session = parseSession(observed[0], surface); }
      catch (error) { await command(["DEL", sessionKey(surface, credential)]).catch(() => undefined); throw error; }
      const ttlMs = Number(observed[1]);
      if (session === undefined || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new BrowserSessionFailure("authentication_required");
      return Object.freeze({ idleExpiresAtMs: Math.min(session.absoluteExpiresAtMs, nowMs + ttlMs), session });
    },
    async rotate(surface: AuthenticationSurface, previousCredential: string, nextCredential: string, session: StoredAccessSession, ttlMs: number, nowMs: number) {
      validCredential(previousCredential); validCredential(nextCredential);
      validTtl(ttlMs); validNow(nowMs);
      const serialized = serializeAndValidateSession(session, surface);
      const previousIndex = digest(indexingKey, `session:${surface}`, previousCredential);
      const nextIndex = digest(indexingKey, `session:${surface}`, nextCredential);
      const accountTtlMs = Math.max(ttlMs, session.absoluteExpiresAtMs - nowMs);
      validTtl(accountTtlMs);
      const result = await command(["EVAL", rotateScript, "3", sessionKey(surface, previousCredential), sessionKey(surface, nextCredential), accountKey(surface, session.accountId), previousIndex, serialized, String(ttlMs), nextIndex, String(accountTtlMs)]);
      if (result !== 1) throw new BrowserSessionFailure("authentication_required");
    },
  });
}

export async function connectRedisAccessSessionStore(config: RedisAccessSessionConfiguration): Promise<Readonly<RedisAccessSessionConnection>> {
  if (config.indexingKey.byteLength !== 32) throw new BrowserSessionFailure("authentication_dependency_unavailable");
  const client = createClient({ password: config.password, socket: { connectTimeout: config.connectTimeoutMs, reconnectStrategy: false }, url: config.url });
  client.on("error", () => undefined);
  const abort = (): void => { client.destroy(); };
  config.signal?.addEventListener("abort", abort, { once: true });
  try {
    config.signal?.throwIfAborted();
    await client.connect();
  } catch {
    client.destroy();
    throw new BrowserSessionFailure("authentication_dependency_unavailable");
  } finally { config.signal?.removeEventListener("abort", abort); }
  const executor: RedisExecutor = { sendCommand: async (arguments_) => {
    try { return await client.sendCommand([...arguments_]); }
    catch { throw new BrowserSessionFailure("authentication_dependency_unavailable"); }
  } };
  return Object.freeze({ close: async () => { if (client.isOpen) await client.close(); }, isReady: () => client.isReady, store: createRedisAccessSessionStore(executor, config.indexingKey) });
}
