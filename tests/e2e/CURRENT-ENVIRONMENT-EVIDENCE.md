# E2E-01 Environment Evidence

- Date: 2026-07-30
- Scope: repository/local dependency readiness, a business-neutral in-process platform slice, an isolated 10-service process skeleton, a durable PostgreSQL + Flowable + RabbitMQ main slice, and a real File Center + ClamAV slice
- Result: the durable source/Workflow/Eventing/Notification slice and file-scan slice are executable and repeatably cleaned up; the browser/BFF/API/Task-projection/Trace-composed main Walking Skeleton remains incomplete

Fresh local verification:

- `pnpm e2e:main-chain:integration`: passed with `status=e2e-main-chain-durable-slice-passed`, `durable=true`, completed real Flowable task and instance, PostgreSQL-backed Workflow Ledger/source/Outbox/Inbox/Notification, TLS RabbitMQ Confirm/manual ACK, `inboxDuplicates=2`, `notifications=1`, `sourceAuthorizations=1`, and `sourceVersion=2`. A first run failed closed on insufficient Notification table grants; the test-only migration was corrected without changing production grants, and both failed and successful runs removed containers, networks, Volumes, and temporary Secrets.
- `pnpm e2e:file-clamav:integration`: passed against `clamav/clamav:1.4.5-debian`; clean content became `available`, EICAR content became `quarantined`, duplicate clean/malicious scan operations replayed, and an unavailable scanner left content `pending_scan` with a retryable failure. The isolated container, network, and Volume were removed.
- `pnpm e2e:compose:integration`: passed with `status=e2e-process-composition-passed`; API, Worker, Workbench, Nginx, PostgreSQL, Redis, RabbitMQ, Keycloak, Flowable, and ClamAV all became healthy. The edge route returned successful API readiness/liveness and Workbench HTML, after which the isolated containers, networks, Volumes, and temporary Secret directory were removed.
- `pnpm e2e:rabbit-jobs:integration`: passed with `status=e2e-rabbit-jobs-passed`, `inboxDuplicates=2`, `notifications=1`, and `sourceVersion=2`. Two test-only Jobs traveled through real TLS RabbitMQ, Outbox Confirm publication, Worker consumption/manual ACK, and Eventing Inbox duplicate recognition; the isolated container, network, Volume, and temporary TLS/account directory were then removed.
- `pnpm e2e:flowable-workflow:integration`: passed with `status=e2e-flowable-workflow-passed`, completed real Flowable task and process instance, `sourceAuthorizations=1`, `sourceVersion=2`, and `workflowCompletionEvents=1`. The isolated PostgreSQL/Flowable containers, network, Volume, and temporary Secret directory were then removed.
- `pnpm compose:test:integration`: passed; all seven dependency services became healthy, then the isolated containers, networks, Volumes, and temporary Secret directory were removed.
- `node tests/e2e/environment-preflight.mjs`: passed with `composeScope=full-process-skeleton`, the exact 10-service set, `contractBlockers=[]`, four remaining implementation gaps, and `mainWalkingSkeletonReady=false`.
- `node --test tests/e2e/environment-preflight.test.mjs`: 2/2 passed.
- `pnpm auth:test:integration`: 181/181 passed, including the real Keycloak/Redis integration paths.
- `pnpm db:test:integration`: 40/40 passed.
- `node scripts/check/run-rabbitmq-integration.mjs`: 10/10 TLS, permission, Confirm/Return, ACK, and redelivery checks passed.
- Flowable 1/1, Eventing Outbox 6/6, Task Center 4/4, Notifications 3/3, and Audit 3/3 isolated integration tests passed.
- Seven PostgreSQL module integration runners (Organization, Authorization, App Registry, Audit, Business Configuration, Form Schema, and File Center) passed 29/29 tests after their direct-Docker cleanup was changed to remove attached anonymous Volumes.
- A before/after comparison of all dangling Docker Volume identifiers around those seven runs was identical (`139 -> 139`, no added or removed identifiers). Existing unrelated and historical dangling Volumes were observed but not deleted.
- Earlier readiness candidate: `pnpm check` passed 140/140 Turbo tasks after the E2E preflight and anonymous-Volume cleanup gate were connected.
- `pnpm --filter @ai-crm/e2e test`: 2/2 passed. The synthetic in-process slice resolved Organization context, loaded App Registry and stable task/notification deep links, published and validated a Form release, deduplicated a Task projection and Notification Intent, denied unauthorized Task detail access, and collected evidence through the four injectable audit ports.
- `pnpm check`: 145/145 Turbo tasks passed after `@ai-crm/e2e` became a workspace package.

The combined main slice now uses PostgreSQL-backed Workflow Ledger, synthetic authoritative source, Eventing Outbox/Inbox, and Notification stores with real Flowable and TLS RabbitMQ. File Center and real ClamAV are proven in a separate isolated slice. These tests still run from a test orchestrator rather than the full API/Worker process composition, do not start an authenticated browser, and do not connect file evidence or full Trace/Audit correlation to task completion. This evidence therefore keeps `mainWalkingSkeletonReady=false` and does not by itself sign off acceptance section 17.

## Executable evidence

| Area | Existing executable entry | What it proves | Main-chain limitation |
|---|---|---|---|
| Full process skeleton | `pnpm e2e:compose:integration` | Explicit test images package API, Worker, and Workbench with the seven dependency services; health, edge routing, graceful Worker drain, isolation, and cleanup execute in Docker Compose. | API bindings reject unfinished operations, Worker consumes no RabbitMQ route, and Workbench renders an explicit E2E Fixture rather than using the real API business flow. |
| Dependency Compose | `pnpm compose:test:integration` | PostgreSQL, Redis, RabbitMQ, Keycloak, Flowable, ClamAV, and Nginx can become healthy in one isolated project. | The Compose definition contains no API, Worker, or client. Nginx returns a fixed local health response and `503` for other routes. |
| Keycloak and Redis | `pnpm auth:test:integration` | Real Keycloak Authorization Code + PKCE, JWKS verification, Redis session creation/rotation/invalidation, and logout with synthetic users. | It invokes API package integration tests, not a browser through a composed API/Nginx/Workbench process. |
| RabbitMQ | `pnpm e2e:rabbit-jobs:integration` and `node scripts/check/run-rabbitmq-integration.mjs` | Real RabbitMQ TLS, hostname validation, exact test-only publisher/consumer permissions, Confirm/Return, both reviewed Job routes, Worker manual ACK, Inbox duplicate delivery, retry topology, and cleanup. | Eventing/source/Notification stores are in memory, the route is test-only, and production Task activation remains disabled. |
| Flowable | `pnpm e2e:flowable-workflow:integration` and `pnpm --filter @ai-crm/platform-workflow test:integration` | Real synthetic BPMN deployment, process start/query/cancel, human-task actions, Task Center completion through the Workflow Facade, source reauthorization, duplicate suppression, and cleanup. | The E2E binding is not installed in the full API/Worker composition and uses memory Ledger/Task/source state. |
| API | `pnpm --filter @ai-crm/api test` and `start` after build | HTTP/BFF/platform adapters and the executable composition root are tested independently. | Production readiness deliberately fails for unavailable providers/adapters; `compose.test.yml` does not start the API. |
| Worker | `pnpm --filter @ai-crm/worker test` and `start` after build | Bootstrap, drain, Rabbit adapter, Outbox publisher, and sealed Task projection handler behavior are tested independently. | Release activation is disabled; no concrete Job Owner, Notification consumer, Workflow consumer, or File Job contract is approved. |
| Durable Flowable/Rabbit/PostgreSQL slice | `pnpm e2e:main-chain:integration` | One synthetic completion crosses real Flowable, PostgreSQL Outbox/Inbox/source/Workflow/Notification stores, TLS RabbitMQ, manual ACK, duplicate delivery, and stable results. | It is not yet installed behind authenticated API/BFF endpoints or the full E2E Worker process and does not include Task projection, browser polling, file evidence, or full Trace. |
| ClamAV | `pnpm e2e:file-clamav:integration` | File Center sends clean and EICAR synthetic content to a real ClamAV daemon and proves available/quarantine/replay/unavailable behavior. | The file chain is not yet joined to form submission and task completion in the durable main slice. |

## Reviewed contracts and remaining implementation gaps

| Acceptance item | Reviewed contract | Remaining implementation gap |
|---|---|---|
| `09-05` | Task source type `tests.walking-skeleton` has one exact formal completion command. | The durable source route passes, but composed E2E API Task bindings still fail closed and expose no authenticated completion endpoint. |
| `17-01` | Existing Keycloak/BFF contracts and synthetic authentication fixtures. | No browser signs in through the full E2E Nginx, Workbench, BFF and Keycloak path. |
| `17-09` | File Center contracts and the real ClamAV conformance slice. | Form submission and stable FileReference evidence are not connected to the durable task-completion slice. |
| `17-16` | W3C propagation and safe telemetry contracts. | Browser-to-Worker Trace propagation and durable Audit correlation are not yet composed. |

These composition gaps prevent the complete browser-to-worker flow from being claimed as the main E2E. The preflight returns `contractBlockers=[]` and continues to return `mainWalkingSkeletonReady=false`. Production activation is outside this test-scoped evidence.
