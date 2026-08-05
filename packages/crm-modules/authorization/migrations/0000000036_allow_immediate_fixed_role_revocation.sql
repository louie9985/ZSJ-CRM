alter table authorization_core.fixed_role_grants
  drop constraint if exists fixed_role_grants_revoked_after_granted;

alter table authorization_core.fixed_role_grants
  add constraint fixed_role_grants_revoked_after_granted
  check (revoked_at is null or revoked_at >= granted_at);

create index if not exists fixed_role_grants_person_revocation_idx
  on authorization_core.fixed_role_grants(workforce_person_id, revoked_at);
