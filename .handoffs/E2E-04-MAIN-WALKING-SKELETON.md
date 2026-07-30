# E2E-04 Main Walking Skeleton

## Objective

Implement the reviewed business-neutral cross-component Walking Skeleton with synthetic resources owned only by `tests/e2e`.

## Known Facts

- The isolated 10-service process composition is healthy, routed, and repeatably cleaned up.
- The reviewed source-command and Notification Job contracts are test-scoped and production-disabled.
- Five implementation gaps currently keep `mainWalkingSkeletonReady=false`; the Rabbit transport slice is now real, while durable storage and the remaining composed components are not.
- Task Center routes completion to the owning source and must not mutate Workflow or source state itself.

## Allowed Assumptions

- `tests/e2e` may own a synthetic authoritative source, Actor Context resolver, authorization fixture, and test-only adapters.
- Synthetic identifiers and data may be deterministic and must not imply CRM semantics.
- Work may be delivered gap by gap while the preflight continues to report the remaining gaps.

## Forbidden Assumptions

- Process health, memory stores, or a Fixture UI do not prove the main E2E.
- No test route, source type, permission, queue, or consumer may become production policy.
- Actor identity from a Job payload is not trusted; the server resolves `actorContextReference` and reauthorizes.
- A stale source version or already-completed source cannot be accepted as a new command.

## Non-goals

- CRM domains, production provider adapters, production consumer activation, deployment, and recovery drills.

## Authority And References

- `AGENTS.md`
- First-stage implementation plan sections 17-18
- Walking Skeleton acceptance checklist section 17
- `contracts/jobs/walking-skeleton-source-command.v1.schema.json`
- `contracts/jobs/notification-intent-submit.v1.schema.json`
- `contracts/asyncapi/walking-skeleton.asyncapi.yaml`

## Allowed Paths

- `tests/e2e/`, test fixtures, E2E Compose and routing
- narrowly required public composition adapters and their tests
- E2E evidence, checks, root package metadata, and this handoff

## Forbidden Paths

- `packages/domain-modules/`
- production activation inputs and concrete provider integrations

## Contract Changes

None initially. Implementations consume the reviewed E2E-02 contracts unchanged.

## Migration Changes

None for the test-only source adapter. Any later durable test storage must use reviewed versioned migrations and may not run automatically at startup.

## Required Tests

- Source current-state/version recheck, server-side Actor Context resolution, authorization denial, idempotent duplicate, conflict, and retry behavior.
- Task/Workflow/Notification composition, duplicate/lost-receipt, unauthorized, and dependency failure tests.
- Real composed main-chain evidence before changing `mainWalkingSkeletonReady`.
- `pnpm check`.

## Authorization And Audit

Every formal source command resolves the actor context server-side, reauthorizes the current operation and resource, and records attempted plus terminal audit evidence without payload content.

## Idempotency, Retry And Failure

The same idempotency key and command fingerprint returns one stable receipt. A changed fingerprint conflicts. Authorization, state, and transient failures leave no accepted receipt and may be retried safely.

## Observability And Health

Telemetry uses bounded operation/outcome/error dimensions and excludes actor data, form data, files, credentials, and raw messages.

## Backward Compatibility

All source behavior remains under `tests/e2e`; production modules and activation are unchanged.

## Unresolved Questions

- Durable cross-process storage and the exact real-Compose Flowable/API/BFF/Workbench/File main-chain bindings remain to be selected from existing reviewed platform ports without introducing test policy into production.

## Handoff Result

In progress.

Implemented slices:

- A tests-only authoritative source validates the reviewed command, resolves Actor Context server-side, reauthorizes, checks current version/state/Workflow Task, and records a stable receipt by envelope idempotency key.
- Its Job MessageHandler enforces the exact fixed policy, participates in Eventing Inbox deduplication, and rejects stale authoritative state and payload drift.
- Task Center lost-receipt recovery reuses the exact prepared source command and produces one source effect.
- A tests-only Task source router completes through Workflow Facade before source acceptance; Workflow authorization, command Ledger, and lifecycle publication execute.
- The Notification Job MessageHandler resolves Actor Context server-side and delegates authorization, recipient resolution, idempotency, storage, and audit to Notification Center. Inbox duplicate delivery creates one notification, and a payload cannot inject a trusted Actor.
- An isolated integration runner provisions short-lived TLS material, a dedicated VHost, and exact test-only publisher/consumer permissions, then installs both Job handlers through the real Worker Rabbit adapter.
- Real RabbitMQ Confirm publication, consumer topology declaration, manual ACK, and Eventing Inbox duplicate recognition pass for both Jobs. Duplicate redelivery leaves the source at `completed/version=2` and creates exactly one notification.
- The integration always removes its Compose container, network, Volume, and temporary TLS/account material. Production Task consumer activation remains absent.
- A second isolated integration deploys the reviewed synthetic BPMN through the public Workflow Facade, starts a real Flowable instance, obtains its human task, and routes Task Center completion through that Facade before source acceptance.
- Duplicate Task Center completion leaves the real Flowable task and instance completed, performs one source authorization, advances the source to `completed/version=2`, and publishes one Workflow completion lifecycle event.
- The Flowable integration removes its PostgreSQL/Flowable containers, network, Volume, and temporary Secrets. Its Workflow Ledger, Task Center, and authoritative source remain in memory and it is not yet installed in the full API/Worker composition.

Remaining before completion:

- Replace the in-memory Eventing, source, and Notification stores in this slice with reviewed PostgreSQL-backed durable stores; install the Task projection route in the full isolated Worker composition.
- Combine the separately proven real Flowable and RabbitMQ slices inside the full isolated Worker/API composition, then add authenticated API/BFF bindings, Workbench API polling, file/ClamAV, trace, and durable audit evidence.
- Run the full authorized, duplicate, denied, and dependency-failure scenarios before changing `mainWalkingSkeletonReady`.
