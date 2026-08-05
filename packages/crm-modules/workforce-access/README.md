# Workforce Access

Owns the business-neutral internal account directory, normalized username/phone history, Argon2id password credentials, optimistic revision, and monotonic `securityRevision`. It does not own organization facts, role grants, browser Sessions, or external identities.

Usernames are case-insensitive and permanently occupied. Phone values are normalized by removing spaces and hyphens; historical values remain occupied until an explicit audited release. Accounts have only `active` and `disabled` states. Passwords are 8-64 printable ASCII characters and are persisted only as the fixed Argon2id profile.

Password replacement updates the credential and increments `securityRevision` in one transaction. Session validation compares the stored revision on every protected request, so a password reset invalidates old Sessions even when Redis cleanup fails.

The public package exports narrow account and credential ports. Database rows, Prisma generated types, raw queries, transaction clients, password text, and password-derived values are not public contracts.
