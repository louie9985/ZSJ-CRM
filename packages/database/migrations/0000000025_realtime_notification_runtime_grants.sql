DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ai_crm_runtime') THEN
    RAISE EXCEPTION 'required database role ai_crm_runtime is absent' USING ERRCODE = '42704';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ai_crm_worker_runtime') THEN
    RAISE EXCEPTION 'required database role ai_crm_worker_runtime is absent' USING ERRCODE = '42704';
  END IF;

  GRANT SELECT, INSERT ON
    platform_notifications.template_definitions,
    platform_notifications.template_draft_operations,
    platform_notifications.template_releases,
    platform_notifications.template_activation_history,
    platform_notifications.notification_intents
  TO ai_crm_runtime;

  GRANT SELECT, INSERT, UPDATE ON
    platform_notifications.template_drafts,
    platform_notifications.current_template_release,
    platform_notifications.in_app_notifications
  TO ai_crm_runtime;

  GRANT INSERT ON platform_eventing.outbox_messages TO ai_crm_worker_runtime;
END
$$;
