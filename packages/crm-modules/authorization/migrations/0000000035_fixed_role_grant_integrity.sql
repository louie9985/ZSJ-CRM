alter table authorization_core.fixed_role_grants
  add constraint fixed_role_grants_workforce_person_fk
  foreign key (workforce_person_id)
  references organization.workforce_people(workforce_person_id);

alter table authorization_core.fixed_role_grants
  add constraint fixed_role_grants_assignment_person_fk
  foreign key (assignment_id, workforce_person_id)
  references organization.assignments(assignment_id, workforce_person_id);

create function authorization_core.guard_fixed_role_grant_revocation()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null or new.revoked_at is null then
    raise exception 'fixed-role revocation is immutable' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger fixed_role_grants_revocation_guard
before update of revoked_at on authorization_core.fixed_role_grants
for each row execute function authorization_core.guard_fixed_role_grant_revocation();
