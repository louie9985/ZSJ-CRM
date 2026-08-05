import type { DepartmentDirectoryEntry, PositionDirectoryEntry, WorkforcePersonProfile } from "./directory-types.js";

export type OrganizationDirectoryMutation =
  | { readonly kind: "upsert_person_profile"; readonly profile: WorkforcePersonProfile; readonly expectedRevision?: number | undefined }
  | { readonly department: DepartmentDirectoryEntry; readonly kind: "create_department" }
  | { readonly departmentId: string; readonly expectedRevision: number; readonly kind: "update_department"; readonly name?: string; readonly normalizedName?: string | undefined; readonly parentOrganizationUnitId?: string | null; readonly updatedAt: string }
  | { readonly active: boolean; readonly departmentId: string; readonly expectedRevision: number; readonly kind: "set_department_active"; readonly updatedAt: string }
  | { readonly kind: "create_position"; readonly position: PositionDirectoryEntry }
  | { readonly expectedRevision: number; readonly kind: "update_position"; readonly name: string; readonly normalizedName: string; readonly positionId: string; readonly updatedAt: string }
  | { readonly active: boolean; readonly expectedRevision: number; readonly kind: "set_position_active"; readonly positionId: string; readonly updatedAt: string };
export interface OrganizationDirectoryCommit { readonly fingerprint: string; readonly operationId: string; readonly mutation: OrganizationDirectoryMutation }
export interface OrganizationDirectoryStore {
  commit(command: OrganizationDirectoryCommit): Promise<{ readonly replayed: boolean }>;
  findDepartment(id: string): Promise<DepartmentDirectoryEntry | undefined>;
  findPersonProfile(id: string): Promise<WorkforcePersonProfile | undefined>;
  findPosition(id: string): Promise<PositionDirectoryEntry | undefined>;
  hasActiveAssignmentReferences(input: { readonly organizationUnitId?: string; readonly positionId?: string }): Promise<boolean>;
  listDepartments(): Promise<readonly DepartmentDirectoryEntry[]>;
  listPositions(organizationUnitId: string): Promise<readonly PositionDirectoryEntry[]>;
}
