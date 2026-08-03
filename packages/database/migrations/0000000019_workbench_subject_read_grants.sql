DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ai_crm_runtime') THEN
    RAISE EXCEPTION 'required database role ai_crm_runtime is absent' USING ERRCODE = '42704';
  END IF;

  GRANT USAGE ON SCHEMA workforce_access TO ai_crm_runtime;
  GRANT SELECT (keycloak_user_id, workforce_person_id, status)
    ON workforce_access.accounts TO ai_crm_runtime;
  GRANT SELECT (workforce_person_id, real_name, revision, updated_at)
    ON organization.workforce_person_profiles TO ai_crm_runtime;
END
$$;
