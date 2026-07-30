# E2E-02 Walking Skeleton Contract Unblock

## Objective

Define the smallest reviewed, business-neutral contracts needed to remove acceptance blockers `07-09`, `08-05`, `08-07`, `09-05`, and `10-07` before any cross-process implementation is composed.

## Known Facts

- The repository is limited to the common technical foundation and a business-neutral Walking Skeleton.
- Task Center already routes completion through `TaskSourceCommandRouter`, but production composition deliberately installs an unavailable router.
- Workflow publishes lifecycle facts but does not own a source-domain completion side effect.
- Worker has generic handler factories, but only the Task projection RabbitMQ route is reviewed.
- Notification Intent is already a stable business-neutral contract and Notification Center reauthorizes intent submission.
- The main E2E is not implemented and production consumer activation remains prohibited without external evidence.

## Allowed Assumptions

- `tests/e2e` may own a synthetic source used only by the Walking Skeleton acceptance flow.
- A versioned private Worker Job may request the synthetic source command and must recheck current source state and authorization before accepting it.
- A versioned Notification Intent Job may carry an actor-context claim, but that claim is not trusted authority; Notification Center must perform current authorization before mutation.
- Test-only queues may be declared with explicit test scope and disabled production activation.

## Forbidden Assumptions

- Do not infer CRM entities, fields, states, permissions, SLAs, approval routes, or production source modules.
- Do not treat a Flowable completion, Task projection, message delivery, or notification as proof that the synthetic source command succeeded.
- Do not trust actor or state claims from a RabbitMQ payload without server-side reauthorization and current-state checks.
- Do not activate any production consumer or add a real provider adapter.

## Non-goals

- Production deployment, external providers, real COS, CRM modules, recovery drills, and formal first-stage acceptance.
- A generic command bus, arbitrary Worker executor, or reusable external-user model.

## Authority And References

- `AGENTS.md`
- `docs/04-工程手册/第一阶段AI并行开发实施计划.md`, sections 17 and 18
- `docs/06-质量验收/第一阶段Walking-Skeleton验收清单.md`
- ADR-0009, ADR-0010, ADR-0014, ADR-0026, and ADR-0027
- Existing contracts under `contracts/events`, `contracts/jobs`, `contracts/notifications`, and `contracts/asyncapi`

## Allowed Paths

- `contracts/jobs/`
- `contracts/asyncapi/`
- `tests/e2e/`
- `scripts/check/contracts.test.mjs`
- `scripts/contracts/generate.mjs`
- `.handoffs/E2E-02-CONTRACT-UNBLOCK.md`
- Generated contract artifacts through `pnpm contracts:generate`

## Forbidden Paths

- `packages/domain-modules/`
- Production deployment activation values
- Provider adapters and credentials

## Contract Changes

- Add a concrete Walking Skeleton synthetic-source command Job.
- Add a concrete Notification Intent submission Job.
- Add test-scoped AsyncAPI routes with bounded retry, DLQ, manual ACK, and disabled production activation.

## Migration Changes

None.

## Dependencies

- Existing Job envelope v1, Notification Intent v1, Eventing Inbox, Task Center router, Workflow lifecycle event, and Notification Center authorization.

## Required Tests

- JSON Schema positive/negative tests.
- AsyncAPI parse/reference and exact policy tests.
- Generated-contract determinism checks.
- `pnpm check`.

## Authorization And Audit

- Synthetic source execution must reauthorize the current actor and task state.
- Notification submission must use Notification Center authorization and audit; payload actor context is a claim, not authority.
- Denied commands must not change source state, task projection, or notification state.

## Idempotency, Retry And Failure

- Both Jobs use deterministic idempotency keys and durable Inbox deduplication.
- Source completion records a stable command receipt; ambiguous retries reuse the same key.
- Three attempts with fixed 30/300-second delays; exhaustion is isolated to DLQ without automatic replay.

## Observability And Health

- Only bounded identifiers, attempt counters, result categories, and safe Trace references may be emitted.
- Job payloads, submitted form data, credentials, and personal content must not be logged.
- Test consumers must remain Not Ready when their exact reviewed routes or required dependencies are unavailable.

## Backward Compatibility

- Additive v1 contracts only. Existing Task projection topology and production activation policy remain unchanged.

## Deliverables

- Reviewed source schemas, test-scoped AsyncAPI topology, contract tests, regenerated artifacts, and an updated blocker snapshot.

## Unresolved Questions

- No production domain owns an equivalent source command. The contract is therefore permanently test-scoped until a confirmed domain supplies a separate reviewed contract.
- Production activation evidence remains external and cannot be created by this task.

## Handoff Result

Completed for the contract layer.

- Added the test-scoped synthetic source command Job and the platform Notification Intent submission Job.
- Added a separate Walking Skeleton AsyncAPI document with exact queues, fixed 30/300-second retries, DLQ isolation, manual ACK, current-state/authorization rechecks, and explicit production prohibition.
- Improved contract generation so strict Ajv validation resolves document-relative JSON Schema references without network access.
- Updated E2E preflight from five contract blockers to zero contract blockers plus five honest implementation gaps; `mainWalkingSkeletonReady` remains false.
- Contract tests: 11/11 passed. E2E preflight tests: 2/2 passed. Full `pnpm check`: 145/145 passed.

Independent eight-dimension review found no remaining P0-P3 in this contract-only scope: authorization is rechecked rather than trusted from messages; idempotency is envelope-bound; ACK/retry/DLQ behavior is explicit; there are no migrations; payload logging is forbidden; changes are additive; no Secret values or provider data exist; and production activation remains impossible from this topology.
