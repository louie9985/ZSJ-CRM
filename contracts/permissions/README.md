# Permission Catalog

Canonical permission codes, resource types, actions, ownership, and approved role mappings. Generated role matrices may be published here, but authentication credentials never belong here.

Permission declarations are owned by their platform or domain module and reviewed before implementation. Contracts keep function checks separate from structured data-scope resolution, contain no SQL or ORM fragments, and define stable deny/error semantics and policy-version context.

No CRM role, resource, action, or data-scope value may be added until its owning business boundary is confirmed. See [ADR-0007](../../docs/08-架构决策/ADR-0007-自研轻量业务授权核心.md).

External operations declare whether they accept anonymous, invitation-capability, or authenticated access. Invitation capabilities never declare a person identity and cannot be combined with login grants. See [ADR-0019](../../docs/08-架构决策/ADR-0019-外部端分级访问与邀请授权.md).

IAM-03 contract sources:

- `data-scope.v1.schema.json` defines a versioned union of explicit resource-wide terms or conjunctive dimension/value matches. It cannot carry SQL, ORM fragments, table names, scripts, or arbitrary operators.
- `authorization-policy.v1.schema.json` is the immutable legacy snapshot contract. Runtime readers retain fail-closed v1 compatibility.
- `authorization-policy.v2.schema.json` adds explicit application ownership, stable role keys/display names, and separate Workforce Person-bound Super Administrator Grants. A super-administrator grant covers only permissions declared in that exact snapshot; unknown permissions remain denied. New publications use v2.
- `authorization-decision.v1.schema.json` defines allow/deny, stable reason, policy version, evaluation time, and a decision audit reference without exposing internal policy details.
- `protected-policy-publication-command.v1.schema.json` defines the complete transport-neutral internal publication command: stable management/publication IDs, distinct stable audit operation IDs for denial and retryable failure facts, authenticated actor reference, current Workforce Person/Assignment authorization context, non-zero safe Trace reference, reason, and a full immutable non-empty policy snapshot. It deliberately defines no production endpoint, publication permission, role, grant, Owner, or approval route.
- `protected-policy-publication-command.v2.schema.json` preserves those controls while requiring a complete v2 snapshot. v1 publication commands remain historical contract material and are no longer accepted by the publisher.
- `http-permission-binding.v1.schema.json` defines the versioned `x-ai-crm-permission` OpenAPI extension. Its `resource` and `action` are the exact `PermissionRequest`; `code` must equal `resource:action`, and `owner` identifies the declaring module.
- `platform-permission-catalog.v1.json` declares only reviewed business-neutral platform permissions. Its schema intentionally has no role bundle or grant fields. An empty `scopeDimensions` array does not replace current-principal filtering or object-level authorization by the resource-owning module.

The catalog currently covers the protected internal Task Center, Notification, Application Registry, Form Schema, and File Center HTTP operations. A declaration is a stable capability vocabulary only: it creates no Permission row, Role, Grant, policy publication, seed, or default allow. Contract gates require every protected operation binding to match one catalog declaration and every catalog declaration to be used by the reviewed HTTP surface.
