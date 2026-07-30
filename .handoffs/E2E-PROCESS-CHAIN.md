# E2E Process Chain Handoff

## Objective

Compose the separately proven real Flowable and TLS RabbitMQ slices into one test-only, business-neutral integration without enabling a production consumer or overstating durability.

## Known Facts

- The integration deploys and starts the reviewed synthetic BPMN in real Flowable, completes its real human task, and maps the emitted Workflow event key to a deterministic UUID required by the source-command contract.
- The real Workflow Task ID and derived completion event ID enter the source-command Job published with RabbitMQ Confirm.
- The real Worker Rabbit adapter consumes both the source command and Notification intent with manual ACK and Inbox duplicate recognition.
- The successful run ended with Flowable task/instance `completed`, source `completed/version=2`, one source authorization, one Notification, and two Inbox duplicates.
- Eventing, source, Notification, and Workflow Ledger default to memory in this integration. Output therefore states `durable:false` and `mainWalkingSkeletonReady:false`.

## Allowed Assumptions

- Deterministic synthetic actors, assignments, task identifiers, and notification content are tests-only fixtures.
- Separate isolated Compose projects may expose random loopback ports to one test orchestrator process.

## Forbidden Assumptions

- Process health or memory state is durable evidence.
- Test Rabbit routes or handlers are production activation policy.
- This slice proves browser authentication, file scanning, deployment, or the full Walking Skeleton.

## Non-goals

- CRM domain modules, browser/BFF authentication, file/ClamAV, production deployment, and readiness promotion.

## Files

- `tests/e2e/src/main-chain.ts`
- `tests/e2e/src/process-composition.test.ts`
- `scripts/check/run-e2e-main-chain-integration.mjs`
- `scripts/check/e2e-main-chain-integration.test.mjs`

No Compose, Nginx, API, Worker, contract, migration, or production activation file was changed by this work line.

## Durable Merge Seam

`createMainChainIntegrationFactory` explicitly injects `createSource` and `createWorkflowLedger`. The following shared changes are required to install the new PostgreSQL implementations safely:

1. Change `createWalkingSkeletonSourceCommandMessageHandler` to accept a narrow source port whose `canAccept` returns `boolean | Promise<boolean>`; in `recheckAuthoritativeState`, use `return await source.canAccept(...)`. `complete` is already asynchronous.
2. Generalize the main-chain factory source return type to the same narrow port plus async-capable `register` and `getState` methods. Await `source.register(...)` and every `source.getState(...)` call in the integration.
3. Create the PostgreSQL runtime only in the integration entry point, after the reviewed E2E migration is applied explicitly by the runner. Inject `createPostgresWalkingSkeletonSource` through `createSource` and `createPostgresWorkflowCommandLedger` through `createWorkflowLedger`; close the runtime in `finally`.
4. Do not claim the full chain durable after this merge: Eventing/Inbox/Outbox and Notification stores in `main-chain.ts` are still memory stores unless their reviewed PostgreSQL adapters are also installed.
5. Keep `AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED` absent and `mainWalkingSkeletonReady:false` until the remaining persistent stores and full API/Worker composition are proven.

## Verification

- `pnpm --filter @ai-crm/e2e typecheck`: passed.
- Targeted ESLint for `main-chain.ts` and `process-composition.test.ts`: passed.
- `pnpm --filter @ai-crm/e2e test`: 10 files, 31 tests passed after the durable-store parallel line appeared.
- `node --test scripts/check/e2e-main-chain-integration.test.mjs`: 3 tests passed.
- Real combined integration: passed and cleaned both projects, networks, the PostgreSQL Volume, and temporary Secret/TLS directories.
- Full E2E package lint was temporarily blocked by three `no-undef` findings in the parallel-owned `file-clamav-integration.mjs`; no process-chain file has an ESLint finding.

## Independent Eight-area Review

1. Authorization: Workflow, source, and Notification authorization ports run; actor context is resolved server-side, and the duplicate source Job does not reauthorize.
2. Idempotency/retry: Workflow Ledger, Outbox, Inbox, source receipt, and Notification idempotency are exercised; duplicate messages leave one effect. Retry and dependency-failure scenarios remain outstanding.
3. Transactions: this line adds no database transaction and makes no durability claim. PostgreSQL source/ledger transaction review belongs to the durable-store line.
4. Migrations: no startup synchronization or migration was added. Durable installation must invoke the reviewed versioned E2E migration explicitly.
5. Observability: output is bounded counts/status only and excludes payloads, actors, credentials, and provider responses. Full Trace/Audit persistence remains outstanding.
6. Backward compatibility: production API/Worker entry points, consumers, contracts, and Compose definitions are unchanged; activation requires `AI_CRM_E2E_MAIN_CHAIN_INTEGRATION=true`.
7. Secrets/security: credentials are temporary files outside the repository; services bind only random loopback ports; runner cleanup removes material in `finally`.
8. Failure/cleanup: startup or assertion failure prints bounded service logs, then removes containers, networks, Volumes, Secret files, and TLS fixtures. The two ports are preflighted and must be distinct.

## Result

The real Flowable-to-Rabbit process slice is composed and repeatably passing. It is intentionally a single test orchestrator process because its stores are not yet cross-process durable. `mainWalkingSkeletonReady` remains `false`.
