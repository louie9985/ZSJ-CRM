# Worker Job Contracts

Private Worker job payload schemas delivered through RabbitMQ. These execution contracts may reference retry, timeout, concurrency and dead-letter policies, and must not be reused as transport-neutral domain event schemas.

Reminder, reconciliation, and retry jobs are execution mechanisms. Their completion must not be treated as approval or domain-state truth, and Flowable or RabbitMQ payloads must not leak into public workflow contracts. Every job requires a deterministic idempotency key and must recheck its authoritative source state before producing side effects.

See [ADR-0010](../../docs/08-架构决策/ADR-0010-RabbitMQ与Redis异步执行及Outbox-Inbox.md).

`job-envelope.v1.schema.json` defines the private v1 execution envelope. Each request declares bounded retry, timeout, failure disposition, idempotency, and authoritative-state recheck context.

## Reviewed concrete jobs

### Walking Skeleton synthetic source command v1

`walking-skeleton-source-command.v1.schema.json` is owned by `tests.e2e.walking-skeleton` and is permanently test-scoped. It accepts only the `tests.walking-skeleton` source type and the `complete` action. Before accepting the command, the test source resolves `actorContextReference` on the server, reauthorizes the actor, compares `expectedSourceVersion` with its current state, verifies the referenced Workflow completion, and records one stable receipt for the envelope idempotency key. A Task projection, Flowable completion, or message delivery never substitutes for that receipt.

### Notification Intent submission v1

`notification-intent-submit.v1.schema.json` is owned by `platform.notifications`. It carries a stable server-side `actorContextReference` and the existing versioned Notification Intent. It never carries a trusted Actor. The consumer must resolve the current actor context and invoke Notification Center, which performs current authorization, recipient resolution, idempotency, persistence, and audit. Exhausted delivery is isolated; it does not delete or roll back an already-created in-app notification.

Both concrete jobs use three total attempts, fixed 30/300-second delays, a 10-second handler deadline, durable Inbox deduplication, manual ACK after the local transaction, and no automatic dead-letter replay. The first-stage route definitions are test-scoped and do not authorize production activation.
