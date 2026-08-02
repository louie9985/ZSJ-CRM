import { describe, expect, it } from "vitest";

import { browserTaskAssignmentId, browserTaskIdempotencyKey, browserTaskSourceTaskId, browserTaskSourceType } from "./browser-task-command.js";
import { assertDurableAuditCorrelationEvidence } from "./durable-audit-evidence.js";

const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const traceparent = `00-${traceId}-00f067aa0ba902b7-01`;
const actor = Object.freeze({ actorId: `subject:${"a".repeat(64)}`, actorType: "authenticated_subject" as const });
const audit = (action: string, resourceId: string, resourceType: string, offset: number) => Object.freeze({
  action,
  actor,
  auditId: `00000000-0000-4000-8000-${String(offset).padStart(12, "0")}`,
  occurredAt: `2026-08-02T00:00:0${String(offset)}.000Z`,
  reason: Object.freeze({ code: "synthetic_e2e" }),
  resource: Object.freeze({ resourceId, resourceType }),
  result: "succeeded",
  trace: Object.freeze({ operationId: `10000000-0000-4000-8000-${String(offset).padStart(12, "0")}`, traceId }),
  version: 1,
});
const evidence = Object.freeze({
  auditRecords: Object.freeze([
    audit("form.submission.validate", "submission.synthetic-0001", "form_submission", 1),
    audit("task.task_complete", `${browserTaskSourceType}:${browserTaskSourceTaskId}`, "task_projection", 2),
  ]),
  fileReference: Object.freeze({
    contentVersionId: "93000000-0000-4000-8000-000000000002",
    displayName: "synthetic-clean.txt",
    fileId: "93000000-0000-4000-8000-000000000001",
    mediaType: "text/plain",
    sizeBytes: 24,
    version: 1,
  }),
  taskCommand: Object.freeze({
    actor: Object.freeze({ activeAssignmentIds: Object.freeze([browserTaskAssignmentId]), principalId: actor.actorId }),
    idempotencyKey: browserTaskIdempotencyKey,
    sourceTaskId: browserTaskSourceTaskId,
    sourceType: browserTaskSourceType,
    traceId,
    version: 1,
  }),
  traceId,
  traceparent,
});

describe("durable Audit correlation evidence", () => {
  it("accepts only the stable FileReference, browser Task command and correlated Audit metadata", () => {
    expect(assertDurableAuditCorrelationEvidence(evidence)).toEqual(evidence);
  });

  it("fails closed when Trace or required Audit association diverges", () => {
    expect(() => assertDurableAuditCorrelationEvidence({ ...evidence, traceparent: `00-${"b".repeat(32)}-00f067aa0ba902b7-01` }))
      .toThrow("e2e_durable_audit_evidence_invalid");
    expect(() => assertDurableAuditCorrelationEvidence({ ...evidence, auditRecords: [evidence.auditRecords[0]] }))
      .toThrow("e2e_durable_audit_evidence_invalid");
    expect(() => assertDurableAuditCorrelationEvidence({ ...evidence, auditRecords: [evidence.auditRecords[0], { ...evidence.auditRecords[1], resource: { resourceId: "other-task", resourceType: "task_projection" } }] }))
      .toThrow("e2e_durable_audit_evidence_association_missing");
    expect(() => assertDurableAuditCorrelationEvidence({ ...evidence, auditRecords: [{ ...evidence.auditRecords[0], reason: { code: "synthetic_e2e", detail: "submitted form text" } }, evidence.auditRecords[1]] }))
      .toThrow("e2e_durable_audit_evidence_invalid");
  });

  it.each([
    ["cookie", { cookie: `__Host-ai_crm_pc_session=${"x".repeat(43)}` }],
    ["token", { accessToken: `Bearer ${"x".repeat(43)}` }],
    ["form body", { formBody: { synthetic: "submitted value" } }],
    ["file content", { fileContent: "synthetic file bytes" }],
    ["SQL parameters", { sqlParameters: ["private-value"] }],
  ])("rejects %s anywhere in the evidence", (_label, leaked) => {
    expect(() => assertDurableAuditCorrelationEvidence({ ...evidence, diagnostics: leaked }))
      .toThrow("e2e_durable_audit_evidence_sensitive");
  });
});
