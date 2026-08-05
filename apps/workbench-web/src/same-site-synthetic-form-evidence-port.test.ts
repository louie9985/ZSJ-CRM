import { describe, expect, it, vi } from "vitest";

import { createSameSiteSyntheticFormEvidencePort } from "./same-site-synthetic-form-evidence-port";

const traceparent = "00-76000000000000000000000000000001-7600000000000001-01";
const fileReference = Object.freeze({
  contentVersionId: "76000000-0000-4000-8000-000000000002",
  displayName: "synthetic.txt",
  fileId: "76000000-0000-4000-8000-000000000001",
  mediaType: "text/plain",
  sizeBytes: 9,
  version: 1 as const,
});
const release = Object.freeze({
  active: true,
  contentDigest: "a".repeat(64),
  definitionId: "crm.synthetic.task-completion",
  jsonSchema: {},
  releaseVersion: 1,
  uiSchema: { fields: [], layout: "vertical" as const, version: 1 as const },
});

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" }, status });
}

describe("same-site synthetic form evidence port", () => {
  it("loads the immutable release and submits through the session-bound test command", async () => {
    const receipt = { fileReference, operationId: "76000000-0000-4000-8000-000000000003", reference: { contentDigest: release.contentDigest, definitionId: release.definitionId, releaseVersion: 1, version: 1 }, replayed: false, submissionReference: "submission.synthetic", submittedAt: "2026-08-02T00:00:00.000Z", traceId: "76000000000000000000000000000001", version: 1 };
    const fetchPort = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(response(release))
      .mockResolvedValueOnce(response({ csrfToken: "c".repeat(43) }))
      .mockResolvedValueOnce(response(receipt));
    const port = createSameSiteSyntheticFormEvidencePort({ fileReferenceJson: JSON.stringify(fileReference), traceparent }, fetchPort);
    expect(port).toBeDefined();
    await expect(port?.loadRelease()).resolves.toEqual(release);
    await expect(port?.submit({ contentDigest: release.contentDigest, data: { content_version_id: fileReference.contentVersionId, file_id: fileReference.fileId, synthetic_value: "synthetic-approved" }, definitionId: release.definitionId, fileReference, releaseVersion: 1 })).resolves.toEqual(receipt);
    const thirdCall = fetchPort.mock.calls[2];
    expect(thirdCall?.[0]).toBe("/__e2e/walking-skeleton/form-submissions");
    expect(thirdCall?.[1]?.credentials).toBe("same-origin");
    expect(thirdCall?.[1]?.method).toBe("POST");
    const headers = new Headers(thirdCall?.[1]?.headers);
    expect(headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/u);
    expect(headers.get("X-CSRF-Token")).toBe("c".repeat(43));
    expect(headers.get("traceparent")).toBe(traceparent);
  });

  it("fails closed when test-only configuration or the BFF session is invalid", async () => {
    expect(createSameSiteSyntheticFormEvidencePort({ fileReferenceJson: "{}", traceparent: "invalid" }, vi.fn())).toBeUndefined();
    const port = createSameSiteSyntheticFormEvidencePort({ fileReferenceJson: JSON.stringify(fileReference), traceparent }, () => Promise.resolve(response({ csrfToken: "short" })));
    await expect(port?.submit({ contentDigest: release.contentDigest, data: { content_version_id: fileReference.contentVersionId, file_id: fileReference.fileId, synthetic_value: "synthetic-approved" }, definitionId: release.definitionId, fileReference, releaseVersion: 1 })).rejects.toThrow("synthetic_form_session_invalid");
  });
});
