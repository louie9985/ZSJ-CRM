import { configuration, loadConfiguration, type LoadConfigurationOptions } from "@ai-crm/config";

import { BrowserSessionFailure } from "./errors.js";

export interface InternalSessionConfiguration {
  readonly internalH5AllowedOrigin: string;
  readonly pcAllowedOrigin: string;
  readonly redisConnectTimeoutMs: number;
  readonly redisPassword: string;
  readonly redisUrl: string;
  readonly sessionIndexingKey: Uint8Array;
}

const schema = {
  internalH5AllowedOrigin: configuration.url("AI_CRM_INTERNAL_H5_ALLOWED_ORIGIN", { protocols: ["https:", "http:"] }),
  pcAllowedOrigin: configuration.url("AI_CRM_PC_ALLOWED_ORIGIN", { protocols: ["https:", "http:"] }),
  redisConnectTimeoutMs: configuration.integer("AI_CRM_REDIS_CONNECT_TIMEOUT_MS", { maximum: 60_000, minimum: 100 }),
  redisPassword: configuration.secretFile("AI_CRM_REDIS_PASSWORD_FILE"),
  redisUrl: configuration.url("AI_CRM_REDIS_URL", { protocols: ["redis:", "rediss:"] }),
  sessionIndexingKey: configuration.secretFile("AI_CRM_SESSION_INDEX_KEY_FILE"),
} as const;

function allowedOrigin(value: string): string {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || (value !== url.origin && value !== `${url.origin}/`)) {
    throw new BrowserSessionFailure("authentication_dependency_unavailable");
  }
  return url.origin;
}

function decodeKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new BrowserSessionFailure("authentication_dependency_unavailable");
  const key = Buffer.from(value, "base64url");
  if (key.byteLength !== 32 || key.toString("base64url") !== value) throw new BrowserSessionFailure("authentication_dependency_unavailable");
  return new Uint8Array(key);
}

export async function loadInternalSessionConfiguration(options: LoadConfigurationOptions = {}): Promise<Readonly<InternalSessionConfiguration>> {
  const raw = await loadConfiguration(schema, options);
  return Object.freeze({
    internalH5AllowedOrigin: allowedOrigin(raw.internalH5AllowedOrigin),
    pcAllowedOrigin: allowedOrigin(raw.pcAllowedOrigin),
    redisConnectTimeoutMs: raw.redisConnectTimeoutMs,
    redisPassword: raw.redisPassword,
    redisUrl: raw.redisUrl,
    sessionIndexingKey: decodeKey(raw.sessionIndexingKey),
  });
}
