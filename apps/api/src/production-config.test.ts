import { Buffer } from "node:buffer";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadProductionApiConfiguration } from "./production-config.js";

const secretPath = (name: string) => resolve(import.meta.dirname, "__synthetic-secrets__", name);
const secretPaths = {
  client: secretPath("client"),
  adminClient: secretPath("admin-client"),
  cosId: secretPath("cos-id"),
  cosKey: secretPath("cos-key"),
  database: secretPath("database"),
  encryption: secretPath("encryption"),
  index: secretPath("index"),
  redis: secretPath("redis"),
  realtimeRabbit: secretPath("realtime-rabbit"),
} as const;
const secrets: Readonly<Record<string, string>> = {
  [secretPaths.adminClient]: "a".repeat(43),
  [secretPaths.client]: "c".repeat(43),
  [secretPaths.cosId]: "synthetic-cos-id",
  [secretPaths.cosKey]: "synthetic-cos-key",
  [secretPaths.database]: "postgresql://api:secret@database:5432/ai_crm",
  [secretPaths.encryption]: Buffer.alloc(32, 7).toString("base64url"),
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
  AI_CRM_KEYCLOAK_ISSUER: "http://127.0.0.1:8080/realms/ai-crm-dev",
  AI_CRM_KEYCLOAK_ADMIN_BASE_URL: "http://127.0.0.1:8080",
  AI_CRM_KEYCLOAK_ADMIN_CLIENT_ID: "ai-crm-workforce-provisioner",
  AI_CRM_KEYCLOAK_ADMIN_CLIENT_SECRET_FILE: secretPaths.adminClient,
  AI_CRM_KEYCLOAK_ADMIN_TIMEOUT_MS: "5000",
  AI_CRM_KEYCLOAK_CREDENTIAL_RETURN_URI: "http://127.0.0.1:8088/workforce-administration/credential-callback",
  AI_CRM_KEYCLOAK_PUBLIC_REALM_BASE_PATH: "/realms/ai-crm-dev",
  AI_CRM_KEYCLOAK_REALM: "ai-crm-dev",
  AI_CRM_KEYCLOAK_JWKS_URI: "http://127.0.0.1:8080/realms/ai-crm-dev/protocol/openid-connect/certs",
  AI_CRM_MIGRATIONS_ROOT: resolve(import.meta.dirname, "../../.."),
  AI_CRM_OIDC_API_AUDIENCE: "ai-crm-api",
  AI_CRM_PC_ALLOWED_ORIGIN: "http://127.0.0.1:8088",
  AI_CRM_PC_LOGIN_TRANSACTION_TTL_SECONDS: "180",
  AI_CRM_PC_OIDC_CLIENT_ID: "ai-crm-pc-bff",
  AI_CRM_PC_OIDC_CLIENT_SECRET_FILE: secretPaths.client,
  AI_CRM_PC_OIDC_POST_LOGOUT_REDIRECT_URI: "http://127.0.0.1:8088/auth/pc/login",
  AI_CRM_PC_OIDC_REDIRECT_URI: "http://127.0.0.1:8088/auth/pc/callback",
  AI_CRM_PC_OIDC_TIMEOUT_SECONDS: "5",
  AI_CRM_PC_REFRESH_LEASE_TTL_MS: "10000",
  AI_CRM_PC_SESSION_ABSOLUTE_TTL_SECONDS: "28800",
  AI_CRM_PC_SESSION_ENCRYPTION_KEY_FILE: secretPaths.encryption,
  AI_CRM_PC_SESSION_ENCRYPTION_KEY_ID: "current",
  AI_CRM_PC_SESSION_IDLE_TTL_SECONDS: "1800",
  AI_CRM_PC_SESSION_INDEX_KEY_FILE: secretPaths.index,
  AI_CRM_POSTGRES_URL_FILE: secretPaths.database,
  AI_CRM_REDIS_CONNECT_TIMEOUT_MS: "1000",
  AI_CRM_REDIS_PASSWORD_FILE: secretPaths.redis,
  AI_CRM_REDIS_URL: "redis://127.0.0.1:6379",
  NODE_ENV: "test",
};

describe("production API configuration", () => {
  it("loads bounded database, IAM, Redis and migration settings from typed references", async () => {
    const result = await loadProductionApiConfiguration({ env, secretFilePolicy });
    expect(result.database).toMatchObject({ applicationName: "ai_crm_api", maxConnections: 10 });
    expect(result.databaseHealthProbe).toEqual({ intervalMs: 10_000, timeoutMs: 2_000 });
    expect(result.database.connectionString).toBe(secrets[secretPaths.database]);
    expect(result.fileCenter).toMatchObject({ maximumUploadBytes: 1_048_576, storage: { bucket: "synthetic-test-1250000000", kind: "cos", secretId: "synthetic-cos-id" } });
    expect(result.migrations).toHaveLength(12);
    expect(result.migrations.some((path) => path.endsWith(join("packages", "platform-modules", "authorization", "migrations"))))
      .toBe(true);
    expect(result.oidcVerifier.jwksTimeoutMs).toBe(5_000);
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
        AI_CRM_PC_OIDC_POST_LOGOUT_REDIRECT_URI: "http://127.0.0.1:3000/auth/pc/login",
        AI_CRM_PC_OIDC_REDIRECT_URI: "http://127.0.0.1:3000/auth/pc/callback",
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
        AI_CRM_PC_OIDC_POST_LOGOUT_REDIRECT_URI: "https://workbench.example.test/auth/pc/login",
        AI_CRM_PC_OIDC_REDIRECT_URI: "https://workbench.example.test/auth/pc/callback",
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
