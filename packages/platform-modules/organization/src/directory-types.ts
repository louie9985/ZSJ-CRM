import type { ActorReference } from "./types.js";

export interface OrganizationDirectoryMetadata {
  readonly actor: ActorReference;
  readonly operationId: string;
  readonly reason: string;
  readonly traceId: string;
}
export interface WorkforcePersonProfile { readonly workforcePersonId: string; readonly realName: string; readonly revision: number; readonly updatedAt: string }
export interface DepartmentDirectoryEntry { readonly organizationUnitId: string; readonly name: string; readonly normalizedName: string; readonly parentOrganizationUnitId?: string | undefined; readonly active: boolean; readonly rootLocked: boolean; readonly revision: number; readonly updatedAt: string }
export interface PositionDirectoryEntry { readonly positionId: string; readonly organizationUnitId: string; readonly name: string; readonly normalizedName: string; readonly active: boolean; readonly revision: number; readonly updatedAt: string }
export interface DepartmentTreeNode extends DepartmentDirectoryEntry { readonly children: readonly DepartmentTreeNode[] }
export interface OrganizationDirectoryAuthorizer { authorize(input: { readonly action: string; readonly actor: ActorReference; readonly entityId: string; readonly entityType: "department" | "position" | "workforce_person_profile"; readonly operationId: string }): Promise<void> }
export interface UpsertWorkforcePersonProfileCommand extends OrganizationDirectoryMetadata { readonly workforcePersonId: string; readonly realName: string; readonly expectedRevision?: number; readonly updatedAt: string }
export interface CreateDepartmentCommand extends OrganizationDirectoryMetadata { readonly organizationUnitId: string; readonly name: string; readonly parentOrganizationUnitId?: string; readonly rootLocked?: boolean; readonly updatedAt: string }
export interface UpdateDepartmentCommand extends OrganizationDirectoryMetadata { readonly organizationUnitId: string; readonly expectedRevision: number; readonly name?: string; readonly parentOrganizationUnitId?: string | null; readonly updatedAt: string }
export interface SetDepartmentActiveCommand extends OrganizationDirectoryMetadata { readonly organizationUnitId: string; readonly expectedRevision: number; readonly active: boolean; readonly updatedAt: string }
export interface CreateDirectoryPositionCommand extends OrganizationDirectoryMetadata { readonly positionId: string; readonly organizationUnitId: string; readonly name: string; readonly updatedAt: string }
export interface UpdateDirectoryPositionCommand extends OrganizationDirectoryMetadata { readonly positionId: string; readonly expectedRevision: number; readonly name: string; readonly updatedAt: string }
export interface SetPositionActiveCommand extends OrganizationDirectoryMetadata { readonly positionId: string; readonly expectedRevision: number; readonly active: boolean; readonly updatedAt: string }
export interface OrganizationDirectoryServiceApi {
  createDepartment(command: CreateDepartmentCommand): Promise<DepartmentDirectoryEntry>;
  createPosition(command: CreateDirectoryPositionCommand): Promise<PositionDirectoryEntry>;
  getPersonProfile(workforcePersonId: string): Promise<WorkforcePersonProfile>;
  listDepartmentTree(input?: { readonly includeInactive?: boolean }): Promise<readonly DepartmentTreeNode[]>;
  listPositions(organizationUnitId: string, input?: { readonly includeInactive?: boolean }): Promise<readonly PositionDirectoryEntry[]>;
  setDepartmentActive(command: SetDepartmentActiveCommand): Promise<DepartmentDirectoryEntry>;
  setPositionActive(command: SetPositionActiveCommand): Promise<PositionDirectoryEntry>;
  updateDepartment(command: UpdateDepartmentCommand): Promise<DepartmentDirectoryEntry>;
  updatePosition(command: UpdateDirectoryPositionCommand): Promise<PositionDirectoryEntry>;
  upsertPersonProfile(command: UpsertWorkforcePersonProfileCommand): Promise<WorkforcePersonProfile>;
}
