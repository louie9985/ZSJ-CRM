import { Buffer } from "node:buffer";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadProductionApiConfiguration } from "./production-config.js";

const secretPath = (name: string) => resolve(import.meta.dirname, "__synthetic-secrets__", name);
const secretPaths = {
  cosId: secretPath("cos-id"),
  cosKey: secretPath("cos-key"),
  database: secretPath("database"),
  index: secretPath("index"),
  redis: secretPath("redis"),
  realtimeRabbit: secretPath("realtime-rabbit"),
} as const;
const secrets: Readonly<Record<string, string>> = {
  [secretPaths.cosId]: "synthetic-cos-id",
  [secretPaths.cosKey]: "synthetic-cos-key",
  [secretPaths.database]: "postgresql://api:secret@database:5432/ai_crm",
  [secretPaths.index]: Buffer.alloc(32, 9).toString("base64url"),
  [secretPaths.redis]: "synthetic-redis-secret",
  [secretPaths.realtimeRabbit]: "amqps://realtime-consumer:secret@rabbit.example.test/ai-crm",
};
const secretFilePolicy = {
  fileSystem: {
    inspect: (filePath: string) => Promise.resolve({
      isFile: filePath in secrets,
      isSymbolicLink: false,
      mode: 0o400,
      size: Buffer.byteLength(secrets[filePath] ?? "", "utf8"),
    }),
    read: (filePath: string) => Promise.resolve(secrets[filePath] ?? ""),
  },
} as const;
const env: NodeJS.ProcessEnv = {
  AI_CRM_API_SCHEMA_VERSION: "0.0.0",
  AI_CRM_COS_BUCKET: "synthetic-test-1250000000",
  AI_CRM_COS_REGION: "ap-test",
  AI_CRM_COS_SECRET_ID_FILE: secretPaths.cosId,
  AI_CRM_COS_SECRET_KEY_FILE: secretPaths.cosKey,
  AI_CRM_COS_TIMEOUT_MS: "10000",
  AI_CRM_FILE_DOWNLOAD_GRANT_TTL_MS: "60000",
  AI_CRM_FILE_MAXIMUM_SCAN_BYTES: "1048576",
  AI_CRM_FILE_MAXIMUM_UPLOAD_BYTES: "1048576",
  AI_CRM_FILE_UPLOAD_SESSION_TTL_MS: "300000",
  AI_CRM_INTERNAL_H5_ALLOWED_ORIGIN: "http://127.0.0.1:10086",
  AI_CRM_MIGRATIONS_ROOT: resolve(import.meta.dirname, "../../.."),
  AI_CRM_PC_ALLOWED_ORIGIN: "http://127.0.0.1:8088",
  AI_CRM_SESSION_INDEX_KEY_FILE: secretPaths.index,
  AI_CRM_POSTGRES_URL_FILE: secretPaths.database,
  AI_CRM_REDIS_CONNECT_TIMEOUT_MS: "1000",
  AI_CRM_REDIS_PASSWORD_FILE: secretPaths.redis,
  AI_CRM_REDIS_URL: "redis://127.0.0.1:6379",
  NODE_ENV: "test",
};

describe("production API configuration", () => {
  it("loads bounded database, browser Session, Redis and migration settings from typed references", async () => {
    const result = await loadProductionApiConfiguration({ env, secretFilePolicy });
    expect(result.database).toMatchObject({ applicationName: "ai_crm_api", maxConnections: 10 });
    expect(result.databaseHealthProbe).toEqual({ intervalMs: 10_000, timeoutMs: 2_000 });
    expect(result.database.connectionString).toBe(secrets[secretPaths.database]);
    expect(result.fileCenter).toMatchObject({ maximumUploadBytes: 1_048_576, storage: { bucket: "synthetic-test-1250000000", kind: "cos", secretId: "synthetic-cos-id" } });
    expect(result.migrations).toHaveLength(11);
    expect(result.migrations.some((path) => path.endsWith(join("packages", "crm-modules", "authorization", "migrations"))))
      .toBe(true);
    expect(result.sessions).toMatchObject({ internalH5AllowedOrigin: "http://127.0.0.1:10086", pcAllowedOrigin: "http://127.0.0.1:8088" });
    expect(result.sessions.sessionIndexingKey).toHaveLength(32);
  });

  it("loads explicit local file storage without requiring COS credentials", async () => {
    const localEnv = {
      ...env,
      AI_CRM_COS_BUCKET: undefined,
      AI_CRM_COS_REGION: undefined,
      AI_CRM_COS_SECRET_ID_FILE: undefined,
      AI_CRM_COS_SECRET_KEY_FILE: undefined,
    };
    const root = resolve(import.meta.dirname, "__local-file-storage__");
    const result = await loadProductionApiConfiguration({
      env: {
        ...localEnv,
        AI_CRM_FILE_STORAGE_PROVIDER: "local",
        AI_CRM_LOCAL_FILE_STORAGE_ROOT: root,
        AI_CRM_PC_ALLOWED_ORIGIN: "http://127.0.0.1:3000",
      },
      secretFilePolicy,
    });

    expect(result.fileCenter.storage).toEqual({ kind: "local", rootDirectory: root });
  });

  it("does not allow local file storage outside the local development workbench origin", async () => {
    const localEnv = {
      ...env,
      AI_CRM_COS_BUCKET: undefined,
      AI_CRM_COS_REGION: undefined,
      AI_CRM_COS_SECRET_ID_FILE: undefined,
      AI_CRM_COS_SECRET_KEY_FILE: undefined,
    };

    await expect(loadProductionApiConfiguration({
      env: {
        ...localEnv,
        AI_CRM_FILE_STORAGE_PROVIDER: "local",
        AI_CRM_LOCAL_FILE_STORAGE_ROOT: resolve(import.meta.dirname, "__local-file-storage__"),
        AI_CRM_PC_ALLOWED_ORIGIN: "https://workbench.example.test",
      },
      secretFilePolicy,
    })).rejects.toThrow("api_local_file_storage_dev_only");
  });

  it("rejects a release identifier as the independent schema compatibility version", async () => {
    await expect(loadProductionApiConfiguration({
      env: { ...env, AI_CRM_API_SCHEMA_VERSION: "2026.07.27.1" },
      secretFilePolicy,
    })).rejects.toMatchObject({ code: "invalid_value", variable: "AI_CRM_API_SCHEMA_VERSION" });
  });

  it("requires a health timeout shorter than the non-overlapping probe interval", async () => {
    await expect(loadProductionApiConfiguration({
      env: {
        ...env,
        AI_CRM_API_POSTGRES_HEALTH_INTERVAL_MS: "1000",
        AI_CRM_API_POSTGRES_HEALTH_TIMEOUT_MS: "1000",
      },
      secretFilePolicy,
    })).rejects.toThrow("api_database_health_window_invalid");
  });

  it("requires an independent TLS Rabbit secret when production realtime is enabled", async () => {
    await expect(loadProductionApiConfiguration({ env: { ...env, AI_CRM_REALTIME_ENABLED: "true" }, secretFilePolicy })).rejects.toThrow("api_realtime_rabbit_configuration_required");
    await expect(loadProductionApiConfiguration({ env: { ...env, AI_CRM_REALTIME_ENABLED: "true", AI_CRM_REALTIME_RABBIT_URL_FILE: secretPaths.realtimeRabbit }, secretFilePolicy })).resolves.toMatchObject({ realtime: { enabled: true, maximumConnectionsPerSession: 8 } });
  });
});
