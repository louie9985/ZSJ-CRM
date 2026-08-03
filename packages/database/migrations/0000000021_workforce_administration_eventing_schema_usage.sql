DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ai_crm_runtime') THEN
    RAISE EXCEPTION 'required database role ai_crm_runtime is absent' USING ERRCODE = '42704';
  END IF;

  GRANT USAGE ON SCHEMA platform_eventing TO ai_crm_runtime;
END
$$;
