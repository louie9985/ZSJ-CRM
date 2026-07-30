# Backup And Recovery Evidence

This directory contains a repository-side, fail-closed evidence manifest validator for OPS-02. It does not create backups, resolve evidence, access COS, decrypt recovery material, or prove that a real restore succeeded.

## Current boundary

- The repository currently has only a local Docker development environment. There is no shared test, staging, production, or production-like recovery host.
- `recovery-evidence.example.json` contains synthetic references and non-authoritative placeholder digests. They satisfy the format check only; the file is a schema example, not acceptance evidence.
- Real COS bucket, access policy, account material, retention, RPO, RTO, drill frequency, and Owner fields remain unset until they are approved. Do not add them to this example.
- Ordinary backups must not include the plaintext Secret root. A minimum emergency bundle is referenced only through evidence that it was encrypted with an offline public key and that its decryption key remains outside the production hosts, Git, COS, and the bundle.

## Validate a manifest

```bash
node scripts/backup/verify-recovery-evidence.mjs path/to/recovery-evidence.json
```

With no path, the command validates the synthetic example. A structurally valid result means only that all required evidence bindings are present and well formed. The release authority must still resolve every `evidence://` reference from an approved evidence store, recompute each SHA-256 digest, verify identities and isolation, and independently approve the drill.

The manifest fails closed unless it contains:

- distinct operator and approver references;
- distinct source and isolated target environments and failure domains;
- explicit PostgreSQL version evidence;
- separate backup artifact, backup, restore, and verification evidence for `ai_crm`, `keycloak`, and `flowable`;
- bounded WAL segment range plus continuity and restore evidence;
- off-host failure-domain separation, private access, encryption-at-rest, and transport-encryption evidence;
- RabbitMQ topology plus Outbox, Inbox, and business-state reconciliation evidence;
- Compose, Nginx, Keycloak Realm, Flowable, and infrastructure configuration evidence;
- encrypted emergency-bundle, offline-key, key-separation, and isolated-restore evidence;
- empty-host provisioning, database restore, service startup, actual restore-point, elapsed-time, data-difference, and recovery verification evidence;
- host-compromise, access-material-leak, and offboarding-revocation exercise evidence.

Unknown fields, booleans in place of evidence objects, HTTP URLs, malformed digests, Secret-like fields or values, and unapproved RPO/RTO/SLA/retention/frequency/Owner claims are rejected. Never place evidence payloads or sensitive values in the manifest.

Repository tests for this boundary live in `scripts/check/backup-recovery.test.mjs`. Neither the validator nor its tests invoke PostgreSQL, RabbitMQ, `age`, COS, Docker, or any production system.
