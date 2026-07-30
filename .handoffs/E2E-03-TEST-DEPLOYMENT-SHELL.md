# E2E-03 Isolated Test Deployment Shell

## Objective

Run API, Worker, Workbench, and the seven dependency services in one isolated test Compose project without claiming the main Walking Skeleton is ready.

## Known Facts

- The dependency-only Compose project is repeatable and healthy.
- Non-production API bindings intentionally report Not Ready and reject platform operations.
- Non-production Worker starts without production consumers.
- The Workbench production build intentionally uses its maintenance port.

## Allowed Assumptions

- Process liveness can prove packaging, networking, routing, startup, shutdown, and cleanup independently from business readiness.
- Test images may be built from the current workspace and remain local to the isolated project.

## Forbidden Assumptions

- A live process is not a Ready platform and does not satisfy any main E2E item.
- Do not enable a production consumer, create synthetic production policy, or use a browser Fixture as API evidence.
- Do not publish test service ports or embed Secret values.

## Non-goals

- Authentication, Workflow, Task, Notification, form, file, audit, or Trace end-to-end behavior.
- Production image publication, deployment, or recovery evidence.

## Authority And References

- `AGENTS.md`
- `docs/04-工程手册/第一阶段AI并行开发实施计划.md`
- `docs/06-质量验收/第一阶段Walking-Skeleton验收清单.md`
- E2E-02 reviewed contracts

## Allowed Paths

- `apps/workbench-web/Dockerfile`
- `apps/workbench-web/nginx.conf`
- `deploy/compose/compose.e2e.yml`
- `deploy/nginx/nginx.e2e.conf`
- `scripts/check/verify-compose.mjs`
- `scripts/check/run-e2e-shell-integration.mjs`
- `tests/e2e/`
- root `package.json`
- this handoff

## Forbidden Paths

- `packages/domain-modules/`
- Production Compose files and production activation inputs
- Real provider configuration

## Contract Changes

None.

## Migration Changes

None. Startup must not apply migrations.

## Dependencies

- Existing API and Worker production-quality Docker build paths.
- Nginx 1.28.0, Node 24.15.0, and the seven pinned dependency images.

## Required Tests

- Effective Compose static safety and exact-service assertions.
- Image build and ten-service isolated Compose startup.
- Edge liveness, Workbench HTML, API liveness, API expected Not Ready, and Worker health-file checks.
- Project-scoped Volume/network/container and temporary Secret cleanup.
- `pnpm check`.

## Authorization And Audit

No business operation is authorized by this shell. API platform calls remain unavailable and no business audit fact is generated.

## Idempotency, Retry And Failure

The runner uses a unique project name, bounded commands, diagnostic logs on failure, and cleanup in `finally`. Repeating it creates an independent project.

## Observability And Health

API liveness and Worker health-file status prove only process health. API readiness must remain `503` until E2E bindings exist.

## Backward Compatibility

Additive test overlay only; existing development, integration, and production definitions remain unchanged.

## Deliverables

Test images, edge routing, isolated Compose overlay, static gate, executable integration runner, evidence update.

## Unresolved Questions

The E2E API bindings, Worker handlers, and Workbench API adapter are intentionally deferred to the main-chain implementation task.

## Handoff Result

Superseded and completed by `E2E-03-ISOLATED-PROCESS-COMPOSITION.md`. The final API bindings are Ready only for the process skeleton, while all unfinished platform operations still fail closed. The real 10-service Compose integration passed and cleaned up; this does not satisfy the main Walking Skeleton acceptance flow.
