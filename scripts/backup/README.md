# Backup And Recovery Evidence

This directory contains the repository-side fail-closed evidence validator for OPS-02. It does not create backups, access COS, decrypt recovery material or prove that a real restore succeeded.

The current environment is local development only. `recovery-evidence.example.json` contains synthetic references and placeholder digests; it is a schema example, not acceptance evidence.

The manifest requires separate backup, restore and verification evidence for `ai_crm` and `flowable`, PostgreSQL WAL continuity, off-host failure-domain separation, RabbitMQ topology plus Outbox/Inbox reconciliation, Compose/Nginx/Flowable configuration, encrypted emergency bundles, distinct operator and approver, and an isolated empty-host recovery exercise. Unknown fields, HTTP URLs, malformed digests, Secret-like values and self-asserted SLA/RPO/RTO claims are rejected.

Validate with `node scripts/backup/verify-recovery-evidence.mjs path/to/recovery-evidence.json`. Evidence payloads and Secret values never belong in the manifest.
