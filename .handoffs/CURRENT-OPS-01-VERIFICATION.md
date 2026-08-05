# Current OPS-01 Verification

- Verification date: 2026-08-02
- Verified commit: `9698e3e` (`Verify browser to worker trace chain`)
- Repository status: `REPOSITORY_GATES_VERIFIED_EXTERNAL_ACCEPTANCE_BLOCKED`
- Scope: independent, non-destructive verification of repository-owned OPS-01 release and rollback gates

## Known Facts

- The approved first-stage production topology remains two Tencent Cloud Ubuntu CVMs running two independent Docker Compose projects. It is not a cluster and does not establish automatic failover or high availability.
- Production API and Worker Dockerfiles use patch-versioned Node images, copy reviewed migration artifacts, sanitize application-owned runtime payloads, and run as the non-root `node` user.
- The application image workflow builds API and Worker images for pull requests, jointly verifies their extracted migration artifacts, and publishes commit-addressed images only on `main` pushes. Repository inspection does not prove that a registry image was actually published or retained.
- The production release manifest is an evidence index. Its `evidence://` references and digests do not prove the referenced evidence exists, came from a trusted source, or was approved.
- Docker CLI/Engine 29.6.2 and Docker Compose 5.3.1 are installed. The Engine was initially unavailable, then restored during the follow-up; only isolated local acceptance containers and the existing dev Redis container were exercised. No registry, staging host, or production host was changed.
- The working tree contained concurrent changes to the current acceptance audit, the parallel execution plan, and the G5 sign-off handoff. They were not modified or evaluated by this task.

## Allowed Assumptions

- Synthetic, non-secret variables may be used to prove deterministic Compose rendering and failure-closed static gates.
- Repository tests may use synthetic image digests and bounded evidence references to test validation behavior.
- A missing integration dependency may be explicitly disabled for a unit/static-only verification, provided the resulting evidence is not represented as integration evidence.

## Forbidden Assumptions

- Do not treat synthetic release metadata, static Dockerfiles, CI workflow source, or a successful Compose render as proof of an immutable image pull, a running non-root container, a staging release, a rollback, or production readiness.
- Do not treat the repository-owned manifest verifier as proof that an external evidence store, operator, approver, recovery point, or registry is trustworthy.
- Do not invent host identities, domains, image digests, Secret values, Owners, resource limits, monitoring thresholds, SLA, RPO, RTO, retention, or rollback timing.
- Do not claim that two CVMs remove the single points of failure in PostgreSQL, Redis, RabbitMQ, Keycloak, Flowable, Nginx, or the Host A state placement.

## Non-goals

- No real image build, pull, push, signing, registry inspection, deployment, traffic switch, Worker drain, rollback, Secret rotation, monitoring test, backup, or recovery exercise.
- No Docker Desktop repair or local runtime cleanup.
- No change to application, platform, contract, migration, deployment, or shared acceptance-audit sources.

## Commands And Results

| Command | Result | Evidence boundary |
| --- | --- | --- |
| `node --test scripts/check/release-gates.test.mjs scripts/check/migration-artifact.test.mjs scripts/check/production-deployment-gates.test.mjs scripts/check/application-images.test.mjs` | PASS, 34/34 | Static release validation, image source/workflow policy, migration artifact integrity, drain/grace relationship, previous-key overlay, and rejection paths. |
| `pnpm compose:check` | PASS | Production and non-production Compose definitions satisfy the repository static safety baseline. |
| `node scripts/deploy/verify-release.mjs deploy/releases/release-manifest.example.json` | PASS | The synthetic manifest has valid OPS-01 structure and evidence bindings; referenced evidence remains unverified. |
| Relevant `pnpm exec eslint ... --max-warnings 0` | PASS | Deployment and production gate scripts have no lint findings. |
| `docker compose ... config --quiet` for Host A, Host B, and both previous-key overlays using synthetic non-secret inputs | PASS, 4/4 | Both independent projects and optional overlays render. This does not start containers or validate host files. |
| Rendered Host B Compose piped to `verify-worker-drain.mjs -` | PASS | Synthetic drain `20s` is strictly less than synthetic stop grace `30s`; production values remain unapproved. |
| In-memory migration manifest build | PASS, 30 files, `sha256:6c9f80380f9e970c2eb40cf562267182941724620b5f88abff950bc623c7a70c` | Digest describes this working tree only and is not a production-approved digest. |
| `git diff --check` before this handoff | PASS | No whitespace errors in the concurrent working tree at that point. |
| Initial plain `pnpm check` | FAIL before environment correction | A residual local Redis password file enabled `platform-authorization` Redis integration while its matching Redis endpoint was unavailable; the test failed closed with `AUTHORIZATION_CACHE_UNAVAILABLE`. |
| `AI_CRM_AUTHORIZATION_REDIS_PASSWORD_FILE=<known-missing-path>; pnpm --filter @ai-crm/crm-authorization test` | PASS, 52 passed and 6 integration tests skipped | Proves the authorization unit suite; it is not Redis integration evidence. |
| `AI_CRM_AUTHORIZATION_REDIS_PASSWORD_FILE=<active-dev-secret-file>; pnpm check` after Docker recovery | PASS, 133/133 Turbo tasks | Uses the test's supported file override to connect the active dev Redis; the Redis integration is enabled and passes. The Secret value is neither printed nor copied. |

## What The Repository Can Prove

- Release metadata rejects floating application images, missing evidence bindings, malformed digests, non-independent operator/approver references, Secret-like fields, and invalid two-host placement.
- API and Worker image definitions are non-root and patch-versioned, and the CI source requires both extracted artifacts to match one externally supplied migration-manifest digest before publication.
- Production Compose definitions express two independent projects, bounded service placement, health checks, log rotation, read-only named Secret mounts, dedicated Secret reader groups, and an explicit opt-in previous-session-key overlay.
- The Worker runtime has bounded drain behavior tests, and the release gate rejects an unresolved, non-positive, equal, or excessive drain/stop-grace relationship.
- The Runbook defines serial release, stop conditions, Worker drain, health/smoke gates, application rollback, database forward-fix boundaries, and retained evidence requirements.
- Static validation and rendering are repeatable and do not authorize or perform a release.

## Evidence Still Required Outside The Repository

- Build and pull the exact API and Worker artifacts, retain registry-returned SHA-256 digests, extract both images, and verify the embedded migration directory/manifest against an independently approved digest.
- Verify the actual containers run non-root, read only their assigned `root:<reader-gid> 0440` Secret files, cannot access the Secret root or unrelated files, and fail closed for missing, malformed, or wrongly permissioned inputs.
- Run API liveness/readiness, Worker health, Nginx same-site routing/security headers, external probe, and business-neutral smoke checks on a shared staging or equivalent two-host environment.
- Execute and record the serial Host B then Host A rollout, actual Worker stop-accepting/in-flight/retry behavior, traffic observation window, and controlled rollback to the previous approved immutable images.
- Record migration-manifest validation, migration execution identity, recovery point, Compose hashes, health results, message backlog/recovery, Outbox/Inbox reconciliation, and data differences without including sensitive values.
- Sample container logs and hosted Sentry events for Token, Cookie, personal data, form body, file content, provider payload, SQL parameter, and unbounded route leakage; exercise Cloud Monitor and external-probe failure behavior.
- Verify host hardening, private state ports, SSH policy, Docker Socket exclusion, actual resource/capacity inputs, Owner/approver authority, and external evidence-store trust.

## Independent Review Dimensions

- Authorization: repository validation binds distinct bounded operator/approver references but cannot authenticate or authorize either identity; external approval remains required.
- Idempotency: manifest validation, rendering, and static checks are deterministic and side-effect free. Actual deployment retry and rollback idempotency remain unproved.
- Transactions: OPS-01 owns no business transaction. The Runbook preserves the boundary that application rollback does not reverse database migrations.
- Migrations: complete migration source inventory and joint artifact verification are statically covered; no actual image extraction or migration execution was performed.
- Observability: safe logging and monitoring requirements are encoded, but hosted Sentry, Cloud Monitor, external probes, and sensitive-data sampling need runtime evidence.
- Backward compatibility: base Compose remains free of the previous BFF key; the versioned overlay is opt-in. Runtime old/new compatibility still needs staging evidence.
- Secrets: templates use typed file references and minimum named mounts; real ownership, modes, rotation, revocation, and incident handling remain external evidence.
- Failure modes: repository gates fail closed for invalid metadata and configuration. Host, registry, network, dependency, drain timeout, traffic, and rollback failures remain unexercised.

## Current Decision

OPS-01 repository-owned gates remain implemented and independently reproducible. Docker recovery removed the immediate local runtime blocker, and the current tree passes the complete repository gate with Redis integration enabled. OPS-01 external acceptance is still not complete because immutable Registry images, real two-host staging release/rollback, runtime Secret sampling, monitoring evidence, and formal operator/approver evidence remain absent.
