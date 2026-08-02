import { describe, expect, it, vi } from "vitest";

import { FormSchemaError, type FormSchemaQueryService } from "@ai-crm/platform-form-schema";

import { createWalkingSkeletonFormSubmissionHttpAdapter } from "./walking-skeleton-form-submission-http.js";
import {
  createWalkingSkeletonFormSubmissionService,
  WalkingSkeletonFormSubmissionError,
  type WalkingSkeletonFormSubmissionReceipt,
  type WalkingSkeletonFormSubmissionStore,
} from "./walking-skeleton-form-submission.js";

const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const traceparent = `00-${traceId}-00f067aa0ba902b7-01`;
const operationId = "81000000-0000-4000-8000-000000000001";
const fileReference = Object.freeze({ contentVersionId: "93000000-0000-4000-8000-000000000002", displayName: "synthetic.txt", fileId: "93000000-0000-4000-8000-000000000001", mediaType: "text/plain", sizeBytes: 24, version: 1 as const });
const context = Object.freeze({ actor: Object.freeze({ actorId: "subject.synthetic", actorType: "authenticated_subject" as const }), subject: Object.freeze({ activeAssignmentIds: Object.freeze(["71000000-0000-4000-8000-000000000007"]), workforcePersonId: "71000000-0000-4000-8000-000000000001" }), traceId });
const data = Object.freeze({ content_version_id: fileReference.contentVersionId, file_id: fileReference.fileId, synthetic_value: "synthetic_value" });

function memoryStore(): WalkingSkeletonFormSubmissionStore & { readonly committed: WalkingSkeletonFormSubmissionReceipt[] } {
  const byOperation = new Map<string, { fingerprint: string; receipt: WalkingSkeletonFormSubmissionReceipt }>();
  const byReference = new Map<string, WalkingSkeletonFormSubmissionReceipt>();
  const actors = new Map<string, Parameters<WalkingSkeletonFormSubmissionStore["accept"]>[0]["actor"]>();
  const committed: WalkingSkeletonFormSubmissionReceipt[] = [];
  return {
    committed,
    accept(input) {
      const prior = byOperation.get(input.receipt.operationId);
      if (prior !== undefined) {
        if (prior.fingerprint !== input.fingerprint) throw new WalkingSkeletonFormSubmissionError("submission_conflict");
        return Promise.resolve(Object.freeze({ ...prior.receipt, replayed: true }));
      }
      const value = Object.freeze({ ...input.receipt, replayed: false });
      byOperation.set(input.receipt.operationId, { fingerprint: input.fingerprint, receipt: value });
      byReference.set(value.submissionReference, value);
      actors.set(value.submissionReference, input.actor);
      committed.push(value);
      return Promise.resolve(value);
    },
    getBySubmissionReference(reference) {
      const value = byReference.get(reference);
      if (value === undefined) return Promise.resolve(undefined);
      const actor = actors.get(reference);
      if (actor === undefined) return Promise.resolve(undefined);
      return Promise.resolve({ actor, fileReference: value.fileReference, operationId: value.operationId, reference: value.reference, submissionReference: value.submissionReference, submittedAt: value.submittedAt, traceId: value.traceId, version: value.version });
    },
  };
}

function fixture(overrides: Readonly<{ allowed?: boolean; onDependencyFailure?: (stage: "authorize" | "store" | "validate") => void; store?: WalkingSkeletonFormSubmissionStore; validate?: FormSchemaQueryService["validateSubmission"] }> = {}) {
  let sequence = 0;
  const store = overrides.store ?? memoryStore();
  const validateSubmission = overrides.validate ?? vi.fn().mockResolvedValue({ errors: [], reference: { contentDigest: "a".repeat(64), definitionId: "platform.synthetic.task-completion", releaseVersion: 1, version: 1 }, valid: true });
  const service = createWalkingSkeletonFormSubmissionService({
    authorizer: { authorize: () => Promise.resolve({ allowed: overrides.allowed ?? true, decisionId: "82000000-0000-4000-8000-000000000001" }) },
    clock: () => new Date("2026-08-02T00:00:00.000Z"),
    id: () => { sequence += 1; return `83000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`; },
    ...(overrides.onDependencyFailure === undefined ? {} : { onDependencyFailure: overrides.onDependencyFailure }),
    store,
    validator: { getRelease: vi.fn(), validateSubmission },
  });
  return { service, store, validateSubmission };
}

describe("Walking Skeleton Form submission command", () => {
  it("generates the server receipt, durably replays it, and supports receipt lookup", async () => {
    const target = fixture();
    const command = { context, data, fileReference, operationId, traceparent };
    const first = await target.service.submit(command);
    const replay = await target.service.submit(command);
    expect(first).toMatchObject({ operationId, replayed: false, submissionReference: "submission.83000000-0000-4000-8000-000000000001", traceId });
    expect(replay).toEqual({ ...first, replayed: true });
    await expect(target.store.getBySubmissionReference(first.submissionReference)).resolves.toMatchObject({ operationId, submissionReference: first.submissionReference });
    expect(target.validateSubmission).toHaveBeenCalledTimes(2);
  });

  it("replays the first receipt when a transport retry carries a new trace", async () => {
    const target = fixture();
    const first = await target.service.submit({ context, data, fileReference, operationId, traceparent });
    const retryTraceId = "5bf92f3577b34da6a3ce929d0e0e4736";
    const replay = await target.service.submit({
      context: { ...context, traceId: retryTraceId },
      data,
      fileReference,
      operationId,
      traceparent: `00-${retryTraceId}-10f067aa0ba902b7-01`,
    });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(replay.traceId).toBe(traceId);
  });

  it("rejects authorization, invalid input, dependency failure, and conflicting replay without a false commit", async () => {
    const denied = fixture({ allowed: false });
    await expect(denied.service.submit({ context, data, fileReference, operationId, traceparent })).rejects.toMatchObject({ code: "submission_denied" });
    expect((denied.store as ReturnType<typeof memoryStore>).committed).toHaveLength(0);
    const recoveringValidation = vi.fn()
      .mockRejectedValueOnce(new Error("synthetic dependency"))
      .mockResolvedValue({ errors: [], reference: { contentDigest: "a".repeat(64), definitionId: "platform.synthetic.task-completion", releaseVersion: 1, version: 1 }, valid: true });
    const unavailable = fixture({ validate: recoveringValidation });
    await expect(unavailable.service.submit({ context, data, fileReference, operationId, traceparent })).rejects.toMatchObject({ code: "submission_dependency_unavailable", retryable: true });
    await expect(unavailable.service.submit({ context, data, fileReference, operationId, traceparent })).resolves.toMatchObject({ replayed: false });
    const expired = fixture({ validate: vi.fn().mockRejectedValue(new FormSchemaError("form_not_found")) });
    await expect(expired.service.submit({ context, data, fileReference, operationId, traceparent })).rejects.toMatchObject({ code: "submission_invalid", retryable: false });
    const conflict = fixture();
    await conflict.service.submit({ context, data, fileReference, operationId, traceparent });
    await expect(conflict.service.submit({ context, data: { ...data, synthetic_value: "changed" }, fileReference, operationId, traceparent })).rejects.toMatchObject({ code: "submission_conflict" });
  });

  it("reports only the fixed dependency stage without changing the public failure", async () => {
    const stages = vi.fn();
    const target = fixture({ onDependencyFailure: stages, validate: vi.fn().mockRejectedValue(new Error("private database detail")) });
    await expect(target.service.submit({ context, data, fileReference, operationId, traceparent })).rejects.toMatchObject({
      code: "submission_dependency_unavailable",
      message: "submission_dependency_unavailable",
      retryable: true,
    });
    expect(stages).toHaveBeenCalledExactlyOnceWith("validate");
  });

  it("enforces Session mutation evidence before resolving actor or invoking the command", async () => {
    const target = fixture();
    const validateMutation = vi.fn().mockRejectedValueOnce(Object.assign(new Error("csrf"), { code: "authentication_csrf_rejected" })).mockResolvedValue(undefined);
    const resolveContext = vi.fn().mockResolvedValue(context);
    const adapter = createWalkingSkeletonFormSubmissionHttpAdapter({ resolveContext, service: target.service, validateMutation });
    const request = { body: JSON.stringify({ data, fileReference, version: 1 }), contentType: "application/json", credential: "session-handle", csrfToken: "csrf", idempotencyKey: operationId, method: "POST", origin: "https://workbench.invalid", traceparent };
    await expect(adapter.handle(request)).resolves.toMatchObject({ body: { code: "authentication_csrf_rejected" }, status: 403 });
    expect(resolveContext).not.toHaveBeenCalled();
    await expect(adapter.handle(request)).resolves.toMatchObject({ body: { replayed: false }, status: 201 });
    expect(resolveContext).toHaveBeenCalledTimes(1);
    validateMutation.mockRejectedValueOnce(Object.assign(new Error("expired"), { code: "authentication_session_invalid" }));
    await expect(adapter.handle({ ...request, idempotencyKey: "81000000-0000-4000-8000-000000000002" })).resolves.toMatchObject({ body: { code: "authentication_required" }, status: 401 });
  });
});
