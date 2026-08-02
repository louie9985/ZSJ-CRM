# Workforce Access

Owns the business-neutral workforce account directory, durable provisioning state, optimistic revisions, and login-identifier history. It stores stable Keycloak user references but never passwords, credentials, tokens, sessions, email requirements, or Keycloak provider data.

Usernames are normalized case-insensitively and remain permanently occupied. Phone input is normalized by removing spaces and hyphens; an old phone remains occupied until an explicit audited release operation. Account deletion is represented by the `disabled` state and does not erase history.

Every mutation requires server-side authorization, an idempotency operation ID, trace reference, reason, and expected revision where an account already exists. The store commits the state mutation and durable operation receipt atomically. Keycloak calls remain application-composed adapters and are never made by this module.

Keycloak synchronization is projected separately from account access state. `identity_sync_operations` records only stable account/operation references, a bounded action and result category, timestamps, safe trace references, and explicit retry lineage. It never stores usernames, phone numbers, provider responses, credentials, or message payloads. A failed disable or session-revocation synchronization does not reopen local access. Controlled retry creates a new operation linked to exactly one failed predecessor and must re-read current account facts before a new Job is submitted.

The package exports memory and narrow Prisma-backed persistence adapters. Database rows, Prisma generated types, raw queries, and transaction clients are not public contracts.
