import { isAbsolute, resolve } from "node:path";

import { configuration, loadConfiguration, type LoadConfigurationOptions } from "@ai-crm/config";

import { loadPcBffConfiguration, type PcBffConfiguration } from "./auth/config.js";

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
  jwksCacheMaxAgeMs: configuration.integer("AI_CRM_OIDC_JWKS_CACHE_MAX_AGE_MS", {
    default: 3_600_000, maximum: 86_400_000, minimum: 1_000,
  }),
  jwksCooldownMs: configuration.integer("AI_CRM_OIDC_JWKS_COOLDOWN_MS", {
    default: 30_000, maximum: 3_600_000, minimum: 1_000,
  }),
  jwksUri: configuration.url("AI_CRM_KEYCLOAK_JWKS_URI", { protocols: ["https:", "http:"] }),
  keycloakAdminBaseUrl: configuration.url("AI_CRM_KEYCLOAK_ADMIN_BASE_URL", { protocols: ["https:", "http:"] }),
  keycloakAdministrationClientId: configuration.string("AI_CRM_KEYCLOAK_ADMIN_CLIENT_ID", { maxLength: 255 }),
  keycloakAdministrationClientSecret: configuration.secretFile("AI_CRM_KEYCLOAK_ADMIN_CLIENT_SECRET_FILE"),
  keycloakAdministrationTimeoutMs: configuration.integer("AI_CRM_KEYCLOAK_ADMIN_TIMEOUT_MS", { maximum: 60_000, minimum: 100 }),
  keycloakCredentialReturnUri: configuration.url("AI_CRM_KEYCLOAK_CREDENTIAL_RETURN_URI", { protocols: ["https:", "http:"] }),
  keycloakPublicRealmBasePath: configuration.string("AI_CRM_KEYCLOAK_PUBLIC_REALM_BASE_PATH", { maxLength: 255, pattern: /^\/realms\/[A-Za-z0-9._-]+$/u }),
  keycloakRealm: configuration.string("AI_CRM_KEYCLOAK_REALM", { maxLength: 255, pattern: /^[A-Za-z0-9._-]+$/u }),
  migrationsRoot: configuration.string("AI_CRM_MIGRATIONS_ROOT", { maxLength: 512 }),
  oidcClockToleranceSeconds: configuration.integer("AI_CRM_OIDC_CLOCK_TOLERANCE_SECONDS", {
    default: 30, maximum: 300, minimum: 1,
  }),
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
  readonly workforceAdministration: Readonly<{
    readonly keycloakAdminBaseUrl: string;
    readonly keycloakClientId: string;
    readonly keycloakClientSecret: string;
    readonly keycloakPublicRealmBasePath: string;
    readonly keycloakRealm: string;
    readonly keycloakTimeoutMs: number;
    readonly returnUri: string;
  }>;
  readonly oidcVerifier: Readonly<{
    readonly audience: string;
    readonly clientId: string;
    readonly clockToleranceSeconds: number;
    readonly issuer: string;
    readonly jwksCacheMaxAgeMs: number;
    readonly jwksCooldownMs: number;
    readonly jwksTimeoutMs: number;
    readonly jwksUri: string;
  }>;
  readonly pcBff: Readonly<PcBffConfiguration>;
}

const migrationDirectories = [
  "packages/database/migrations",
  "packages/platform-modules/app-registry/migrations",
  "packages/platform-modules/audit/migrations",
  "packages/platform-modules/authorization/migrations",
  "packages/platform-modules/business-configuration/migrations",
  "packages/platform-modules/eventing-outbox/migrations",
  "packages/platform-modules/file-center/migrations",
  "packages/platform-modules/form-schema/migrations",
  "packages/platform-modules/notifications/migrations",
  "packages/platform-modules/organization/migrations",
  "packages/platform-modules/task-center/migrations",
  "packages/platform-modules/workforce-access/migrations",
] as const;

export async function loadProductionApiConfiguration(
  options: LoadConfigurationOptions = {},
): Promise<Readonly<ProductionApiConfiguration>> {
  const [raw, pcBff] = await Promise.all([
    loadConfiguration(schema, options),
    loadPcBffConfiguration(options),
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
    const allowedOrigin = new URL(pcBff.allowedOrigin);
    if (allowedOrigin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(allowedOrigin.hostname)) {
      throw new Error("api_local_file_storage_dev_only");
    }
  }
  if (raw.fileStorageProvider === "cos" && raw.cosSecretId === raw.cosSecretKey) throw new Error("api_cos_credentials_not_separated");
  if (raw.keycloakAdministrationClientSecret === pcBff.keycloakClientSecret) throw new Error("api_keycloak_credentials_not_separated");
  if (raw.fileCenterMaximumScanBytes > raw.fileCenterMaximumUploadBytes) throw new Error("api_file_center_size_window_invalid");
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
    workforceAdministration: Object.freeze({
      keycloakAdminBaseUrl: raw.keycloakAdminBaseUrl.replace(/\/$/u, ""),
      keycloakClientId: raw.keycloakAdministrationClientId,
      keycloakClientSecret: raw.keycloakAdministrationClientSecret,
      keycloakPublicRealmBasePath: raw.keycloakPublicRealmBasePath,
      keycloakRealm: raw.keycloakRealm,
      keycloakTimeoutMs: raw.keycloakAdministrationTimeoutMs,
      returnUri: raw.keycloakCredentialReturnUri,
    }),
    oidcVerifier: Object.freeze({
      audience: pcBff.keycloakAudience,
      clientId: pcBff.keycloakClientId,
      clockToleranceSeconds: raw.oidcClockToleranceSeconds,
      issuer: pcBff.keycloakIssuer,
      jwksCacheMaxAgeMs: raw.jwksCacheMaxAgeMs,
      jwksCooldownMs: raw.jwksCooldownMs,
      jwksTimeoutMs: pcBff.oidcTimeoutSeconds * 1_000,
      jwksUri: raw.jwksUri,
    }),
    pcBff,
  });
}
