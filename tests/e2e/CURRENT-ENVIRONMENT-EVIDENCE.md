# E2E-01 Environment Evidence

- Date: 2026-07-30
- Scope: repository/local dependency readiness plus a business-neutral in-process platform slice
- Result: the dependency environment and the in-process slice are executable; the main Walking Skeleton remains not implemented

Fresh local verification:

- `pnpm compose:test:integration`: passed; all seven dependency services became healthy, then the isolated containers, networks, Volumes, and temporary Secret directory were removed.
- `node tests/e2e/environment-preflight.mjs`: passed with `composeScope=dependencies-only` and `mainWalkingSkeletonReady=false`.
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

The in-process slice uses Memory Stores and direct public package APIs. It does not start a browser, API, Worker, PostgreSQL, RabbitMQ, Flowable, File Center, or ClamAV chain. Organization's public memory factory has no injectable audit port, so the shared audit evidence covers App Registry, Form Schema, Task Center, and Notifications only. This evidence does not change `mainWalkingSkeletonReady=false`, the five contract blockers, or any item in acceptance section 17.

## Executable evidence

| Area | Existing executable entry | What it proves | Main-chain limitation |
|---|---|---|---|
| Dependency Compose | `pnpm compose:test:integration` | PostgreSQL, Redis, RabbitMQ, Keycloak, Flowable, ClamAV, and Nginx can become healthy in one isolated project. | The Compose definition contains no API, Worker, or client. Nginx returns a fixed local health response and `503` for other routes. |
| Keycloak and Redis | `pnpm auth:test:integration` | Real Keycloak Authorization Code + PKCE, JWKS verification, Redis session creation/rotation/invalidation, and logout with synthetic users. | It invokes API package integration tests, not a browser through a composed API/Nginx/Workbench process. |
| RabbitMQ | `node scripts/check/run-rabbitmq-integration.mjs` | Real RabbitMQ TLS, hostname validation, least-privilege publisher/consumer accounts, Confirm/Return, delivery, retry, and cleanup. | It uses an isolated synthetic topology; production Task activation remains disabled and no Notification consumer contract exists. |
| Flowable | `pnpm --filter @ai-crm/platform-workflow test:integration` | Real deployment of the synthetic BPMN, process start/query/cancel, and human-task claim/release/complete. | Workflow is not composed into API/Worker and has no reviewed owning-source completion command. |
| API | `pnpm --filter @ai-crm/api test` and `start` after build | HTTP/BFF/platform adapters and the executable composition root are tested independently. | Production readiness deliberately fails for unavailable providers/adapters; `compose.test.yml` does not start the API. |
| Worker | `pnpm --filter @ai-crm/worker test` and `start` after build | Bootstrap, drain, Rabbit adapter, Outbox publisher, and sealed Task projection handler behavior are tested independently. | Release activation is disabled; no concrete Job Owner, Notification consumer, Workflow consumer, or File Job contract is approved. |
| ClamAV | `apps/worker/src/clamav-scanner.test.ts` | The INSTREAM client classifies clean, malicious, error, oversized, and transport-failure responses against a synthetic TCP server. | No repository test sends a file through File Center, a real ClamAV daemon, Worker, and stable `FileReference` in one chain. |

## Contract blockers

| Acceptance item | Blocking fact | Failure-closed evidence |
|---|---|---|
| `07-09` | No reviewed concrete Worker Job contract and authoritative-state Owner. | `contracts/jobs/README.md`; generic Handler Registry does not authorize a Job type. |
| `08-05` | Duplicate Workflow completion cannot be related to an owning source side effect without a reviewed source command. | Workflow events are transport-neutral; no source command/Owner exists. |
| `08-07` | Flowable completion cannot request an owning-source formal command. | API documentation explicitly says Workflow remains uncomposed. |
| `09-05` | Task completion cannot route to its source. | Production API installs `task_source_router_unavailable`. |
| `10-07` | Notification retry/DLQ consumption has no reviewed asynchronous contract or production-composed and activated consumer. | A generic Notification Handler factory exists, but AsyncAPI declares only the Task projection consumer and production Worker composition does not activate Notification consumption. |

These blockers prevent steps 9–18 of the intended cross-component flow from being claimed as a complete E2E. They are a manually maintained snapshot with executable evidence-anchor checks, not an automated proof that every possible contract or composition path is absent. They must remain closed until reviewers update this snapshot after the respective contract Owners approve exact commands, event/job ownership, authorization, idempotency, retry, audit, and failure semantics.
