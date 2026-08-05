alter table workforce_access.accounts
  drop column if exists keycloak_user_id,
  add column if not exists security_revision integer not null default 0;

alter table workforce_access.accounts
  alter column workforce_person_id set not null;

create unique index if not exists workforce_access_accounts_person_unique
  on workforce_access.accounts(workforce_person_id);

alter table workforce_access.accounts drop constraint if exists workforce_access_accounts_status_check;
alter table workforce_access.accounts
  add constraint workforce_access_accounts_status_check check (status in ('active','disabled'));

create table if not exists workforce_access.password_credentials (
  account_id uuid primary key references workforce_access.accounts(account_id) on delete restrict,
  password_hash text not null,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null,
  constraint password_credentials_hash_bounded check (length(password_hash) between 32 and 1024)
);

drop table if exists workforce_access.identity_sync_operations;

comment on table workforce_access.password_credentials is
  'Argon2id password hashes owned by workforce-access. Plaintext passwords never enter this table.';

grant select, insert, update on workforce_access.password_credentials to ai_crm_runtime;
