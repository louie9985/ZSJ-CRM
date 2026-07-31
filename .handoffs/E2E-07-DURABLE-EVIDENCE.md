# E2E-07 Durable Form, Task, Trace, And Audit Evidence

## Objective

Connect acceptance evidence for 17-09 and the durable portion of 17-16 to the PostgreSQL + Flowable + RabbitMQ Walking Skeleton without changing production API or browser composition.

## Known Facts

- The prior durable slice had PostgreSQL Workflow/source/Outbox/Inbox/Notification stores, real Flowable, and TLS RabbitMQ.
- Real File Center/ClamAV behavior is proven by a separate isolated integration.
- The authenticated browser/BFF login slice remains separate from the durable task chain.

## Allowed Assumptions

- Synthetic form, task, file, actor, and Trace identifiers are E2E-only fixtures.
- A stable synthetic FileReference may prove contract carriage and persistence, but not a real scan result.
- Test-only combined-role grants are installed only by the explicit disposable E2E migration runner.

## Forbidden Assumptions

- The synthetic FileReference is not evidence that File Center or ClamAV ran in the durable main slice.
- Workflow-to-Worker Trace evidence does not prove the separately composed browser/BFF/API segment.
- No CRM entity, permission, state, SLA, approval route, or production consumer activation is established.

## Non-goals

- Production API/browser changes, real COS, provider credentials, production readiness, or changing `mainWalkingSkeletonReady` to true.

## Authority And References

- `docs/06-质量验收/第一阶段Walking-Skeleton验收清单.md`, items 17-09 and 17-16.
- Existing public Form Schema, Task Center, Workflow, Eventing, Notification, FileReference type, and Audit APIs.

## Allowed Paths

- `tests/e2e` source, migrations, tests, README/evidence; matching E2E dependency importer; this handoff.

## Forbidden Paths

- `apps/api` production/browser files, production migrations, platform implementation internals, and production Compose activation.

## Contract Changes

- None.

## Migration Changes

- Added `0000000017_e2e_submission_trace_audit_evidence`, an additive test-only migration.
- It stores submission/form/FileReference/Trace references and no form body or file content.
- It grants the disposable combined E2E role only the Form Schema, Task Center, Audit, and evidence-table actions used by the runner.

## Authorization And Audit

- Task detail/completion denial is server-side and durably audited.
- Form management and Workflow/source/Notification actions map to durable Audit records with stable per-phase operation IDs.
- All durable evidence shares trace ID `4bf92f3577b34da6a3ce929d0e0e4736`; no credentials, cookies, bodies, file bytes, or provider payloads are stored.

## Idempotency, Retry And Failure

- Inactive release is rejected before completion.
- The first Task source dependency call fails retryably; the same idempotency key recovers and a third call replays without a second Flowable mutation.
- Submission persistence replays identical input and rejects changed semantics.
- Outbox/Inbox duplicate delivery remains one-effect.

## Observability And Health

- The durable query verifies one submission, two trace-bearing Outbox records, two Worker-observed trace-bearing messages, two Inbox receipts, and 30 correlated Audit records.
- No readiness or production health claim changes.

## Backward Compatibility

- Additive E2E-only schema and optional MainChain factory ports; production entry points and contracts are unchanged.

## Verification

- Focused Vitest: 3 files, 6 tests passed.
- E2E typecheck, lint, and build passed.
- `pnpm e2e:main-chain:integration` passed with `e2e-main-chain-durable-evidence-passed`, real Flowable/RabbitMQ/PostgreSQL, one retry, one submission, two trace-bearing Outbox records, two Inbox duplicates, and 30 Audit records.
- Containers, networks, Volumes, and temporary Secrets were removed after failed and successful attempts.

## Unresolved Questions

- The real ClamAV-produced FileReference still needs to be passed into the durable submission chain.
- The browser/BFF/API request trace still needs to be joined to the durable Task/Worker trace.

## Handoff Result

Durable 17-09/17-16 sub-evidence is executable and accurate, but complete acceptance remains pending the two unresolved joins above. `mainWalkingSkeletonReady` remains false.

## Review Follow-up

- Submission idempotency now fingerprints only business semantics; Trace identifiers are excluded, and an identical retry with a new W3C Trace replays the original submission.
- Migration `0000000017` now requires the `traceparent` trace-id to equal `trace_id` and rejects an all-zero parent-id. Static negative tests cover mismatched trace IDs and zero parent IDs.
- The main-chain assertions now require identical recovered/replayed Task receipts, one Flowable mutation, a final `completed` Task projection at source version 2, exact message type/version and consumer pairing for two trace-correlated Outbox/Inbox facts, two exact form Audit facts, exactly 30 trace-correlated Audit records, and exactly two Worker-observed trace-bearing messages.
- Focused tests (6/6), E2E typecheck, scoped ESLint, and `git diff --check` pass after the review fixes.
- The final Docker integration rerun could not start because Docker Desktop returned API 500 responses and cleanup timed out. The immediately preceding real integration run passed before these assertion-only and fingerprint/constraint review changes; no post-review real integration success is claimed.
- Final E2E tests (44/44), typecheck, lint, preflight (3/3), `git diff --check`, and full `pnpm check` (145/145 tasks) pass after the merged review fixes.
