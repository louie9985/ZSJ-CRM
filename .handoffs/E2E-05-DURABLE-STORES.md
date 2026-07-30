# E2E-05 Durable Stores

## Objective

Provide reviewed, test-only PostgreSQL persistence for the business-neutral Walking Skeleton source and Workflow command ledger without changing production module policy or activating a production consumer.

## Known Facts

- Platform Eventing, Task Center, and Notification packages already expose reviewed PostgreSQL stores through their public package entry points.
- The E2E synthetic authoritative source and Workflow command ledger were still memory-only.
- `tests/e2e` does not currently declare `@ai-crm/database`; this task was not allowed to change package metadata, the E2E export entry point, or an existing runner.
- Another parallel line added `tests/e2e/src/main-chain.ts` while this work was in progress. It still composes memory stores; its temporary Workflow lifecycle union type errors were fixed by that owner before final verification.

## Allowed Assumptions

- Only `tests/e2e` owns the synthetic source facts and its controlled migration.
- The application-composed runtime will implement the same `execute` and `withTransaction` shape as the reviewed Database Runtime.
- The integration runner explicitly applies this migration to a disposable E2E database before constructing these stores.

## Forbidden Assumptions

- The E2E schema is not a production schema and is never installed at application startup.
- These adapters do not establish CRM entities, fields, states, permissions, SLAs, or approval routes.
- A durable E2E Workflow ledger is not approval to activate a production Workflow endpoint or consumer.
- A remote Flowable call and PostgreSQL commit are not one distributed transaction.

## Non-goals

- Browser/BFF work, Compose orchestration, production deployment, CRM domain behavior, real provider adapters, or production Workflow persistence policy.

## Delivered Files

- `tests/e2e/migrations/0000000016_e2e_walking_skeleton_durable_stores.sql`
- `tests/e2e/migrations/0000000016_e2e_walking_skeleton_durable_stores.meta.json`
- `tests/e2e/src/postgres-runtime.ts`
- `tests/e2e/src/postgres-walking-skeleton-source.ts`
- `tests/e2e/src/postgres-workflow-ledger.ts`
- Focused tests in the corresponding `postgres-*.test.ts` files.

## Persistence And Transaction Semantics

- The additive, versioned migration creates only `e2e_walking_skeleton` and revokes Public schema access.
- Source registration stores synthetic current state. Completion takes an advisory transaction lock, locks current state, rechecks status/version/actor-context/Workflow-task binding, advances the version, and writes the stable command receipt in one transaction.
- Same key and same command fingerprint returns the stored receipt; changed semantics return `source_command_conflict`.
- Source authorization is resolved server-side before mutation. Attempt audit precedes the transaction; success audit is inside the mutation transaction so its failure rolls back source state and receipt; terminal failure audit is recorded after rollback.
- Workflow commands are claimed durably before a remote action with a bounded lease. An active lease fails closed as retryable conflict; an expired same-fingerprint lease may be reclaimed.
- Successful remote results and per-task monotonic source revisions are committed together. `WORKFLOW_RECONCILIATION_REQUIRED` is retained and never repeats the remote mutation. Ordinary action failures release the owned claim for retry.
- A database failure after a successful remote action maps to `WORKFLOW_RECONCILIATION_REQUIRED`; no distributed transaction is claimed.

## Authorization, Audit, And Observability

- Source authorization and audit preserve the existing E2E port and bounded references. No command payload, actor content, credentials, or provider response is logged.
- The stores emit no telemetry and add no health claim. The composing E2E process remains responsible for bounded observations and database readiness.

## Test Evidence

- `pnpm --dir tests/e2e exec vitest run --config ../../vitest.config.ts src/postgres-walking-skeleton-source.test.ts src/postgres-workflow-ledger.test.ts src/postgres-migration.test.ts`
  - 3 files passed, 11 tests passed.
- `pnpm exec eslint tests/e2e/src/postgres-*.ts --max-warnings 0`
  - passed.
- `pnpm --filter @ai-crm/e2e typecheck` and `pnpm --filter @ai-crm/e2e build` passed.
- `pnpm --filter @ai-crm/e2e test` passed all 10 files and 30 tests, including the 11 new durable-store tests.
- The repository migration loader accepted migration `0000000016`, its review metadata, and its globally unique version.
- The stateful Runtime tests cover source replay/conflict/rollback/missing state, Workflow replay/conflict/live-lease exclusion/reconciliation retention/retry release, and migration scope/review metadata.
- No real PostgreSQL integration test was added because package metadata and runners were explicitly outside this task's ownership. Therefore the SQL Store is implemented and unit-tested, but real PostgreSQL execution remains an integration gate.

## Exact Integration Requests

1. Package owner: add `@ai-crm/database: workspace:*` to `tests/e2e/package.json` and refresh `pnpm-lock.yaml`, or supply an already-composed `E2ePostgresRuntime` without exposing transaction handles across module boundaries.
2. Export owner: export the three new factories/types from `tests/e2e/src/index.ts` only if a script must consume the built package. A source-local E2E runner can import the files directly.
3. Runner owner: explicitly run base/module migrations plus `tests/e2e/migrations` against a disposable E2E PostgreSQL database before process startup. Do not run migrations from application startup.
4. Main-chain owner: replace `createMemoryWorkflowCommandLedger()` with `createPostgresWorkflowCommandLedger(...)`, and replace the synchronous memory source with `createPostgresWalkingSkeletonSource(...)`. The durable source methods `register`, `getState`, and `canAccept` are asynchronous, so polling and handler port typing need a narrow async adapter.
5. Main-chain owner: use existing public `createPostgresEventingStore`, `createPostgresNotificationStore`, and `createPostgresTaskCenterStore`; do not duplicate those stores in E2E.
6. Integration owner: add a real PostgreSQL scenario proving migration execution, restart-stable replay, concurrent same-key exclusion, transaction rollback, cleanup, and that no application startup path invokes migration execution.

## Cleanup And Recovery

- The integration runner must use a disposable database/Volume and remove it in `finally`.
- For a disposable E2E database only, recovery is dropping `e2e_walking_skeleton` after preserving required evidence. A forward fix uses a new globally unique migration; migration `0000000016` must not be edited after application.

## Review Matrix

- Authorization: existing server-side source authorization remains mandatory; stable receipt replay matches the current E2E behavior.
- Idempotency: durable fingerprint receipts and Workflow command states are replica-visible.
- Transactions: source state/receipt and Workflow result/revision are atomic; remote Flowable work remains outside PostgreSQL transactions.
- Migrations: additive versioned SQL plus review metadata; no automatic synchronization.
- Observability: no sensitive telemetry or new readiness claim.
- Backward compatibility: new files only; no production exports, package metadata, contracts, or existing implementations changed.

## Result

The missing E2E-owned durable adapters are implemented and focused tests pass. The overall main Walking Skeleton is not yet durable or accepted until the integration requests above are completed and real PostgreSQL evidence passes.
