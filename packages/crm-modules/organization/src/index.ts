export { OrganizationError, type OrganizationErrorCode } from "./errors.js";
export { createMemoryOrganizationService, createPostgresOrganizationService, createPrismaOrganizationService } from "./factory.js";
export type { OrganizationPersistenceResult, OrganizationPersistenceRuntime } from "./postgres-store.js";
export type {
  ActorReference,
  Assignment,
  CloseEffectiveFactCommand,
  CommandMetadata,
  CreateAssignmentCommand,
  CreateEmploymentCommand,
  CreateOrganizationUnitCommand,
  CreateOrganizationUnitPlacementCommand,
  CreatePositionCommand,
  CreateWorkforcePersonCommand,
  EffectiveInterval,
  Employment,
  OrganizationUnit,
  OrganizationUnitPlacement,
  OrganizationCommandAuthorizationRequest,
  OrganizationCommandAuthorizer,
  OrganizationServiceApi,
  Position,
  WorkforcePersonContext,
  WorkforcePerson,
} from "./types.js";

export const packageId = "@ai-crm/crm-organization" as const;
export { InMemoryOrganizationDirectoryStore } from "./directory-memory-store.js";
export { createPostgresOrganizationDirectoryStore, createPrismaOrganizationDirectoryStore, type OrganizationDirectoryPersistenceRuntime } from "./directory-postgres-store.js";
export { OrganizationDirectoryService } from "./directory-service.js";
export type { CreateDepartmentCommand, CreateDirectoryPositionCommand, DepartmentDirectoryEntry, DepartmentTreeNode, OrganizationDirectoryAuthorizer, OrganizationDirectoryServiceApi, PositionDirectoryEntry, SetDepartmentActiveCommand, SetPositionActiveCommand, UpdateDepartmentCommand, UpdateDirectoryPositionCommand, UpsertWorkforcePersonProfileCommand, WorkforcePersonProfile } from "./directory-types.js";
