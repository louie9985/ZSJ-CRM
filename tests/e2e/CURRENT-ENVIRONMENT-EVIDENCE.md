# E2E-01 Environment Evidence

- Date: 2026-07-30
- Scope: repository/local dependency readiness, a business-neutral in-process platform slice, an isolated 10-service process skeleton, a real RabbitMQ Job transport slice, and a real Flowable Workflow slice
- Result: the dependencies, in-process slice, API/Worker/Workbench process composition, test-only RabbitMQ Job/Worker chain, and test-only Flowable Workflow chain are executable; the complete main Walking Skeleton remains not implemented

Fresh local verification:

- `pnpm e2e:compose:integration`: passed with `status=e2e-process-composition-passed`; API, Worker, Workbench, Nginx, PostgreSQL, Redis, RabbitMQ, Keycloak, Flowable, and ClamAV all became healthy. The edge route returned successful API readiness/liveness and Workbench HTML, after which the isolated containers, networks, Volumes, and temporary Secret directory were removed.
- `pnpm e2e:rabbit-jobs:integration`: passed with `status=e2e-rabbit-jobs-passed`, `inboxDuplicates=2`, `notifications=1`, and `sourceVersion=2`. Two test-only Jobs traveled through real TLS RabbitMQ, Outbox Confirm publication, Worker consumption/manual ACK, and Eventing Inbox duplicate recognition; the isolated container, network, Volume, and temporary TLS/account directory were then removed.
- `pnpm e2e:flowable-workflow:integration`: passed with `status=e2e-flowable-workflow-passed`, completed real Flowable task and process instance, `sourceAuthorizations=1`, `sourceVersion=2`, and `workflowCompletionEvents=1`. The isolated PostgreSQL/Flowable containers, network, Volume, and temporary Secret directory were then removed.
- `pnpm compose:test:integration`: passed; all seven dependency services became healthy, then the isolated containers, networks, Volumes, and temporary Secret directory were removed.
- `node tests/e2e/environment-preflight.mjs`: passed with `composeScope=full-process-skeleton`, the exact 10-service set, `contractBlockers=[]`, five implementation gaps, and `mainWalkingSkeletonReady=false`.
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

The broad in-process slice uses Memory Stores and direct public package APIs. The dedicated Rabbit Job slice adds real TLS RabbitMQ, publisher Confirm, Worker consumption/manual ACK, and duplicate delivery, but its Eventing, authoritative source, and Notification stores remain in memory. The dedicated Flowable slice adds real BPMN deployment, process start, human-task completion, Facade authorization/audit/lifecycle behavior, and source reauthorization, but its Workflow Ledger, Task Center, and source also remain in memory. These two real slices are not yet one composed API/Worker path and do not start a browser or prove the complete authenticated BFF, durable application PostgreSQL, File Center, and ClamAV path. The E2E-02 contract pass removed the five contract blockers but left five explicit implementation gaps. This evidence does not change `mainWalkingSkeletonReady=false` or any item in acceptance section 17.

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
| ClamAV | `apps/worker/src/clamav-scanner.test.ts` | The INSTREAM client classifies clean, malicious, error, oversized, and transport-failure responses against a synthetic TCP server. | No repository test sends a file through File Center, a real ClamAV daemon, Worker, and stable `FileReference` in one chain. |

## Reviewed contracts and remaining implementation gaps

| Acceptance item | Reviewed contract | Remaining implementation gap |
|---|---|---|
| `07-09` | `walking-skeleton-source-command.v1.schema.json`; Owner `tests.e2e.walking-skeleton`; exact current-state and authorization recheck required. | The test MessageHandler resolves Actor Context, reauthorizes, rechecks state/version/Workflow evidence, and runs through real RabbitMQ Worker delivery. Source and Eventing state are still in memory. |
| `08-05` | The same command binds a Workflow completion event, expected source version, idempotency key, and stable command receipt. | Real Flowable and real Rabbit duplicate paths each produce one source effect, but are not yet one durable cross-process path. |
| `08-07` | The test-scoped source command is the formal Walking Skeleton completion boundary. | A tests-only adapter completes a real Flowable task through the Facade before source acceptance; the binding is absent from the full API/Worker composition and uses a memory Ledger. |
| `09-05` | Task source type `tests.walking-skeleton` has one exact formal completion command. | The tests-only Task source router exists, but composed E2E API Task bindings still fail closed. |
| `10-07` | `notification-intent-submit.v1.schema.json` and `walking-skeleton.asyncapi.yaml` define the authorized test route, fixed retries, DLQ, and production prohibition. | The Job Handler passes Actor-resolution, authorization, Inbox duplicate, and payload-confusion tests and runs through real RabbitMQ Worker delivery. Notification and Eventing state are still in memory. |

These implementation gaps still prevent steps 9–18 of the intended cross-component flow from being claimed as a complete E2E. The preflight returns `contractBlockers=[]` and verifies contract/composition anchors, while continuing to return `mainWalkingSkeletonReady=false`. Production activation is outside this test-scoped contract pass.
