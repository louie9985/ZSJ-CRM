import { createMemoryOrganizationStore } from "./memory-store.js";
import { createPrismaOrganizationStore, type OrganizationPersistenceRuntime } from "./postgres-store.js";
import { OrganizationService } from "./service.js";
import type { OrganizationCommandAuthorizer, OrganizationServiceApi } from "./types.js";

export function createMemoryOrganizationService(authorizer: OrganizationCommandAuthorizer): OrganizationServiceApi {
  return new OrganizationService(createMemoryOrganizationStore(), authorizer);
}

export function createPostgresOrganizationService(
  executor: OrganizationPersistenceRuntime,
  authorizer: OrganizationCommandAuthorizer,
): OrganizationServiceApi {
  return createPrismaOrganizationService(executor, authorizer);
}

export function createPrismaOrganizationService(
  executor: OrganizationPersistenceRuntime,
  authorizer: OrganizationCommandAuthorizer,
): OrganizationServiceApi {
  return new OrganizationService(createPrismaOrganizationStore(executor), authorizer);
}
