DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ai_crm_runtime') THEN
    RAISE EXCEPTION 'required database role ai_crm_runtime is absent' USING ERRCODE = '42704';
  END IF;

  GRANT SELECT, INSERT, UPDATE
    ON workforce_access.accounts,
       workforce_access.login_identifier_history,
       workforce_access.identity_sync_operations
    TO ai_crm_runtime;
  GRANT SELECT, INSERT
    ON workforce_access.operations
    TO ai_crm_runtime;

  GRANT SELECT, INSERT
    ON organization.workforce_people,
       organization.organization_units,
       organization.organization_unit_placements,
       organization.positions,
       organization.operation_receipts,
       organization.directory_operation_receipts
    TO ai_crm_runtime;
  GRANT SELECT, INSERT, UPDATE
    ON organization.employments,
       organization.assignments,
       organization.workforce_person_profiles,
       organization.department_directory,
       organization.position_directory
    TO ai_crm_runtime;
  GRANT INSERT
    ON organization.workforce_person_profile_history,
       organization.department_directory_history,
       organization.position_directory_history
    TO ai_crm_runtime;

  GRANT INSERT
    ON platform_eventing.outbox_messages
    TO ai_crm_runtime;
  GRANT SELECT, INSERT
    ON platform_eventing.job_requests
    TO ai_crm_runtime;

  GRANT INSERT
    ON authorization_core.policy_versions,
       authorization_core.policy_publications
    TO ai_crm_runtime;
  GRANT INSERT, UPDATE
    ON authorization_core.current_policy
    TO ai_crm_runtime;
END
$$;
