# End-To-End Tests

This directory is reserved for the business-neutral Walking Skeleton and later approved business workflows. The main E2E is not implemented and must not be reported as complete.

## Environment preflight

Run:

```text
pnpm e2e:preflight
pnpm e2e:check
```

The preflight is read-only. It checks Node 24, a reachable Docker daemon, Docker Compose rendering, the exact seven dependency services, required repository assets, and evidence anchors for five manually maintained blocker snapshots. Those anchors fail on known boundary drift, but they are not a proof that no new contract or composition exists; reviewers must update the snapshot when the related contracts or composition change. The command does not create Secret files, start containers, run migrations, seed users, or claim that API, Worker, Workbench, Workflow source commands, production Notification consumers, or the main Walking Skeleton are available.

The current `compose.base.yml + compose.test.yml` environment contains PostgreSQL, Redis, RabbitMQ, Keycloak, Flowable, ClamAV, and Nginx only. It does not contain API, Worker, or any client application.

## In-process platform slice

Run `pnpm --filter @ai-crm/e2e test` to exercise a synthetic, business-neutral chain through the public entry points of Organization, App Registry, Form Schema, Task Center, and Notifications. It verifies workforce context resolution, stable registry and deep links, server-side form validation, task-projection idempotency and denial, direct notification-intent idempotency, and the injectable audit ports.

This is an in-process joint test, not the main E2E. It does not start a browser, API, Worker, database, RabbitMQ consumer, Workflow source command, Task completion route, or production Notification activation, and it does not change the status of the five blocked contracts.

## Durable evidence slice

Run `pnpm e2e:main-chain:integration` to execute the test-only durable chain against disposable PostgreSQL, real Flowable, and real TLS RabbitMQ. The slice publishes and validates a versioned synthetic Form Schema release, persists a submission reference with a stable synthetic `FileReference`, completes the projected task through Task Center, retries after a synthetic dependency failure, publishes trace-bearing Jobs through Outbox/RabbitMQ/Worker/Inbox, and queries durable Audit correlation. It also proves denied access, inactive-release rejection, command replay, duplicate delivery, and cleanup.

The stable FileReference is an explicit synthetic fixture. Real File Center and ClamAV clean/quarantine behavior is proven by `pnpm e2e:file-clamav:integration`, but that separate scan result is not yet fed into this chain. The browser/BFF login slice is also separate, so `mainWalkingSkeletonReady` remains `false`.

## Browser authentication slice

Run `pnpm e2e:browser-auth:integration` to build the E2E Workbench, start disposable PostgreSQL, Redis, Keycloak, and Nginx services, and drive an installed headless Chromium browser through the real PC BFF Authorization Code + PKCE login path. The runner creates and deletes one synthetic Keycloak user at runtime and checks callback validation, the browser Token boundary, CSRF, session fixation, refresh rotation, old-Cookie rejection, and session expiry.

The runner binds only loopback dependency/edge ports and a short-lived host BFF port used by the isolated Nginx container. It removes its Compose project, Volumes, browser profile, build output, temporary Secrets, and synthetic user. This proves `17-01`; it does not join the browser session to the durable Task/Worker trace and does not set `mainWalkingSkeletonReady` to `true`.

## Task boundary

Known facts:

- Dependency Compose health, Keycloak/OIDC, RabbitMQ TLS, and Flowable REST each have independent executable integration paths.
- API and Worker have runnable package tests and production entry points, but are not part of `compose.test.yml`.
- The production API deliberately keeps Workflow, Task source routing, Notification mutations, and File scanning unavailable where reviewed adapters/contracts are absent.

Allowed assumptions:

- Synthetic test assets may prove technical compatibility without becoming production domain data.
- A passing preflight proves only that the local dependency test environment can be rendered and the known blockers remain explicit.

Forbidden assumptions:

- Healthy dependencies imply a working cross-component business flow.
- Generic Event, Job, Workflow, Task, or Notification infrastructure supplies an owning source command or business authority.
- A fake ClamAV protocol server proves the real daemon/file chain.

Non-goals:

- CRM modules, fields, states, roles, SLAs, approval routes, external providers, real COS, production consumer activation, or unreviewed contracts.
