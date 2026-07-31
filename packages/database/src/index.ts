export const packageId = "@ai-crm/database" as const;
export { validateDatabaseConfig, type DatabaseConfig } from "./config.js";
export { createLegacyPostgresRuntime, PostgresRuntime, type DatabaseHealth, type DatabaseQueryResult, type DatabaseRuntime } from "./runtime.js";
export {
  createPrismaDatabaseRuntime as createDatabaseRuntime,
  createPrismaDatabaseRuntime,
  DatabasePersistenceError,
  type PrismaPersistenceRuntime,
} from "./prisma-runtime.js";
export {
  createPostgresRuntimeRoleCapabilityProbe,
  createPostgresWorkerRuntimeRoleCapabilityProbe,
  type RuntimeRoleCapabilityProbe,
  type RuntimeRoleCapabilityRuntime,
  type RuntimeRoleCapabilityStatus,
} from "./runtime-role-capability.js";
export {
  checkMigrationCompatibility,
  type MigrationCompatibilityIssue,
  type MigrationCompatibilityReport,
} from "./migration-compatibility.js";
export {
  loadMigrations,
  runMigrations,
  type ApplicationCompatibility,
  type MigrationDefinition,
  type MigrationPool,
  type MigrationMetadata,
} from "./migrations.js";
