# Organization

Owns workforce people, real-name profiles, employments, named organization units, positions, and effective-dated assignments. It does not own accounts, passwords, Sessions, or role grants.

Internal access requires one account-linked Workforce Person, at least one active Employment, and at least one active Assignment. Transfers, concurrent assignments, and departures close and create effective-dated facts instead of overwriting history. Closing one Assignment revokes only that context and does not imply departure.

`resolveWorkforcePersonContext` accepts a stable Workforce Person ID and explicit evaluation time. Multiple active Assignments remain separate; the caller may select one exact active Assignment, but the module never silently unions them.

Every write requires an idempotency operation ID plus actor, reason, and trace references. Persistence remains private to the module and no other module may query its tables.

See [ADR-0008](../../../docs/08-架构决策/ADR-0008-自研有效期化人员与组织模型.md) and [ADR-0034](../../../docs/08-架构决策/ADR-0034-自建统一内部身份与访问底座.md).
