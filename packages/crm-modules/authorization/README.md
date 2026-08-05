# Authorization

Owns the reviewed Permission catalog, fixed role grants, structured data scopes, and final `allow/deny` decisions. Authentication proves the account Session only; it never grants a resource action by itself.

The fixed roles are:

- `system_administrator`: global and Workforce Person-bound.
- `application_user`: bound to one active Assignment.
- `crm_administrator`: bound to one active Assignment.

An account may hold multiple roles. Evaluation unions the global role with roles for the currently selected active Assignment only. Grants from other Assignments are never merged. Unknown or wildcard permissions fail closed.

Every result can be written to immutable `decision_records`. Recorder or persistence failure makes authorization unavailable. Data scopes remain typed constraints; resource-owning repositories translate them into local queries.

There is no runtime policy publication, policy cache, seeded administrator, or policy management UI. See [ADR-0034](../../../docs/08-架构决策/ADR-0034-自建统一内部身份与访问底座.md).
