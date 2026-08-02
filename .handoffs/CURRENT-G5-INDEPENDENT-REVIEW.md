# G5 Current Candidate Independent Review

- Review date: 2026-08-02
- Base commit: `a7c3e90`
- Scope: acceptance refresh, Browser/BFF/Task evidence bridge, durable evidence linkage, OPS-01/OPS-02 repository gates, and G5 sign-off status
- Decision: `REVIEW_FIXES_VERIFIED_EXTERNAL_SIGNOFF_BLOCKED`

## Known Facts

- The authoritative checklist contains 201 items. After closing the four former partial items in section 17, the current conservative audit is `VERIFIED_REPO 166 / PARTIAL 24 / EXTERNAL_BLOCKED 11 / CONTRACT_BLOCKED 0 / NOT_IMPLEMENTED 0`.
- `mainWalkingSkeletonReady=true` is produced only by the passing combined runner. Section 17 is complete and G4 is `PASSED_LOCAL`; this does not override the external G5 evidence requirements.
- The current tree passed the Docker-backed combined Browser to Worker runner and the complete 133/133 repository gate with the Authorization Redis integration enabled.
- No staging or production release, rollback, backup restore, hosted Sentry sample, real COS conformance run, or formal operator/approver action occurred.

## Assumptions And Non-goals

- Synthetic workforce, permission, Form, FileReference, Task, Workflow, Notification, and failure fixtures may prove business-neutral repository behavior.
- Local executable evidence cannot be promoted to registry, staging, production, recovery, or governance evidence.
- This review does not authorize production consumers, real providers, CRM domain modules, SLA, RPO, RTO, or automatic failover claims.

## Findings And Resolution

| Round | Severity | Finding | Resolution and regression evidence |
|---|---|---|---|
| Documentation review | P2 | G4 was described as passed while checklist items remained partial. | The subsequent `a7c3e90` combined implementation closed 17-03, 17-08, 17-09, and 17-17. G4 is now consistently `PASSED_LOCAL`; `mainWalkingSkeletonReady` remains explicitly scoped to the successful combined gate. |
| Documentation review | P2 | The current-tree check was described as complete although Redis integration had been skipped or blocked. | Docker/dev Redis was restored; the supported Secret-file override enabled the integration and `pnpm check` passed 133/133. |
| Documentation review | P2 | `17-09` service-side evidence was described as closing the full browser Form item. | The subsequent `a7c3e90` run rendered and submitted the Form UI in the same authenticated browser execution and matched the durable receipt/FileReference; 17-09 is now complete. |
| Documentation review | P2 | The latest evidence-bridge changes lacked a separate eight-dimension review record. | This handoff records findings, fixes, tests, evidence limits, and the final independent re-review. |
| Code review | P1 | Browser Task authorization used a hard-coded allowed decision and synthetic workforce instead of Organization/Authorization services. | `browser-authentication-bff.ts` now composes the public memory Organization service and real Authorization service. Allowed, unlinked, inactive-employment, and permission-denied scenarios are covered by unit tests and the Docker-backed browser runner. |
| Code review | P2 | The browser runner claimed HTTP idempotency without resending the accepted request. | It now resends the exact URL/method/Session/CSRF/Trace/idempotency-key request and requires an identical response; the combined evidence gate fails closed if replay evidence is absent. |
| Integration rerun | P1 | Organization workforce failures reached the Task Controller as `503`, so the browser denial acceptance failed. | Task error mapping now treats `subject_not_associated`, `employment_not_active`, and `assignment_not_active` as `403`, matching Form/File behavior. API regression tests cover all three codes; the combined rerun passed. |

## Eight-dimension Review

| Dimension | Result | Review conclusion |
|---|---|---|
| Authorization | PASS_REPO | Task completion resolves the authenticated subject through Organization and calls Authorization before recording the command. Unlinked, inactive-employment, and permission-denied browser requests fail closed with 403. Production policy/assignment evidence remains external. |
| Idempotency | PASS_REPO | The identical accepted HTTP request is replayed and returns the same bounded response; the durable submission, Task command, Outbox/Inbox, Flowable completion, and Notification assertions reject duplicate side effects. |
| Transactions | PASS_REPO | No migration or production transaction boundary changed. Durable Form submission, Task/Workflow ledger, Outbox/Inbox, and Audit checks remain PostgreSQL-backed in the combined slice. |
| Migrations | PASS_REPO | E2E migration 0018 adds append-only Form receipt/Outbox and Task-command evidence tables with recovery metadata. Deterministic migration/artifact gates and the complete repository check pass. |
| Observability | PASS_REPO | The browser Trace and traceparent match the command, two Outbox records, two Worker messages, two Inbox receipts, and 30 durable Audit records. Real logs and hosted Sentry sampling remain partial/external. |
| Backward compatibility | PASS_REPO | The Task denial mapping aligns with existing Form/File workforce-denial semantics. Test-only BFF options remain optional and production routes/consumer activation are unchanged. |
| Secrets | PASS_REPO | Test Secret files remain runtime-generated, file-mounted, unprinted, and cleaned. The full check used a path reference only; no Secret value entered code, commands, logs, or evidence. |
| Failure modes | PASS_REPO | CSRF, forged callback, fixation, expired/rotated Session, workforce denial, permission denial, inactive Form release, dependency failure, retry, HTTP replay, duplicate messages, and cleanup are covered. Real staging dependency and recovery drills remain external. |

## Verification

- `pnpm e2e:combined-evidence:integration`: passed with `taskAuthorizationDenied=true`, `taskCompletionReplayed=true`, `mainWalkingSkeletonReady=true`, and `e2e-browser-to-worker-causal-evidence-passed`.
- `pnpm --filter @ai-crm/e2e typecheck`, lint, test, and build: passed; E2E 75/75.
- API Task workforce-denial regression remains covered in `application.test.ts`; API package total 193 passed, 5 skipped, and Workbench 34/34 passed before the full gate.
- `pnpm repo:check`: 94/94 root checks passed.
- `pnpm contracts:check`: 29/29 packages passed.
- Complete `pnpm check`: 133/133 Turbo tasks passed with Authorization Redis integration enabled.
- Independent reviewer rerun: combined evidence passed with `taskAuthorizationDenied=true`, `taskCompletionReplayed=true`, 30 Audit records, and 2/2 Outbox/Inbox records; no P0-P3 remained and all isolated resources were cleaned.
- `git diff --check`: passed.

## Remaining Decision

No open P0-P3 finding remains in the reviewed repository change. Items `21-01` through `21-08` may remain `VERIFIED_REPO` for this candidate. G4 is `PASSED_LOCAL` with section 17 complete. G5 remains `EXTERNAL_BLOCKED` pending real release/rollback, recovery/security exercise, runtime telemetry sampling, provider/host evidence, and formal sign-off.
