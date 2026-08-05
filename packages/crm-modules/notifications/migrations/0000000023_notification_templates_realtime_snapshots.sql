create table crm_notifications.template_definitions (
  template_key varchar(255) primary key,
  owner_module varchar(255) not null,
  notification_type varchar(255) not null,
  definition_version integer not null check (definition_version > 0),
  allowed_variables jsonb not null,
  variable_catalog_version integer not null check (variable_catalog_version > 0),
  system_sender_name varchar(100) not null,
  enabled boolean not null
);

create table crm_notifications.template_drafts (
  template_key varchar(255) primary key references crm_notifications.template_definitions(template_key),
  revision integer not null check (revision > 0),
  title_template varchar(512) not null,
  summary_template varchar(2000) not null,
  body_template varchar(8000) not null,
  updated_at timestamptz not null
);

create table crm_notifications.template_draft_operations (
  operation_id uuid primary key,
  template_key varchar(255) not null references crm_notifications.template_definitions(template_key),
  expected_revision integer not null check (expected_revision >= 0),
  revision integer not null check (revision > 0),
  title_template varchar(512) not null,
  summary_template varchar(2000) not null,
  body_template varchar(8000) not null,
  updated_at timestamptz not null
);

alter table crm_notifications.template_releases
  add column variable_catalog_version integer,
  add column summary_template varchar(2000),
  add column body_format varchar(32) not null default 'plain-text'
    check (body_format in ('plain-text','restricted-markdown'));

create table crm_notifications.template_activation_history (
  activation_id uuid primary key,
  template_key varchar(255) not null,
  version integer not null,
  activated_at timestamptz not null,
  foreign key (template_key,version) references crm_notifications.template_releases(template_key,version)
);

create table crm_notifications.current_template_release (
  template_key varchar(255) primary key,
  version integer not null,
  activation_id uuid not null unique references crm_notifications.template_activation_history(activation_id),
  activated_at timestamptz not null,
  foreign key (template_key,version) references crm_notifications.template_releases(template_key,version)
);

alter table crm_notifications.in_app_notifications
  add column summary varchar(2000),
  add column body_format varchar(32) not null default 'plain-text'
    check (body_format in ('plain-text','restricted-markdown')),
  add column content_digest char(64),
  add column state_version integer not null default 1 check (state_version > 0);

comment on table crm_notifications.template_definitions is 'Owner-registered notification template capabilities; administrators cannot create keys or variable providers.';
comment on table crm_notifications.template_drafts is 'Mutable administrator-authored notification template drafts protected by optimistic revision.';
comment on table crm_notifications.template_draft_operations is 'Idempotency receipts for notification template draft writes; stores only the resulting template snapshot.';
comment on table crm_notifications.template_activation_history is 'Append-only audit-supporting activation facts, including explicit historical-version rollback.';
comment on column crm_notifications.in_app_notifications.summary is 'Generation-time rendered summary snapshot; null only for notifications created before this migration.';
