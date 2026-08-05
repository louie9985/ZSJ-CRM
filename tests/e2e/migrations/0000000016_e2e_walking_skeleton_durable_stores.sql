CREATE SCHEMA IF NOT EXISTS e2e_walking_skeleton;

REVOKE ALL ON SCHEMA e2e_walking_skeleton FROM PUBLIC;

CREATE TABLE e2e_walking_skeleton.source_tasks (
  source_task_id varchar(255) PRIMARY KEY,
  workflow_task_id varchar(255) NOT NULL,
  actor_context_reference varchar(255) NOT NULL,
  assignee_reference varchar(255) NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  status varchar(16) NOT NULL CHECK (status IN ('open', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE e2e_walking_skeleton.source_command_receipts (
  idempotency_key varchar(128) PRIMARY KEY,
  command_fingerprint char(64) NOT NULL,
  source_command_id uuid NOT NULL,
  source_task_id varchar(255) NOT NULL REFERENCES e2e_walking_skeleton.source_tasks(source_task_id),
  lifecycle_event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_command_receipt_object CHECK (jsonb_typeof(lifecycle_event) = 'object')
);

CREATE INDEX source_command_receipts_source_task_idx
  ON e2e_walking_skeleton.source_command_receipts (source_task_id);

CREATE TABLE e2e_walking_skeleton.workflow_command_ledger (
  operation varchar(32) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  command_fingerprint char(64) NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('running', 'completed', 'reconciliation_required')),
  result_json jsonb,
  source_revision integer CHECK (source_revision IS NULL OR source_revision > 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation, idempotency_key),
  CONSTRAINT workflow_command_state CHECK (
    (status = 'running' AND result_json IS NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status = 'completed' AND result_json IS NOT NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (status = 'reconciliation_required' AND result_json IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE TABLE e2e_walking_skeleton.workflow_revisions (
  revision_scope varchar(255) PRIMARY KEY,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON SCHEMA e2e_walking_skeleton IS
  'Synthetic E2E-only facts; never installed by application startup or production deployment.';

GRANT USAGE ON SCHEMA e2e_walking_skeleton TO ai_crm_runtime;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA e2e_walking_skeleton TO ai_crm_runtime;

-- The disposable E2E orchestrator composes API and Worker responsibilities in one process.
-- These grants are never installed by production deployment or application startup.
GRANT USAGE ON SCHEMA crm_eventing, crm_notifications TO ai_crm_runtime;
GRANT SELECT, INSERT, UPDATE ON crm_eventing.outbox_messages, crm_eventing.job_requests TO ai_crm_runtime;
GRANT SELECT, INSERT ON crm_eventing.inbox_receipts, crm_eventing.isolations TO ai_crm_runtime;
GRANT SELECT, INSERT ON crm_notifications.template_releases, crm_notifications.notification_intents TO ai_crm_runtime;
GRANT SELECT, INSERT, UPDATE ON crm_notifications.in_app_notifications TO ai_crm_runtime;
