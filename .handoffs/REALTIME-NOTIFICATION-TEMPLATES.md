# Realtime and Notification Template Implementation Handoff

## Known facts

- ADR-0031 and the versioned source contracts govern this work.
- First client scope is `apps/workbench-web`; realtime business commands remain HTTP.
- Template definitions are module-owned capabilities. Administrators edit content only.
- Production realtime remains disabled until G5 external operations evidence is complete.

## Allowed assumptions

- System display time is `Asia/Shanghai` with `YYYY-MM-DD HH:mm:ss`.
- Fixed CRM system administrators receive template read/manage/publish/activate permissions.
- PC concurrent-session limit defaults to 1 and revocation target defaults to 5 seconds.

## Forbidden assumptions

- Do not add CRM notification types, recipients, approval entities, fields, routes, triggers, SLAs or task transitions.
- Do not add mobile/external realtime, arbitrary URLs, external channels, HTML, Markdown links, scripts, queries or network calls to templates.
- Do not treat WebSocket delivery, notification read state or Task projection as proof of business completion.

## Non-goals

- Task template management, notification orchestration, automatic template rollback, provider adapters and production enablement.

## Unresolved operational evidence

- Production connection ceiling and RabbitMQ/API capacity evidence remain unconfirmed and must not receive a speculative default.
- Realtime RabbitMQ production account provisioning, rotation evidence and two-node failure drill belong to G5 operations evidence.
- No concrete business module has registered a production notification template definition; tests and local acceptance must remain business-neutral and synthetic.
