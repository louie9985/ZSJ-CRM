import { isAbsolute, resolve } from "node:path";

import { configuration, loadConfiguration, type LoadConfigurationOptions } from "@ai-crm/config";

import { loadInternalSessionConfiguration, type InternalSessionConfiguration } from "./auth/config.js";

const schema = {
  applicationSchemaVersion: configuration.string("AI_CRM_API_SCHEMA_VERSION", {
    maxLength: 64,
    pattern: /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
  }),
  databaseConnectionString: configuration.secretFile("AI_CRM_POSTGRES_URL_FILE"),
  databaseConnectionTimeoutMs: configuration.integer("AI_CRM_POSTGRES_CONNECT_TIMEOUT_MS", {
    default: 5_000, maximum: 60_000, minimum: 100,
  }),
  databaseIdleTimeoutMs: configuration.integer("AI_CRM_POSTGRES_IDLE_TIMEOUT_MS", {
    default: 30_000, maximum: 300_000, minimum: 1_000,
  }),
  databaseHealthProbeIntervalMs: configuration.integer("AI_CRM_API_POSTGRES_HEALTH_INTERVAL_MS", {
    default: 10_000, maximum: 60_000, minimum: 1_000,
  }),
  databaseHealthProbeTimeoutMs: configuration.integer("AI_CRM_API_POSTGRES_HEALTH_TIMEOUT_MS", {
    default: 2_000, maximum: 30_000, minimum: 100,
  }),
  databaseMaxConnections: configuration.integer("AI_CRM_API_POSTGRES_MAX_CONNECTIONS", {
    default: 10, maximum: 100, minimum: 1,
  }),
  databaseStatementTimeoutMs: configuration.integer("AI_CRM_POSTGRES_STATEMENT_TIMEOUT_MS", {
    default: 15_000, maximum: 300_000, minimum: 100,
  }),
  fileCenterDownloadGrantTtlMs: configuration.integer("AI_CRM_FILE_DOWNLOAD_GRANT_TTL_MS", { maximum: 3_600_000, minimum: 1_000 }),
  fileCenterMaximumScanBytes: configuration.integer("AI_CRM_FILE_MAXIMUM_SCAN_BYTES", { maximum: 1_073_741_824, minimum: 1 }),
  fileCenterMaximumUploadBytes: configuration.integer("AI_CRM_FILE_MAXIMUM_UPLOAD_BYTES", { maximum: 1_073_741_824, minimum: 1 }),
  fileCenterUploadSessionTtlMs: configuration.integer("AI_CRM_FILE_UPLOAD_SESSION_TTL_MS", { maximum: 86_400_000, minimum: 1_000 }),
  fileStorageProvider: configuration.enumeration("AI_CRM_FILE_STORAGE_PROVIDER", ["cos", "local"], { default: "cos" }),
  cosBucket: configuration.optionalString("AI_CRM_COS_BUCKET", { maxLength: 255, pattern: /^[a-z0-9][a-z0-9.-]*-[1-9][0-9]{4,}$/u }),
  cosRegion: configuration.optionalString("AI_CRM_COS_REGION", { maxLength: 64, pattern: /^[a-z][a-z0-9-]+$/u }),
  cosSecretId: configuration.optionalSecretFile("AI_CRM_COS_SECRET_ID_FILE"),
  cosSecretKey: configuration.optionalSecretFile("AI_CRM_COS_SECRET_KEY_FILE"),
  cosTimeoutMs: configuration.integer("AI_CRM_COS_TIMEOUT_MS", { default: 10_000, maximum: 120_000, minimum: 100 }),
  localFileStorageRoot: configuration.optionalString("AI_CRM_LOCAL_FILE_STORAGE_ROOT", { maxLength: 512 }),
  migrationsRoot: configuration.string("AI_CRM_MIGRATIONS_ROOT", { maxLength: 512 }),
  realtimeEnabled: configuration.boolean("AI_CRM_REALTIME_ENABLED", { default: false }),
  realtimeMaximumConnectionsPerSession: configuration.integer("AI_CRM_REALTIME_MAX_CONNECTIONS_PER_SESSION", { default: 8, maximum: 32, minimum: 1 }),
  realtimeRabbitUrl: configuration.optionalSecretFile("AI_CRM_REALTIME_RABBIT_URL_FILE"),
} as const;

export interface ProductionApiConfiguration {
  readonly applicationSchemaVersion: string;
  readonly database: Readonly<{
    readonly applicationName: string;
    readonly connectionString: string;
    readonly connectionTimeoutMs: number;
    readonly idleTimeoutMs: number;
    readonly maxConnections: number;
    readonly statementTimeoutMs: number;
  }>;
  readonly databaseHealthProbe: Readonly<{
    readonly intervalMs: number;
    readonly timeoutMs: number;
  }>;
  readonly fileCenter: Readonly<{
    readonly storage: Readonly<
      | { readonly kind: "cos"; readonly bucket: string; readonly region: string; readonly secretId: string; readonly secretKey: string; readonly timeoutMs: number }
      | { readonly kind: "local"; readonly rootDirectory: string }
    >;
    readonly downloadGrantTtlMs: number;
    readonly maximumScanBytes: number;
    readonly maximumUploadBytes: number;
    readonly uploadSessionTtlMs: number;
  }>;
  readonly migrations: readonly string[];
  readonly sessions: Readonly<InternalSessionConfiguration>;
  readonly realtime: Readonly<{
    readonly enabled: boolean;
    readonly maximumConnectionsPerSession: number;
    readonly rabbitUrl?: string;
  }>;
}

const migrationDirectories = [
  "packages/database/migrations",
  "packages/crm-modules/audit/migrations",
  "packages/crm-modules/authorization/migrations",
  "packages/crm-modules/business-configuration/migrations",
  "packages/crm-modules/eventing-outbox/migrations",
  "packages/crm-modules/file-center/migrations",
  "packages/crm-modules/form-schema/migrations",
  "packages/crm-modules/notifications/migrations",
  "packages/crm-modules/organization/migrations",
  "packages/crm-modules/task-center/migrations",
  "packages/crm-modules/workforce-access/migrations",
] as const;

export async function loadProductionApiConfiguration(
  options: LoadConfigurationOptions = {},
): Promise<Readonly<ProductionApiConfiguration>> {
  const [raw, sessions] = await Promise.all([
    loadConfiguration(schema, options),
    loadInternalSessionConfiguration(options),
  ]);
  if (!isAbsolute(raw.migrationsRoot)) throw new Error("api_migrations_root_invalid");
  if (raw.databaseHealthProbeTimeoutMs >= raw.databaseHealthProbeIntervalMs) {
    throw new Error("api_database_health_window_invalid");
  }
  if (raw.fileStorageProvider === "cos" &&
    (raw.cosBucket === undefined || raw.cosRegion === undefined || raw.cosSecretId === undefined || raw.cosSecretKey === undefined)) {
    throw new Error("api_cos_configuration_required");
  }
  if (raw.fileStorageProvider === "local") {
    const localRoot = raw.localFileStorageRoot;
    if (localRoot === undefined) throw new Error("api_local_file_storage_root_required");
    if (!isAbsolute(localRoot)) throw new Error("api_local_file_storage_root_invalid");
    const browserOrigins = [sessions.pcAllowedOrigin, sessions.internalH5AllowedOrigin].map((origin) => new URL(origin));
    if (browserOrigins.some((origin) => origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))) {
      throw new Error("api_local_file_storage_dev_only");
    }
  }
  if (raw.fileStorageProvider === "cos" && raw.cosSecretId === raw.cosSecretKey) throw new Error("api_cos_credentials_not_separated");
  if (raw.fileCenterMaximumScanBytes > raw.fileCenterMaximumUploadBytes) throw new Error("api_file_center_size_window_invalid");
  if (raw.realtimeEnabled && raw.realtimeRabbitUrl === undefined) throw new Error("api_realtime_rabbit_configuration_required");
  if (raw.realtimeRabbitUrl !== undefined) {
    const rabbit = new URL(raw.realtimeRabbitUrl);
    if (rabbit.protocol !== "amqps:") throw new Error("api_realtime_rabbit_tls_required");
  }
  const storage: ProductionApiConfiguration["fileCenter"]["storage"] = raw.fileStorageProvider === "cos"
    ? (() => {
      if (raw.cosBucket === undefined || raw.cosRegion === undefined || raw.cosSecretId === undefined || raw.cosSecretKey === undefined) {
        throw new Error("api_cos_configuration_required");
      }
      return Object.freeze({
        bucket: raw.cosBucket,
        kind: "cos" as const,
        region: raw.cosRegion,
        secretId: raw.cosSecretId,
        secretKey: raw.cosSecretKey,
        timeoutMs: raw.cosTimeoutMs,
      });
    })()
    : (() => {
      if (raw.localFileStorageRoot === undefined) throw new Error("api_local_file_storage_root_required");
      return Object.freeze({ kind: "local" as const, rootDirectory: raw.localFileStorageRoot });
    })();
  return Object.freeze({
    applicationSchemaVersion: raw.applicationSchemaVersion,
    database: Object.freeze({
      applicationName: "ai_crm_api",
      connectionString: raw.databaseConnectionString,
      connectionTimeoutMs: raw.databaseConnectionTimeoutMs,
      idleTimeoutMs: raw.databaseIdleTimeoutMs,
      maxConnections: raw.databaseMaxConnections,
      statementTimeoutMs: raw.databaseStatementTimeoutMs,
    }),
    databaseHealthProbe: Object.freeze({
      intervalMs: raw.databaseHealthProbeIntervalMs,
      timeoutMs: raw.databaseHealthProbeTimeoutMs,
    }),
    fileCenter: Object.freeze({
      storage,
      downloadGrantTtlMs: raw.fileCenterDownloadGrantTtlMs,
      maximumScanBytes: raw.fileCenterMaximumScanBytes,
      maximumUploadBytes: raw.fileCenterMaximumUploadBytes,
      uploadSessionTtlMs: raw.fileCenterUploadSessionTtlMs,
    }),
    migrations: Object.freeze(migrationDirectories.map((directory) => resolve(raw.migrationsRoot, directory))),
    sessions,
    realtime: Object.freeze({ enabled: raw.realtimeEnabled, maximumConnectionsPerSession: raw.realtimeMaximumConnectionsPerSession, ...(raw.realtimeRabbitUrl === undefined ? {} : { rabbitUrl: raw.realtimeRabbitUrl }) }),
  });
}
