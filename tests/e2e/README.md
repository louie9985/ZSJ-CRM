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
