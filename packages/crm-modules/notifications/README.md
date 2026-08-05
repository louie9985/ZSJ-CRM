# Notifications

Business-neutral Notification Center core for explicit notification intents, immutable versioned templates, actual recipient snapshots, preference decisions, and PostgreSQL-backed in-app user state.

The first-stage PC surface supports list, detail, unread count, mark read, archive, and reference-only realtime refresh signals. The module remains transport-neutral: API composition reloads the authoritative snapshot before WebSocket delivery.

## Invariants

- Intent idempotency is scoped by `producer + idempotencyKey`; reuse with a different fingerprint fails.
- Recipients are stable references resolved by an injected public port. The module never queries organization or domain tables.
- Published template versions are immutable. Notifications retain rendered title, summary, restricted-Markdown body, content digest, and exact template version.
- Title and summary use plain-text Mustache. Body templates use restricted Markdown Mustache. Links, images, headings, tables, fenced code, raw HTML, raw tags, sections, partials, helpers, prototype names, missing variables, unknown variables, and invalid values fail closed.
- `owner`, `sender`, and `time` are resolved at generation time. Historical snapshots never change when a person is renamed or a template version is reactivated.
- Intent v2 resolves the active template exactly once when first accepted. Intent v1 remains supported for explicit-version replay.
- Deep links contain only `applicationId + routeId`, stable resource references, and bounded non-sensitive parameters. Arbitrary URLs are not accepted.
- In-app read/archive state is principal scoped and idempotent. It never changes Task or domain state.
- Suppression is a recorded preference decision, not deletion of the accepted intent or recipient fact.

## Failure and recovery

- Authorization, audit, recipient resolution, validation, and storage failures use stable errors and fail closed.
- Intent and recipient/in-app facts are inserted in one PostgreSQL transaction. Concurrent duplicate requests return the original result.
- Migrations `0000000009_notifications.sql` and `0000000023_notification_templates_realtime_snapshots.sql` are additive. After production use, forward-fix and preserve accepted intent/read-state and release history instead of dropping the schema.
- RabbitMQ realtime events carry only notification references and versions. PostgreSQL notification facts are authoritative; transport failure falls back to HTTP synchronization and must not delete or rewrite them.

## Verification

```text
pnpm --filter @ai-crm/crm-notifications lint
pnpm --filter @ai-crm/crm-notifications typecheck
pnpm --filter @ai-crm/crm-notifications test
pnpm --filter @ai-crm/crm-notifications test:integration
pnpm --filter @ai-crm/crm-notifications build
```

No WeCom, WeChat, SMS, email, system desktop push, provider adapter, CRM notification type, recipient policy, or production SLA is implemented here.
