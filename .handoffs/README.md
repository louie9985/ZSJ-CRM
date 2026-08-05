# Temporary Task Handoffs

Use one file per active task, named after its task identifier. Handoffs may contain current status, changed files, pending checks, blockers, and temporary assumptions.

Permanent business rules, contracts, and architecture decisions must be promoted to their authoritative locations before a task is closed.

Historical handoffs are point-in-time execution records and are not rewritten when architecture changes. Any Drizzle-as-current-baseline statement in an older handoff was superseded on 2026-07-31 by ADR-0028 and `.handoffs/ORM-PRISMA-01.md`.

Any Keycloak, OIDC, external identity, subject association, credential ceremony, external portal, or WeChat Mini Program statement in an older handoff was superseded on 2026-08-04 by ADR-0034. Those references are historical evidence only and must never be used to restore removed runtime code or contracts.
