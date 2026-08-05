CREATE TABLE e2e_walking_skeleton.form_submissions (
  submission_reference varchar(255) PRIMARY KEY,
  submission_fingerprint char(64) NOT NULL,
  definition_id varchar(128) NOT NULL,
  release_version integer NOT NULL CHECK (release_version > 0),
  content_digest char(64) NOT NULL,
  file_id uuid NOT NULL,
  content_version_id uuid NOT NULL,
  file_reference_version integer NOT NULL CHECK (file_reference_version = 1),
  display_name varchar(255) NOT NULL,
  media_type varchar(255),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  trace_id char(32) NOT NULL,
  traceparent varchar(55) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_submission_trace_id CHECK (trace_id ~ '^[0-9a-f]{32}$' AND trace_id <> repeat('0', 32)),
  CONSTRAINT form_submission_traceparent CHECK (
    traceparent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$'
    AND substring(traceparent FROM 4 FOR 32) = trace_id
    AND substring(traceparent FROM 37 FOR 16) <> repeat('0', 16)
  )
);

COMMENT ON TABLE e2e_walking_skeleton.form_submissions IS
  'Synthetic E2E submission references only; stores no submitted form body or file content.';

GRANT SELECT, INSERT ON e2e_walking_skeleton.form_submissions TO ai_crm_runtime;

-- The disposable E2E orchestrator composes otherwise separate API and Worker responsibilities.
-- These grants are installed only by the explicitly invoked E2E migration runner.
GRANT USAGE ON SCHEMA audit, form_schema, crm_task_center TO ai_crm_runtime;
GRANT SELECT, INSERT ON audit.records TO ai_crm_runtime;
GRANT SELECT, INSERT, UPDATE ON audit.operation_receipts TO ai_crm_runtime;
GRANT SELECT, INSERT, UPDATE ON form_schema.drafts, form_schema.release_status TO ai_crm_runtime;
GRANT SELECT, INSERT ON form_schema.releases TO ai_crm_runtime;
GRANT SELECT, INSERT, UPDATE ON form_schema.operation_receipts TO ai_crm_runtime;
GRANT INSERT ON form_schema.outbox_events TO ai_crm_runtime;
GRANT SELECT, INSERT, UPDATE ON crm_task_center.task_projections, crm_task_center.task_commands TO ai_crm_runtime;
GRANT SELECT, INSERT ON crm_task_center.projection_events TO ai_crm_runtime;
GRANT DELETE ON crm_task_center.task_commands TO ai_crm_runtime;
