DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ai_crm_runtime') THEN
    RAISE EXCEPTION 'required database role ai_crm_runtime is absent' USING ERRCODE = '42704';
  END IF;

  INSERT INTO business_configuration.parameter_definitions(parameter_key, definition) VALUES
    ('platform.authentication.pc-session.concurrent-limit', '{"allowedScopes":[{"priority":1,"scopeType":"application"}],"defaultValue":1,"definitionVersion":1,"missingPolicy":"use_default","ownerModule":"platform.authentication","parameterKey":"platform.authentication.pc-session.concurrent-limit","valueSchema":{"maximum":5,"minimum":1,"type":"integer"},"valueType":"integer"}'::jsonb),
    ('platform.authentication.pc-session.revocation-target-seconds', '{"allowedScopes":[{"priority":1,"scopeType":"application"}],"defaultValue":5,"definitionVersion":1,"missingPolicy":"use_default","ownerModule":"platform.authentication","parameterKey":"platform.authentication.pc-session.revocation-target-seconds","valueSchema":{"maximum":60,"minimum":5,"type":"integer"},"valueType":"integer"}'::jsonb)
  ON CONFLICT (parameter_key) DO NOTHING;

  GRANT USAGE ON SCHEMA business_configuration TO ai_crm_runtime;
  GRANT SELECT ON
    business_configuration.parameter_definitions,
    business_configuration.parameter_values,
    business_configuration.parameter_activations,
    business_configuration.parameter_activation_terminations,
    business_configuration.operation_receipts
  TO ai_crm_runtime;
  GRANT INSERT ON
    business_configuration.parameter_values,
    business_configuration.parameter_activations,
    business_configuration.parameter_activation_terminations,
    business_configuration.operation_receipts,
    business_configuration.outbox_events
  TO ai_crm_runtime;
END
$$;
