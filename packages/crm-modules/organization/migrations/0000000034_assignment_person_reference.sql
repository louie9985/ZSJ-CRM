create unique index if not exists assignments_id_person_unique_idx
  on organization.assignments(assignment_id, workforce_person_id);

alter table organization.assignments
  add constraint assignments_id_person_unique
  unique using index assignments_id_person_unique_idx;
