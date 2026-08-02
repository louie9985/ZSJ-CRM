CREATE TABLE e2e_walking_skeleton.form_submission_command_receipts (
  operation_id uuid PRIMARY KEY,
  submission_reference varchar(255) NOT NULL UNIQUE,
  submission_fingerprint char(64) NOT NULL,
  actor_id varchar(255) NOT NULL,
  workforce_person_id uuid NOT NULL,
  assignment_id uuid,
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
  submitted_at timestamptz NOT NULL,
  CONSTRAINT form_submission_command_fingerprint CHECK (submission_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT form_submission_command_trace CHECK (trace_id ~ '^(?!0{32})[0-9a-f]{32}$'),
  CONSTRAINT form_submission_command_traceparent CHECK (
    traceparent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$'
    AND substring(traceparent FROM 4 FOR 32) = trace_id
    AND substring(traceparent FROM 37 FOR 16) <> repeat('0', 16)
  )
);

CREATE TABLE e2e_walking_skeleton.form_submission_command_outbox (
  event_id uuid PRIMARY KEY,
  submission_reference varchar(255) NOT NULL REFERENCES e2e_walking_skeleton.form_submission_command_receipts(submission_reference),
  event_type varchar(128) NOT NULL CHECK (event_type = 'tests.walking-skeleton.form-submission-accepted.v1'),
  trace_id char(32) NOT NULL,
  traceparent varchar(55) NOT NULL,
  occurred_at timestamptz NOT NULL,
  published_at timestamptz
);

CREATE TABLE e2e_walking_skeleton.task_command_requests (
  operation_id uuid PRIMARY KEY,
  idempotency_key varchar(128) NOT NULL UNIQUE,
  command_fingerprint char(64) NOT NULL CHECK (command_fingerprint ~ '^[0-9a-f]{64}$'),
  submission_reference varchar(255) NOT NULL REFERENCES e2e_walking_skeleton.form_submission_command_receipts(submission_reference),
  source_type varchar(128) NOT NULL,
  source_task_id varchar(255) NOT NULL,
  actor_id varchar(255) NOT NULL,
  workforce_person_id uuid NOT NULL,
  active_assignment_ids uuid[] NOT NULL CHECK (cardinality(active_assignment_ids) > 0),
  trace_id char(32) NOT NULL CHECK (trace_id ~ '^(?!0{32})[0-9a-f]{32}$'),
  traceparent varchar(55) NOT NULL,
  source_command_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT task_command_request_traceparent CHECK (
    traceparent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$'
    AND substring(traceparent FROM 4 FOR 32) = trace_id
    AND substring(traceparent FROM 37 FOR 16) <> repeat('0', 16)
  )
);

COMMENT ON TABLE e2e_walking_skeleton.form_submission_command_receipts IS
  'Test-scoped idempotent command receipts; stores no submitted form data or file content.';
COMMENT ON TABLE e2e_walking_skeleton.form_submission_command_outbox IS
  'Test-scoped transactional Outbox evidence; it is not a production message transport.';
COMMENT ON TABLE e2e_walking_skeleton.task_command_requests IS
  'Test-scoped Task command request metadata linked to a server Form submission receipt; stores no submitted data.';

GRANT SELECT, INSERT ON e2e_walking_skeleton.form_submission_command_receipts TO ai_crm_runtime;
GRANT SELECT, INSERT, UPDATE ON e2e_walking_skeleton.form_submission_command_outbox TO ai_crm_runtime;
GRANT SELECT, INSERT ON e2e_walking_skeleton.task_command_requests TO ai_crm_runtime;
