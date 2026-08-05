# Production Two-Host Compose Baseline

This directory describes two independent Docker Compose projects. It does not provide cross-host scheduling or automatic failover.

| Host | Services | Boundary |
|---|---|---|
| A | Edge, API A, PostgreSQL, Redis, RabbitMQ, Flowable, ClamAV | State services and the public entry remain single points of failure. |
| B | API B, Worker | Reaches Host A state services only over reviewed private routing. |

The edge exposes the PC application, internal H5 application, reviewed API routes, and `/auth/pc/*` plus `/auth/internal-h5/*`. State services and operator endpoints stay private.

Production secrets are root-owned restricted files mounted per service. Authentication requires `session_index_key`; API database, Redis, COS, realtime RabbitMQ and TLS secrets remain purpose-specific. No password, session credential or secret value belongs in Compose YAML, environment values, command arguments or logs.

The API URL authenticates as `ai_crm_runtime`; Worker uses `ai_crm_worker_runtime`. Both fail readiness if the fixed database identity probe observes a different role. PostgreSQL and Redis remain authoritative dependencies for local Account/Access; a dependency outage fails authentication closed.

All images must be immutable versions or digests. Release activation still requires the reviewed release manifest, migration compatibility, backup/restore evidence, TLS/private-routing evidence and the repository production gates. This topology does not claim HA, SLA, RPO or RTO.
