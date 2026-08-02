# Form Contracts

Source contracts for the controlled JSON Schema 2020-12 dialect, UI Schema, immutable form releases, version references, validation results, and stable public errors.

Contracts never contain React imports, Ant Design component objects, arbitrary scripts, SQL, remote `$ref`, authorization logic, or submitted domain data. Concrete CRM forms are added only after their owning domain is confirmed.

`walking-skeleton-form-submission-command.v1.schema.json` and `walking-skeleton-form-submission-receipt.v1.schema.json` are permanently test-scoped. The command body is transient and is never persisted. The server generates `submissionReference` on first acceptance; an identical `Idempotency-Key` replay returns the same reference. The receipt contains only exact release, stable FileReference, operation, time, and safe Trace metadata. It proves command acceptance only, never domain-state or Task completion.

See [ADR-0013](../../docs/08-架构决策/ADR-0013-版本化表单与业务配置中心.md).
