import type { AuditRecord } from "@ai-crm/crm-audit";
import type { FileReference } from "@ai-crm/crm-file-center";

import {
  browserTaskSourceTaskId,
  browserTaskSourceType,
  parseBrowserTaskCommand,
  type BrowserTaskCommandEvidence,
} from "./browser-task-command.js";

const TRACE_ID = /^(?!0{32})[0-9a-f]{32}$/u;
const TRACEPARENT = /^00-((?!0{32})[0-9a-f]{32})-(?!0{16})[0-9a-f]{16}-0[01]$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REFERENCE = /^[A-Za-z0-9_.:@/-]{1,255}$/u;
const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const SENSITIVE_KEY = /(?:authorization(?!DecisionId)|cookie|credential|password|payload|prompt|request|response|secret|session|token|(?:form|submission)[_-]?(?:body|content|data)|file[_-]?(?:body|content|data)|sql|query|parameters|params)/iu;
const SENSITIVE_VALUE = /(?:bearer\s+[a-z0-9._~+/=-]+|eyJ[a-z0-9_-]+\.eyJ[a-z0-9_-]+\.[a-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|__Host-[A-Za-z0-9_-]+=)/iu;

export interface DurableAuditCorrelationEvidence {
  readonly auditRecords: readonly AuditRecord[];
  readonly fileReference: FileReference;
  readonly taskCommand: BrowserTaskCommandEvidence;
  readonly traceId: string;
  readonly traceparent: string;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) =>
    descriptor.get === undefined && descriptor.set === undefined && descriptor.enumerable);
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  if (!record(value)) throw new Error("e2e_durable_audit_evidence_invalid");
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error("e2e_durable_audit_evidence_invalid");
  }
  return value;
}

function assertNoSensitiveEvidence(value: unknown, seen = new WeakSet<object>(), path = "evidence"): void {
  if (typeof value === "string") {
    if (SENSITIVE_VALUE.test(value)) throw new Error(`e2e_durable_audit_evidence_sensitive_value:${path}`);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) assertNoSensitiveEvidence(item, seen, `${path}[${String(index)}]`);
    return;
  }
  if (!record(value)) throw new Error("e2e_durable_audit_evidence_invalid");
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`e2e_durable_audit_evidence_sensitive_key:${path}.${key}`);
    assertNoSensitiveEvidence(child, seen, `${path}.${key}`);
  }
}

function fileReference(value: unknown): FileReference {
  const candidate = exact(value, ["contentVersionId", "displayName", "fileId", "version"], ["mediaType", "sizeBytes"]);
  if (typeof candidate["contentVersionId"] !== "string" || !UUID.test(candidate["contentVersionId"]) ||
    typeof candidate["fileId"] !== "string" || !UUID.test(candidate["fileId"]) ||
    typeof candidate["displayName"] !== "string" || candidate["displayName"].length < 1 || candidate["displayName"].length > 255 ||
    /[\0\r\n\\/]/u.test(candidate["displayName"]) || candidate["version"] !== 1 ||
    (candidate["mediaType"] !== undefined && (typeof candidate["mediaType"] !== "string" || !MEDIA_TYPE.test(candidate["mediaType"]))) ||
    (candidate["sizeBytes"] !== undefined && (!Number.isSafeInteger(candidate["sizeBytes"]) || (candidate["sizeBytes"] as number) < 0))) {
    throw new Error("e2e_durable_audit_evidence_invalid");
  }
  return Object.freeze({
    contentVersionId: candidate["contentVersionId"].toLowerCase(),
    displayName: candidate["displayName"],
    fileId: candidate["fileId"].toLowerCase(),
    ...(candidate["mediaType"] === undefined ? {} : { mediaType: candidate["mediaType"] }),
    ...(candidate["sizeBytes"] === undefined ? {} : { sizeBytes: candidate["sizeBytes"] as number }),
    version: 1,
  });
}

function auditRecord(value: unknown, traceId: string): AuditRecord {
  const candidate = exact(value, ["action", "actor", "auditId", "occurredAt", "reason", "resource", "result", "trace", "version"]);
  const actor = exact(candidate["actor"], ["actorId", "actorType"], ["assignmentId", "workforcePersonId"]);
  const reason = exact(candidate["reason"], ["code"]);
  const resource = exact(candidate["resource"], ["resourceId", "resourceType"]);
  const trace = exact(candidate["trace"], ["operationId", "traceId"], ["authorizationDecisionId"]);
  const occurredAt = typeof candidate["occurredAt"] === "string" ? candidate["occurredAt"] : "";
  const occurredAtMilliseconds = Date.parse(occurredAt);
  if (typeof candidate["action"] !== "string" || !REFERENCE.test(candidate["action"]) ||
    typeof candidate["auditId"] !== "string" || !UUID.test(candidate["auditId"]) ||
    !Number.isFinite(occurredAtMilliseconds) || new Date(occurredAtMilliseconds).toISOString() !== occurredAt ||
    candidate["version"] !== 1 || !["attempted", "denied", "failed", "succeeded"].includes(String(candidate["result"])) ||
    typeof actor["actorId"] !== "string" || !REFERENCE.test(actor["actorId"]) ||
    (actor["actorType"] !== "authenticated_subject" && actor["actorType"] !== "system") ||
    (actor["assignmentId"] !== undefined && (typeof actor["assignmentId"] !== "string" || !UUID.test(actor["assignmentId"]))) ||
    (actor["workforcePersonId"] !== undefined && (typeof actor["workforcePersonId"] !== "string" || !UUID.test(actor["workforcePersonId"]))) ||
    typeof reason["code"] !== "string" || !REFERENCE.test(reason["code"]) ||
    typeof resource["resourceId"] !== "string" || !REFERENCE.test(resource["resourceId"]) ||
    typeof resource["resourceType"] !== "string" || !REFERENCE.test(resource["resourceType"]) ||
    typeof trace["operationId"] !== "string" || !UUID.test(trace["operationId"]) || trace["traceId"] !== traceId ||
    (trace["authorizationDecisionId"] !== undefined && (typeof trace["authorizationDecisionId"] !== "string" || !UUID.test(trace["authorizationDecisionId"])))) {
    throw new Error("e2e_durable_audit_evidence_invalid");
  }
  return candidate as unknown as AuditRecord;
}

export function assertDurableAuditCorrelationEvidence(value: unknown): Readonly<DurableAuditCorrelationEvidence> {
  assertNoSensitiveEvidence(value);
  const candidate = exact(value, ["auditRecords", "fileReference", "taskCommand", "traceId", "traceparent"]);
  if (typeof candidate["traceId"] !== "string" || !TRACE_ID.test(candidate["traceId"]) ||
    typeof candidate["traceparent"] !== "string" || TRACEPARENT.exec(candidate["traceparent"])?.[1] !== candidate["traceId"] ||
    !Array.isArray(candidate["auditRecords"]) || candidate["auditRecords"].length < 2 || candidate["auditRecords"].length > 100) {
    throw new Error("e2e_durable_audit_evidence_invalid");
  }
  const taskCommand = parseBrowserTaskCommand(candidate["taskCommand"]);
  if (taskCommand.traceId !== candidate["traceId"]) throw new Error("e2e_durable_audit_evidence_trace_mismatch");
  const auditRecords = Object.freeze(candidate["auditRecords"].map((item) => auditRecord(item, candidate["traceId"] as string)));
  const hasFormAudit = auditRecords.some((audit) => (audit.action === "form.submission.validate" || audit.action === "form.submission.accept") &&
    audit.resource.resourceType === "form_submission" && audit.result === "succeeded");
  const hasTaskAudit = auditRecords.some((audit) => audit.action === "task.task_complete" &&
    audit.resource.resourceId === `${browserTaskSourceType}:${browserTaskSourceTaskId}` &&
    audit.resource.resourceType === "task_projection" && audit.result === "succeeded");
  if (!hasFormAudit || !hasTaskAudit) throw new Error("e2e_durable_audit_evidence_association_missing");
  return Object.freeze({
    auditRecords,
    fileReference: fileReference(candidate["fileReference"]),
    taskCommand,
    traceId: candidate["traceId"],
    traceparent: candidate["traceparent"],
  });
}
