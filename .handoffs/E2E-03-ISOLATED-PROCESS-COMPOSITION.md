# E2E-03 Isolated Process Composition

## Objective

Add an executable, isolated test composition containing API, Worker, Workbench, Nginx, and the seven existing dependency services without changing production activation behavior.

## Known Facts

- The dependency-only Compose starts PostgreSQL, Redis, RabbitMQ, Keycloak, Flowable, ClamAV, and Nginx.
- Non-production API bindings and Worker handlers deliberately fail closed or remain empty.
- A production Workbench build deliberately uses the maintenance port.
- E2E-02 approved test-only source-command and Notification Job contracts; their handlers are not implemented yet.

## Allowed Assumptions

- `tests/e2e` may own synthetic process entry points and dependency probes.
- A Workbench build may include the development fixture only when an explicit E2E build flag is set by a test-only Dockerfile.
- This step may prove process startup, readiness, routing, isolation, and cleanup before proving the business flow.

## Forbidden Assumptions

- Process health does not prove Keycloak login, Workflow completion, messaging, file scanning, or the main E2E.
- Test bindings, actors, routes, handlers, and images cannot be enabled in production.
- No CRM data, real provider, production Secret, or production consumer activation may be introduced.

## Non-goals

- Main Walking Skeleton behavior, production deployment, real COS, recovery drills, and domain modules.

## Authority And References

- `AGENTS.md`
- First-stage implementation plan sections 17 and 18
- Walking Skeleton acceptance checklist sections 2, 17, and 18
- E2E-02 reviewed contracts

## Allowed Paths

- `tests/e2e/`
- `deploy/compose/`
- `deploy/nginx/`
- `apps/workbench-web/` test build selection and E2E Dockerfile only
- `package.json`, `pnpm-lock.yaml`
- relevant static/integration check scripts
- this handoff

## Forbidden Paths

- `packages/domain-modules/`
- production Compose definitions and production activation inputs
- provider adapters and production Secret material

## Contract Changes

None; E2E-02 contracts are consumed unchanged.

## Migration Changes

None. The process composition must not run migrations on startup.

## Dependencies

- API and Worker public entry points, Workbench fixture port, Docker Compose, and Nginx.

## Required Tests

- Test-entrypoint unit tests.
- Effective Compose safety and service-set tests.
- Real isolated Compose build/start/health/routing/cleanup integration.
- `pnpm check`.

## Authorization And Audit

- Synthetic API bindings are available only in the E2E image and accept only synthetic fixture credentials.
- No protected operation may infer production authority from process health.

## Idempotency, Retry And Failure

- This step adds no message handler. Startup, readiness, shutdown, and cleanup must fail closed and be repeatable.

## Observability And Health

- API readiness, Worker health-file readiness, Workbench HTTP health, and edge routing are independently checked.
- Health responses expose no topology, credentials, or payloads.

## Backward Compatibility

- Production entry points and Compose files are unchanged. E2E selection is additive and explicit.

## Deliverables

- Test entry points/images, E2E Compose overlay, Nginx route configuration, integration runner, evidence update.

## Unresolved Questions

- The main E2E handlers and real cross-component state remain E2E-04 work.

## Independent Review

- Authorization: no business operation is enabled; incomplete API ports reject with `e2e_capability_not_composed`.
- Idempotency and retry: no message consumer or business write was added; the runner uses a unique Compose project on every execution.
- Transactions and migrations: the process skeleton performs no business transaction and runs no migration at startup.
- Observability: API, Worker, Workbench, and edge health are independently observable without exposing payloads or credentials.
- Backward compatibility: production application entry points, production Compose activation, and contracts are unchanged.
- Secrets: only temporary test Secret files are generated outside the repository and removed in `finally`.
- Failure behavior: missing capabilities fail closed; failed startup prints bounded diagnostics and still tears down the project.
- Cleanup: the successful run left no matching container, Volume, network, or temporary Secret directory.

## Handoff Result

Completed on 2026-07-30. `pnpm e2e:compose:integration` built the explicit E2E images, started all 10 services, observed every service healthy, verified edge API readiness/liveness and Workbench HTML routing, and then removed the isolated containers, Volumes, networks, and temporary Secrets. The first real run exposed a Worker exit-code-13 event-loop bug; the test-only anchor now holds an abort-cleared timer and the successful rerun proves graceful drain. This result proves only process packaging, health, routing, isolation, and cleanup. `mainWalkingSkeletonReady` remains `false` with five explicit implementation gaps.
