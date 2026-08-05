create schema if not exists part_time_access;

create table if not exists part_time_access.accounts (
  account_id uuid primary key,
  part_time_person_id uuid not null unique,
  username varchar(32) not null,
  username_normalized varchar(32) not null unique,
  phone varchar(21),
  status varchar(24) not null,
  revision integer not null,
  security_revision integer not null default 0,
  created_at timestamptz(6) not null,
  updated_at timestamptz(6) not null,
  constraint part_time_accounts_status_check check (status in ('active', 'disabled'))
);

create table if not exists part_time_access.password_credentials (
  account_id uuid primary key references part_time_access.accounts(account_id) on delete cascade,
  password_hash text not null,
  revision integer not null,
  updated_at timestamptz(6) not null
);

create table if not exists part_time_access.login_identifier_history (
  identifier_id uuid primary key,
  account_id uuid not null references part_time_access.accounts(account_id) on delete cascade,
  kind varchar(16) not null,
  value varchar(64) not null,
  normalized_value varchar(64) not null,
  released_at timestamptz(6),
  constraint part_time_login_identifier_kind_check check (kind in ('username', 'phone'))
);

create unique index if not exists part_time_login_identifier_active_unique
  on part_time_access.login_identifier_history(kind, normalized_value)
  where released_at is null;

create index if not exists part_time_login_identifier_account_idx
  on part_time_access.login_identifier_history(account_id);

grant usage on schema part_time_access to ai_crm_runtime;
grant select on part_time_access.accounts, part_time_access.password_credentials, part_time_access.login_identifier_history to ai_crm_runtime;
