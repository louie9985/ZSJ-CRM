# E2E File Center + ClamAV Parallel Handoff

## Scope facts

- The scenario uses the public `@ai-crm/crm-file-center` package entry point and the public `ClamAvMalwareScanner` export from `@ai-crm/worker`.
- It runs the pinned `clamav/clamav:1.4.5-debian` image in an isolated container, network, volume, and random loopback port.
- File bytes live only in process memory. The malicious fixture is the standard EICAR test string and is never written to the repository or a host temporary file.

## Assumptions and non-goals

- Test-only in-memory persistence and storage are allowed to isolate File Center state transitions from COS and PostgreSQL.
- No CRM entities, roles, fields, or states are introduced.
- This does not prove COS integration, PostgreSQL durability, production deployment, browser login, or the RabbitMQ/Flowable main chain.

## Shared integration request

- Add a package script for `node scripts/check/run-e2e-file-clamav-integration.mjs` only when the shared `package.json` owner is ready to integrate it.
- Add the resulting evidence to `tests/e2e/CURRENT-ENVIRONMENT-EVIDENCE.md` only after the evidence-file owner has reconciled all parallel E2E work.

## Review record

- Authorization: every upload, completion, and scan passes the File Center authorizer; scan authorization and success/failure audit facts are asserted.
- Idempotency: repeated clean and malicious scan commands use the same operation ID, replay the durable result, and do not create an additional quarantine target.
- Transactions and migrations: the conformance uses `MemoryFileCenterStore`; no schema or migration is changed, so database transaction durability is explicitly not claimed.
- Observability: stable audit action/result facts are asserted. No file bytes, EICAR content, credentials, or raw scanner response are logged.
- Compatibility: only existing public package exports are consumed; no existing contract is changed.
- Secrets: none are required or generated. The scenario connects only to a random loopback test port.
- Failure behavior: connection refusal is mapped to retryable `file_center_scan_unavailable`; the content version remains `pending_scan` and is not quarantined or made available.
- Cleanup: container, network, and named volume are removed in `finally`, including test failure.
