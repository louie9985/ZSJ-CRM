import { OrganizationError } from "./errors.js";
import type { OrganizationDirectoryCommit, OrganizationDirectoryStore } from "./directory-store.js";
import type { DepartmentDirectoryEntry, PositionDirectoryEntry, WorkforcePersonProfile } from "./directory-types.js";

export class InMemoryOrganizationDirectoryStore implements OrganizationDirectoryStore {
  readonly #departments = new Map<string, DepartmentDirectoryEntry>();
  readonly #positions = new Map<string, PositionDirectoryEntry>();
  readonly #profiles = new Map<string, WorkforcePersonProfile>();
  readonly #operations = new Map<string, string>();
  readonly #assignmentReferences = new Set<string>();

  markActiveAssignmentReference(reference: { readonly organizationUnitId: string; readonly positionId: string }): void {
    this.#assignmentReferences.add(`d:${reference.organizationUnitId}`);
    this.#assignmentReferences.add(`p:${reference.positionId}`);
  }
  commit(command: OrganizationDirectoryCommit): Promise<{ readonly replayed: boolean }> {
    const previous = this.#operations.get(command.operationId);
    if (previous !== undefined) {
      if (previous !== command.fingerprint) throw new OrganizationError("idempotency_conflict");
      return Promise.resolve({ replayed: true });
    }
    const departments = new Map(this.#departments); const positions = new Map(this.#positions); const profiles = new Map(this.#profiles);
    this.#apply(command, departments, positions, profiles);
    this.#departments.clear(); departments.forEach((v, k) => this.#departments.set(k, v));
    this.#positions.clear(); positions.forEach((v, k) => this.#positions.set(k, v));
    this.#profiles.clear(); profiles.forEach((v, k) => this.#profiles.set(k, v));
    this.#operations.set(command.operationId, command.fingerprint);
    return Promise.resolve({ replayed: false });
  }
  findDepartment(id: string): Promise<DepartmentDirectoryEntry | undefined> { return Promise.resolve(this.#departments.get(id)); }
  findPersonProfile(id: string): Promise<WorkforcePersonProfile | undefined> { return Promise.resolve(this.#profiles.get(id)); }
  findPosition(id: string): Promise<PositionDirectoryEntry | undefined> { return Promise.resolve(this.#positions.get(id)); }
  hasActiveAssignmentReferences(input: { readonly organizationUnitId?: string; readonly positionId?: string }): Promise<boolean> { return Promise.resolve(Boolean((input.organizationUnitId && this.#assignmentReferences.has(`d:${input.organizationUnitId}`)) || (input.positionId && this.#assignmentReferences.has(`p:${input.positionId}`)))); }
  listDepartments(): Promise<readonly DepartmentDirectoryEntry[]> { return Promise.resolve([...this.#departments.values()]); }
  listPositions(id: string): Promise<readonly PositionDirectoryEntry[]> { return Promise.resolve([...this.#positions.values()].filter((item) => item.organizationUnitId === id)); }

  #apply(command: OrganizationDirectoryCommit, departments: Map<string, DepartmentDirectoryEntry>, positions: Map<string, PositionDirectoryEntry>, profiles: Map<string, WorkforcePersonProfile>): void {
    const mutation = command.mutation;
    if (mutation.kind === "upsert_person_profile") {
      const old = profiles.get(mutation.profile.workforcePersonId);
      if ((old?.revision ?? undefined) !== mutation.expectedRevision) throw new OrganizationError("entity_conflict");
      profiles.set(mutation.profile.workforcePersonId, mutation.profile); return;
    }
    if (mutation.kind === "create_department") {
      if (departments.has(mutation.department.organizationUnitId)) throw new OrganizationError("entity_conflict");
      this.#departmentName(departments, mutation.department); departments.set(mutation.department.organizationUnitId, mutation.department); return;
    }
    if (mutation.kind === "create_position") {
      if (positions.has(mutation.position.positionId)) throw new OrganizationError("entity_conflict");
      this.#positionName(positions, mutation.position); positions.set(mutation.position.positionId, mutation.position); return;
    }
    if (mutation.kind === "update_department" || mutation.kind === "set_department_active") {
      const old = departments.get(mutation.departmentId);
      if (!old) throw new OrganizationError("entity_not_found");
      if (old.revision !== mutation.expectedRevision) throw new OrganizationError("entity_conflict");
      const next: DepartmentDirectoryEntry = mutation.kind === "update_department"
        ? { ...old, ...(mutation.name ? { name: mutation.name, normalizedName: mutation.normalizedName ?? old.normalizedName } : {}), ...(mutation.parentOrganizationUnitId === undefined ? {} : { parentOrganizationUnitId: mutation.parentOrganizationUnitId ?? undefined }), revision: old.revision + 1, updatedAt: mutation.updatedAt }
        : { ...old, active: mutation.active, revision: old.revision + 1, updatedAt: mutation.updatedAt };
      this.#departmentName(departments, next); departments.set(old.organizationUnitId, next); return;
    }
    const old = positions.get(mutation.positionId);
    if (!old) throw new OrganizationError("entity_not_found");
    if (old.revision !== mutation.expectedRevision) throw new OrganizationError("entity_conflict");
    const next = mutation.kind === "update_position"
      ? { ...old, name: mutation.name, normalizedName: mutation.normalizedName, revision: old.revision + 1, updatedAt: mutation.updatedAt }
      : { ...old, active: mutation.active, revision: old.revision + 1, updatedAt: mutation.updatedAt };
    this.#positionName(positions, next); positions.set(old.positionId, next);
  }
  #departmentName(records: Map<string, DepartmentDirectoryEntry>, candidate: DepartmentDirectoryEntry): void {
    if ([...records.values()].some((item) => item.organizationUnitId !== candidate.organizationUnitId && item.active && candidate.active && item.parentOrganizationUnitId === candidate.parentOrganizationUnitId && item.normalizedName === candidate.normalizedName)) throw new OrganizationError("entity_conflict");
  }
  #positionName(records: Map<string, PositionDirectoryEntry>, candidate: PositionDirectoryEntry): void {
    if ([...records.values()].some((item) => item.positionId !== candidate.positionId && item.active && candidate.active && item.organizationUnitId === candidate.organizationUnitId && item.normalizedName === candidate.normalizedName)) throw new OrganizationError("entity_conflict");
  }
}
