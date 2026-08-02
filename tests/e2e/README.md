# End-To-End Tests

This directory is reserved for the business-neutral Walking Skeleton and later approved business workflows. The combined runner now has executable local evidence for the authenticated Browser -> BFF -> API -> Outbox -> isolated Worker chain, including Application Registry navigation, server-validated form submission, a clean stable FileReference, durable Task/Notification polling, Trace propagation, and correlated Audit records. This is local test-scoped evidence; it does not replace staging, production, Sentry, backup, or recovery evidence.

## Environment preflight

Run:

```text
pnpm e2e:preflight
pnpm e2e:check
```

The preflight is read-only. It checks Node 24, a reachable Docker daemon, Docker Compose rendering, the exact 10-service E2E topology, required repository assets, external-evidence bridge anchors, and real isolated Worker anchors. Those anchors prove only that the reviewed implementation remains present; they do not execute the combined flow or prove acceptance. The command does not create Secret files, start containers, run migrations, seed users, or claim that the main Walking Skeleton is ready.

The dependency-only `compose.base.yml + compose.test.yml` environment contains PostgreSQL, Redis, RabbitMQ, Keycloak, Flowable, ClamAV, and Nginx. Adding `compose.e2e.yml` supplies the test-scoped API, isolated Worker, and Workbench processes.

## In-process platform slice

Run `pnpm --filter @ai-crm/e2e test` to exercise a synthetic, business-neutral chain through the public entry points of Organization, App Registry, Form Schema, Task Center, and Notifications. It verifies workforce context resolution, stable registry and deep links, server-side form validation, task-projection idempotency and denial, direct notification-intent idempotency, and the injectable audit ports.

This is an in-process joint test, not the main E2E. It does not start a browser, API, Worker, database, RabbitMQ consumer, Workflow source command, Task completion route, or production Notification activation, and it does not change the status of the five blocked contracts.

## Durable evidence slice

Run `pnpm e2e:main-chain:integration` to execute the test-only durable chain against disposable PostgreSQL, real Flowable, and real TLS RabbitMQ. The slice publishes and validates a versioned synthetic Form Schema release, persists a submission reference with a stable `FileReference`, completes the projected task through Task Center, retries after a synthetic dependency failure, publishes trace-bearing Jobs through Outbox/RabbitMQ/Worker/Inbox, and queries durable Audit correlation. It also proves denied access, inactive-release rejection, command replay, duplicate delivery, and cleanup.

By default the stable FileReference and Trace remain synthetic fixtures. The chain accepts `AI_CRM_E2E_FILE_REFERENCE_JSON`, `AI_CRM_E2E_BROWSER_TRACE_ID`, and `AI_CRM_E2E_BROWSER_TRACEPARENT`; setting `AI_CRM_E2E_REQUIRE_EXTERNAL_EVIDENCE=true` fails closed unless all three valid external values are supplied. `pnpm e2e:combined-evidence:integration` first obtains a real clean FileReference from ClamAV, then drives the authenticated browser through Application Registry resolution, published Form Schema rendering and server validation, and a real Task completion POST with the live HttpOnly BFF Session and CSRF token. The browser Form receipt and Task command are persisted in the disposable PostgreSQL evidence schema; the durable chain rejects mismatched Trace, schema digest/version, submission reference, actor, or FileReference. While the durable PostgreSQL container remains alive, a fresh BFF Session for the restored synthetic Keycloak subject queries the Prisma Task and Notification stores directly. Only that database-backed browser polling pass may produce `mainWalkingSkeletonReady=true`; the static environment preflight always reports `false` because it does not execute this gate.

## Browser authentication slice

Run `pnpm e2e:browser-auth:integration` to build the E2E Workbench, start disposable PostgreSQL, Redis, Keycloak, and Nginx services, and drive an installed headless Chromium browser through the real PC BFF Authorization Code + PKCE login path. The runner creates and deletes one synthetic Keycloak user at runtime and checks callback validation, the browser Token boundary, CSRF, session fixation, refresh rotation, old-Cookie rejection, and session expiry. When the combined Task command file is enabled, it resolves the synthetic subject through Organization and Authorization services, rejects unlinked/inactive/ungranted contexts, and replays the identical successful Task POST through the same browser Session.

The runner binds only loopback dependency/edge ports and a short-lived host BFF port used by the isolated Nginx container. It removes its Compose project, Volumes, browser profile, build output, temporary Secrets, and synthetic user. In combined mode it also loads the composed Application Registry, resolves and navigates a Deep Link, renders and submits the published synthetic form, calls the Task completion endpoint, records the accepted command evidence, and later polls durable Task and Notification projections through a fresh authenticated BFF Session.

## Isolated Task Projection Worker

`pnpm e2e:compose:integration` composes the E2E Worker with the production PostgreSQL and TLS RabbitMQ resources and enables the sealed Task Projection Consumer. The runner publishes a real Task Lifecycle CloudEvent and requires both an `open:1` row in `platform_task_center.task_projections` and one durable receipt in `platform_eventing.inbox_receipts`. The strengthened composition passed on 2026-07-31 and cleaned its isolated resources. This is test-scoped activation only and does not enable production.

## Task boundary

Known facts:

- Dependency Compose health, Keycloak/OIDC, RabbitMQ TLS, and Flowable REST each have independent executable integration paths.
- API and Worker have runnable package tests and production entry points; the test-scoped variants are added by `compose.e2e.yml`, not `compose.test.yml` alone.
- Real File Center and browser authentication runners emit the exact external evidence inputs accepted by the durable main chain.
- The isolated Worker is wired to real PostgreSQL, TLS RabbitMQ, Eventing Inbox, and the Prisma Task Center store.
- The production API deliberately keeps Workflow, Task source routing, Notification mutations, and File scanning unavailable where reviewed adapters/contracts are absent.

Allowed assumptions:

- Synthetic test assets may prove technical compatibility without becoming production domain data.
- A passing preflight proves only that the local topology can be rendered, implementation anchors remain present, and the unproved combined-run gaps remain explicit.

Forbidden assumptions:

- Healthy dependencies imply a working cross-component business flow.
- Generic Event, Job, Workflow, Task, or Notification infrastructure supplies an owning source command or business authority.
- A fake ClamAV protocol server proves the real daemon/file chain.
- A Trace ID match without the accepted browser Task command does not prove the combined Browser → BFF → API → Outbox → Worker evidence chain.

Non-goals:

- CRM modules, fields, states, roles, SLAs, approval routes, external providers, real COS, production consumer activation, or unreviewed contracts.
