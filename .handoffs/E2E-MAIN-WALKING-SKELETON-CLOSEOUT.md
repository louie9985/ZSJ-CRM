# E2E Main Walking Skeleton Closeout

- Task ID: `E2E-MAIN-WALKING-SKELETON-CLOSEOUT`
- Status: partial closeout; two combined-chain gaps remain
- Scope: close the business-neutral main Walking Skeleton composition gaps

## Known facts

- The isolated E2E unit/composition suite passes and the preflight reports two implementation gaps.
- The API exposes an authenticated Task completion route with session, CSRF/origin, authorization, idempotency and trace tests.
- The isolated E2E Worker installs the Task Projection Consumer.
- Durable Flowable/RabbitMQ/PostgreSQL and File Center/ClamAV slices pass separately.
- `mainWalkingSkeletonReady` remains `false` until the combined acceptance evidence passes.

## Allowed assumptions

- Only synthetic users, workforce context, permissions, forms, files, workflow tasks and notifications are used.
- Test-only adapters and fixtures stay under `tests/` or explicit E2E composition assets.
- Existing reviewed HTTP, Job, Event, authorization, audit and trace contracts remain authoritative.

## Forbidden assumptions

- No CRM domain entity, field, state, role, SLA or approval route may be introduced.
- No production Task source activation, real provider adapter, permanent credential or production Secret may be created.
- Passing isolated slices does not authorize setting `mainWalkingSkeletonReady=true`.

## Non-goals

- Production release, production provider configuration and production readiness claims.
- New business modules or changes to confirmed business boundaries.
- Kubernetes, additional telemetry stacks or a second message transport.

## Unresolved assumptions

- Browser acceptance will reuse the existing Keycloak login-page protocol driver through the full E2E edge unless DOM-level Workbench interaction requires a reviewed browser automation dependency.
- The final Ready flag changes only if the ten-service combined run produces repeatable normal, denied, expired, dependency-failure, retry and recovery evidence; otherwise remaining blockers stay explicit.

## Completed in this tranche

- Real Chromium, Workbench, Nginx, BFF, Keycloak and Redis browser authentication evidence passes.
- Authenticated E2E API Task completion reaches Task Center and the exact Walking Skeleton source command.
- PostgreSQL-backed form submission, stable synthetic FileReference, Task completion, Flowable, Outbox, RabbitMQ, Worker effects, Inbox and durable Audit share one bounded evidence set.
- Denial, inactive form state, dependency failure, retry, idempotent replay, session expiry and browser mutation rejection are covered by focused or real integration tests.

## Remaining blockers

- `17-09`: the FileReference in the durable form/Task chain is synthetic; the separately proven real File Center/ClamAV result is not yet the same reference.
- `17-16`: the browser/BFF login and API Task route are proven separately from the durable Outbox/Worker/Audit trace; one browser-originated trace does not yet span the whole chain.
- The latest ten-service rerun was interrupted by Docker Desktop `EIO`/`EROFS` and API 500/EOF failures. After redirecting test temporary files to `D:`, the final `pnpm check` passed 145/145 tasks; Docker-backed rerun remains an environment blocker.

## Independent review checklist

- Authorization fails closed and is rechecked at Task completion.
- Idempotency survives dependency failure, duplicate delivery and retry.
- PostgreSQL transaction ownership and Outbox/Inbox durability remain intact.
- No migration is modified after deployment; any new schema change is additive and versioned.
- Trace and Audit correlation exclude credentials, cookies, bodies, file content and raw provider payloads.
- Existing API/Worker/client contracts remain backward compatible.
