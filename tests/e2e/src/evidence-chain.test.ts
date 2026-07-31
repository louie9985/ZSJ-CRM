import { randomUUID } from "node:crypto";

import { createFormSchemaService, createMemoryFormSchemaStore, type FormAudit } from "@ai-crm/platform-form-schema";
import { createTaskCenter, InMemoryTaskCenterStore, type TaskAudit, type TaskLifecycleEvent } from "@ai-crm/platform-task-center";
import { describe, expect, it, vi } from "vitest";

const at = "2026-07-30T00:00:00.000Z";
const traceId = "abcdefabcdefabcdefabcdefabcdefab";
const actor = { actorId: "principal.synthetic", actorType: "authenticated_subject" as const, assignmentId: "00000000-0000-4000-8000-000000000007" };
const taskActor = { activeAssignmentIds: [actor.assignmentId], principalId: actor.actorId };
const fileReference = Object.freeze({
  contentVersionId: "00000000-0000-4000-8000-000000000102",
  displayName: "evidence.txt",
  fileId: "00000000-0000-4000-8000-000000000101",
  mediaType: "text/plain",
  sizeBytes: 12,
  version: 1 as const,
});

describe("walking skeleton evidence chain", () => {
  it("keeps form release, stable FileReference, task completion and durable trace evidence together", async () => {
    const evidence: Array<{ module: string; traceId: string; operationId: string; result: string; resource: string }> = [];
    const formAudit: FormAudit = { record: (record) => { evidence.push({ module: "form", traceId: record.traceId, operationId: record.operationId, result: record.result, resource: record.resourceId }); return Promise.resolve(); } };
    const formActor = { actorId: actor.actorId, actorType: actor.actorType, assignmentId: actor.assignmentId };
    const form = createFormSchemaService(createMemoryFormSchemaStore(), { authorize: () => Promise.resolve({ allowed: true, decisionId: "00000000-0000-4000-8000-000000000201" }) }, formAudit, { clock: () => new Date(at), id: randomUUID });
    const metadata = () => ({ actor: formActor, operationId: randomUUID(), reason: "synthetic evidence chain", traceId });
    await form.saveDraft({ ...metadata(), definitionId: "platform.synthetic.evidence", expectedRevision: 0, ownerModule: "platform.synthetic", jsonSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", additionalProperties: false, required: ["synthetic_value"], properties: { synthetic_value: { type: "string", minLength: 1 } } }, uiSchema: { fields: [{ component: "input", field: "synthetic_value", order: 1 }], layout: "vertical", version: 1 } });
    await form.publish({ ...metadata(), definitionId: "platform.synthetic.evidence", expectedRevision: 1 });
    await form.setReleaseActive({ ...metadata(), active: true, definitionId: "platform.synthetic.evidence", releaseVersion: 1 });
    const submission = { synthetic_value: fileReference.fileId };
    await expect(form.validateSubmission({ actor: formActor, data: submission, definitionId: "platform.synthetic.evidence", releaseVersion: 1 })).resolves.toMatchObject({ valid: true, reference: { definitionId: "platform.synthetic.evidence", releaseVersion: 1, version: 1 } });
    expect(fileReference).toMatchObject({ version: 1, fileId: "00000000-0000-4000-8000-000000000101", contentVersionId: "00000000-0000-4000-8000-000000000102" });

    let attempts = 0;
    const taskAudit: TaskAudit = { record: (record) => { evidence.push({ module: "task", traceId, operationId: record.referenceId, result: record.phase, resource: record.referenceId }); return Promise.resolve(); } };
    let denialPending = true;
    const authorization = { authorize: vi.fn(async ({ operation }: { operation: string }) => ({ allowed: operation !== "task_detail" || !denialPending, decisionId: "00000000-0000-4000-8000-000000000202" })) };
    const router = { complete: vi.fn(async () => { attempts += 1; if (attempts === 1) throw new Error("dependency_unavailable"); return { sourceCommandId: "00000000-0000-4000-8000-000000000301", status: "accepted" as const }; }) };
    const event: TaskLifecycleEvent = { assigneeReference: actor.assignmentId, deepLink: { appId: "platform.synthetic", routeId: "platform.synthetic.detail" }, eventId: "00000000-0000-4000-8000-000000000302", occurredAt: at, sourceTaskId: "task.synthetic.evidence", sourceType: "platform.synthetic", sourceVersion: 1, status: "open" };
    const task = createTaskCenter({ audit: taskAudit, authorization, router, sourceReader: { get: () => Promise.resolve(event) }, store: new InMemoryTaskCenterStore() });
    await task.apply(event);
    await expect(task.get(taskActor, event)).rejects.toMatchObject({ code: "TASK_OPERATION_DENIED" });
    denialPending = false;
    attempts = 0;
    await expect(task.complete({ ...event, actor: taskActor, idempotencyKey: "evidence-chain-complete" })).rejects.toMatchObject({ code: "TASK_SOURCE_UNAVAILABLE", retryable: true });
    await expect(task.complete({ ...event, actor: taskActor, idempotencyKey: "evidence-chain-complete" })).resolves.toMatchObject({ status: "accepted" });
    expect(router.complete).toHaveBeenCalledTimes(2);
    expect(evidence.filter((entry) => entry.traceId !== traceId)).toHaveLength(0);
    expect(evidence.some((entry) => entry.module === "form" && entry.result === "succeeded")).toBe(true);
    expect(evidence.some((entry) => entry.module === "task" && entry.result === "succeeded")).toBe(true);
  });

  it("rejects an expired form release before task completion can be attempted", async () => {
    const form = createFormSchemaService(createMemoryFormSchemaStore(), { authorize: () => Promise.resolve({ allowed: true, decisionId: "00000000-0000-4000-8000-000000000401" }) }, { record: () => Promise.resolve() }, { clock: () => new Date(at), id: randomUUID });
    const metadata = { actor, operationId: randomUUID(), reason: "expired release", traceId };
    await form.saveDraft({ ...metadata, definitionId: "platform.synthetic.expiring", expectedRevision: 0, ownerModule: "platform.synthetic", jsonSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: {}, additionalProperties: false }, uiSchema: { fields: [], layout: "vertical", version: 1 } });
    await form.publish({ ...metadata, operationId: randomUUID(), definitionId: "platform.synthetic.expiring", expectedRevision: 1 });
    await form.setReleaseActive({ ...metadata, operationId: randomUUID(), active: false, definitionId: "platform.synthetic.expiring", releaseVersion: 1 });
    await expect(form.validateSubmission({ actor, data: {}, definitionId: "platform.synthetic.expiring", releaseVersion: 1 })).rejects.toMatchObject({ code: "form_not_found" });
  });
});
