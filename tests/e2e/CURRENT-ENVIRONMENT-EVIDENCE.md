# Current Local Evidence

- Date: 2026-08-04
- Scope: local Account/Access replacement and repository checks
- Environment: developer workstation only; no staging or production claim

Verified during the ADR-0034 implementation:

- The local PostgreSQL and Redis state was reset by exact Compose project/volume target, and all current versioned migrations applied successfully from empty state.
- The restricted-file initial administrator bootstrap completed successfully and a second run was idempotent; neither run printed the password.
- Real HTTP authentication integration passed for both `pc` and `internal-h5`, including their separate opaque cookies and session surfaces.
- API typecheck and 162 API unit/integration-style tests passed.
- Internal H5 typecheck and 28 component/runtime tests passed; development and production runtime use the same-site `internal-h5` contract.
- E2E typecheck and 65 package tests passed after replacing subject association fixtures with direct Workforce Person context.
- Workbench lint, typecheck, production build and 80 tests passed with the local login/logout and reauthentication flows.
- Repository, Prisma-boundary, Compose static, contract generation and package-boundary checks passed.
- Authentication contracts expose only `pc` and `internal-h5` login/session/reauthentication/assignment/logout.
- Complete `pnpm check` passed: 130/130 Turbo build/lint/typecheck/test/contracts tasks succeeded.

These are local development results only. They do not prove a production deployment, immutable-image rollout, external uptime, backup/restore, drain, alerting, RPO/RTO, or G5 external-operations acceptance. Earlier evidence for a different identity topology is not evidence for ADR-0034.
