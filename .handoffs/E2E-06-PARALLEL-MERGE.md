# E2E-06 Parallel Merge

## Objective

Merge the independently owned durable-store, Flowable/Rabbit process-chain, and File Center/ClamAV lines without enabling production consumers or claiming the complete main Walking Skeleton.

## Known Facts

- Baseline commit `600fa96` already contained E2E-02 through E2E-04.
- Three agents worked on mutually exclusive paths; root owned shared dependencies, scripts, evidence, and final integration.
- The merged durable slice uses real Flowable, TLS RabbitMQ, and PostgreSQL-backed Workflow Ledger, source state/receipt, Eventing Outbox/Inbox, and Notification stores.
- The File Center slice uses real `clamav/clamav:1.4.5-debian` but remains separate from task completion.
- `mainWalkingSkeletonReady` remains `false`.

## Allowed Assumptions

- Synthetic actors, tasks, content and application identifiers are E2E-only fixtures.
- Migration `0000000016` is applied only by the isolated test runner and may grant its single orchestrator the combined API/Worker permissions needed inside that disposable database.

## Forbidden Assumptions

- Test-only grants, routes, consumers, users or payloads are not production policy.
- Durable test orchestration does not prove authenticated browser/API composition, Task projection activation, full Trace propagation, deployment, or recovery.
- No CRM entity, field, role, state, SLA or approval route may be inferred from these fixtures.

## Non-goals

- Production activation, real COS, provider credentials, CRM domain modules, browser login, Task projection composition, and recovery drills.

## Merge Result

- Added controlled E2E migration execution and a runtime URL stored only in a temporary mode-0600 file.
- Generalized the source MessageHandler to an async-capable narrow port.
- Added injectable Eventing, Notification, source and Workflow stores to the combined main slice.
- Installed all four PostgreSQL-backed stores in `durable-main-chain.ts`.
- Added root scripts for the durable main slice and real ClamAV slice.
- Updated preflight and current evidence to list the five remaining composition gaps.
- Applied the independent review fixes: E2E activation/loopback/database validation, least-privilege test grants, reconciliation-required handling for expired or ambiguous Workflow writes, authoritative source-assignee rechecks, retryable storage classification, bounded runner timeouts, and aggregated cleanup failures.
- Production Compose, production activation inputs, platform contracts and domain modules were not changed.

## Verification

- `pnpm e2e:main-chain:integration`: passed with `durable=true`, Flowable task/instance `completed`, source version `2`, one source authorization, one Notification and two Inbox duplicates.
- `pnpm e2e:file-clamav:integration`: clean `available`, EICAR `quarantined`, both replays idempotent, unavailable scanner leaves `pending_scan`.
- `pnpm e2e:check`: 2/2 passed.
- `pnpm --filter @ai-crm/e2e test`: 33/33 passed.
- `pnpm --filter @ai-crm/e2e typecheck` and `pnpm --filter @ai-crm/e2e lint`: passed.
- `node --test scripts/check/e2e-main-chain-integration.test.mjs`: 3/3 passed.
- `pnpm e2e:preflight`: passed with no contract blockers and the five remaining implementation gaps reported.
- `pnpm check`: 145/145 Turbo tasks passed.
- Failed and successful container integrations removed their containers, networks, Volumes and temporary Secret/TLS directories.

## Eight-area Review

- Authorization: source state and authoritative assignment are rechecked and reauthorized server-side; test-only database grants exist only in the explicitly invoked E2E migration and are limited to required table actions.
- Idempotency: Workflow Ledger, source receipt, Outbox/Inbox and Notification results survive duplicate delivery with one effect.
- Transactions: source state plus receipt and Workflow result plus revision are atomic PostgreSQL transactions; expired leases and ambiguous post-action persistence move to reconciliation-required handling; Eventing and Notification use their reviewed PostgreSQL stores.
- Migrations: `0000000016` is additive, versioned, metadata-reviewed and never executed at application startup.
- Observability: runner output contains bounded status/count values and no credentials, content bytes, actor payloads or raw provider responses.
- Backward compatibility: production entry points, consumers, contracts and deployment files are unchanged.
- Secrets: generated passwords and URLs remain in temporary restricted files and are removed in `finally`.
- Failure behavior: retryable storage failures are classified explicitly, aborts are rechecked after asynchronous storage reads, Worker rejection is retained, and runner execution/cleanup failures are bounded and aggregated without widening production grants.

## Remaining Gaps

- Authenticated browser/BFF/API Task completion.
- Task projection consumer inside the full isolated Worker process.
- Form and stable FileReference evidence joined to completion.
- Browser-to-Worker Trace propagation and durable Audit correlation.
- Full authorized, denied, stale, dependency-failure and recovery scenarios in one composed process chain.
