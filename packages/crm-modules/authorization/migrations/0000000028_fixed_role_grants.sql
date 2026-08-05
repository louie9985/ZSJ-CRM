create table if not exists authorization_core.fixed_role_grants (
  grant_id uuid primary key,
  workforce_person_id uuid not null,
  assignment_id uuid,
  role_key varchar(64) not null,
  granted_at timestamptz not null,
  revoked_at timestamptz,
  operation_id uuid not null unique,
  constraint fixed_role_grants_role_check check (role_key in ('system_administrator','crm_administrator','application_user')),
  constraint fixed_role_grants_scope_check check (
    (role_key = 'system_administrator' and assignment_id is null) or
    (role_key in ('crm_administrator','application_user') and assignment_id is not null)
  ),
  constraint fixed_role_grants_interval_check check (revoked_at is null or revoked_at > granted_at)
);

create index if not exists fixed_role_grants_subject_idx
  on authorization_core.fixed_role_grants(workforce_person_id,assignment_id,revoked_at);

create unique index if not exists fixed_role_grants_active_unique
  on authorization_core.fixed_role_grants(workforce_person_id,role_key,coalesce(assignment_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

comment on table authorization_core.fixed_role_grants is
  'Fixed reviewed role grants. Global system administrator grants have no assignment; other roles are assignment-bound.';

grant select, insert, update on authorization_core.fixed_role_grants to ai_crm_runtime;
