# API

The API composes CRM-internal core modules and exposes one employee `AccountAccessApplicationService` plus an isolated part-time access service. The single CRM Web artifact uses `pc` for desktop and employee mobile routes; `part-time` is a separate identity surface.

Both surfaces use independent `__Host-` HttpOnly, Secure, SameSite=Lax cookies containing random opaque Session handles. Redis stores the server-side Session record with `accountId`, `securityRevision`, surface, CSRF token, selected Assignment, and timestamps. Idle lifetime is 30 minutes, absolute lifetime is 8 hours, and one account may have only one Session per surface.

Required Session configuration:

- `AI_CRM_PC_ALLOWED_ORIGIN`
- `AI_CRM_INTERNAL_H5_ALLOWED_ORIGIN`
- `AI_CRM_REDIS_URL`
- `AI_CRM_REDIS_PASSWORD_FILE`
- `AI_CRM_REDIS_CONNECT_TIMEOUT_MS`
- `AI_CRM_SESSION_INDEX_KEY_FILE`

The index key is a 32-byte base64url Secret used only for keyed Redis indexes. Passwords, hashes, cookies, request bodies, and identity values never enter logs, traces, operation fingerprints, or errors.

Production additionally requires the typed database, migration, file-center, lifecycle, and observability configuration declared by `production-config.ts`. Startup checks reviewed migrations but never applies them. Use `pnpm local:infra`, `pnpm local:migrate`, `pnpm local:bootstrap`, and `pnpm local:api` for the local stack.
