# End-To-End Tests

This package covers the business-neutral walking skeleton and local foundation evidence. It does not authorize production deployment or infer CRM domain rules.

## Authentication

`pnpm e2e:browser-auth:integration` is an HTTP integration slice. It starts the real API with PostgreSQL and Redis, then verifies login/session/logout for `pc` and `internal-h5`, independent HttpOnly cookies, CSRF tokens and post-logout rejection. It does not launch Chromium and does not claim UI automation.

## Platform And Durable Slices

- `pnpm --filter @ai-crm/e2e test` joins Organization, App Registry, Form Schema, Task Center and Notifications through public entry points.
- `pnpm e2e:compose:integration` runs the isolated API/Worker/Workbench process skeleton and Task Projection consumer.
- `pnpm e2e:main-chain:integration` runs the durable PostgreSQL, Flowable and TLS RabbitMQ chain.
- `pnpm e2e:file-clamav:integration` verifies clean, quarantine, replay and scanner-unavailable behavior.
- `pnpm e2e:combined-evidence:integration` combines File, both authentication surfaces and the durable main chain as independent evidence inputs.

The dependency Compose environment contains PostgreSQL, Redis, RabbitMQ, Flowable, ClamAV and Nginx. Synthetic fixtures prove only technical behavior. Production adapters, external providers, CRM modules, roles, SLAs and approval routes remain out of scope.

`pnpm e2e:preflight` is read-only. A passing preflight proves only that current definitions and implementation anchors are present; it does not promote production readiness.
