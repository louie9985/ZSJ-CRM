CREATE TABLE workforce_access.identity_sync_operations (
  operation_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES workforce_access.accounts(account_id),
  action varchar(40) NOT NULL CHECK (action IN ('disable','revoke_sessions','synchronize_login_identifiers')),
  status varchar(16) NOT NULL CHECK (status IN ('pending','succeeded','failed','superseded')),
  retry_of_operation_id uuid UNIQUE REFERENCES workforce_access.identity_sync_operations(operation_id),
  error_code varchar(64),
  trace_id varchar(128) NOT NULL,
  requested_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT identity_sync_retry_not_self CHECK (retry_of_operation_id IS NULL OR retry_of_operation_id <> operation_id),
  CONSTRAINT identity_sync_completion_shape CHECK (
    (status = 'pending' AND completed_at IS NULL AND error_code IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND error_code IN ('eventing_handler_timeout','identity_sync_failed','keycloak_administration_unavailable','keycloak_entity_conflict'))
    OR (status IN ('succeeded','superseded') AND completed_at IS NOT NULL AND error_code IS NULL)
  )
);

CREATE INDEX identity_sync_operations_account_time_idx
  ON workforce_access.identity_sync_operations(account_id, requested_at DESC, operation_id DESC);
