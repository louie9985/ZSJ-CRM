CREATE SCHEMA workforce_access;

CREATE TABLE workforce_access.accounts (
  account_id uuid PRIMARY KEY,
  workforce_person_id uuid,
  keycloak_user_id uuid UNIQUE,
  username varchar(32) NOT NULL,
  username_normalized varchar(32) NOT NULL,
  phone varchar(21),
  status varchar(24) NOT NULL CHECK (status IN ('provisioning','credential_pending','active','disabled','failed')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
  CONSTRAINT accounts_workforce_person_fk FOREIGN KEY (workforce_person_id)
    REFERENCES organization.workforce_people(workforce_person_id),
  CONSTRAINT accounts_username_format CHECK (username ~ '^[A-Za-z0-9._-]{4,32}$'),
  CONSTRAINT accounts_username_normalized CHECK (username_normalized = lower(username)),
  CONSTRAINT accounts_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{6,20}$')
);

CREATE TABLE workforce_access.login_identifier_history (
  identifier_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES workforce_access.accounts(account_id),
  kind varchar(16) NOT NULL CHECK (kind IN ('username','phone')),
  value varchar(64) NOT NULL,
  normalized_value varchar(64) NOT NULL,
  released_at timestamptz,
  CONSTRAINT username_history_never_released CHECK (kind <> 'username' OR released_at IS NULL)
);
CREATE INDEX login_identifier_history_account_idx ON workforce_access.login_identifier_history(account_id);
CREATE INDEX login_identifier_history_lookup_idx ON workforce_access.login_identifier_history(kind, normalized_value);
CREATE UNIQUE INDEX username_history_permanent_unique ON workforce_access.login_identifier_history(normalized_value) WHERE kind = 'username';
CREATE UNIQUE INDEX phone_history_active_unique ON workforce_access.login_identifier_history(normalized_value) WHERE kind = 'phone' AND released_at IS NULL;

CREATE TABLE workforce_access.operations (
  operation_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  fingerprint varchar(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  status varchar(16) NOT NULL CHECK (status IN ('pending','succeeded','failed')),
  trace_id varchar(128) NOT NULL,
  error_code varchar(64),
  result jsonb,
  recorded_at timestamptz NOT NULL
);
CREATE INDEX operations_account_time_idx ON workforce_access.operations(account_id, recorded_at DESC);
