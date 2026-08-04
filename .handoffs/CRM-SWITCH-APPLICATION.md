# CRM Switch Application

## Known Facts

- The authenticated application selector is the existing `/applications` route.
- The CRM shell exposes account actions through the top-bar account menu.
- Logout ends the BFF session; switching applications must preserve it.

## Allowed Assumptions

- Reuse the existing account menu and application selector route.
- Use client-side navigation so switching applications does not invoke logout or change authentication state.

## Forbidden Assumptions

- Do not add applications, roles, grants, assignment switching, or authorization rules.
- Do not infer that navigation to the selector grants access to any application; the existing server-provided application allowlist remains authoritative.

## Non-Goals

- No authentication, session, API, contract, schema, audit, migration, or application-registry changes.
- No changes to logout behavior or the application selector catalog.

## Reference Difference

- The confirmed PC Demo baseline excludes position switching. This change adds application switching only and does not introduce position or Assignment Context switching.

## Verification

- A component test verifies that `切换应用` navigates to `/applications` and does not call `logout`.
- Workbench Web typecheck and lint pass.
