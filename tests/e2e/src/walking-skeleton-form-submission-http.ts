import type { FileReference } from "@ai-crm/platform-file-center";
import type { FormQueryContext } from "@ai-crm/platform-form-schema";

import { WalkingSkeletonFormSubmissionError, type WalkingSkeletonFormSubmissionReceipt } from "./walking-skeleton-form-submission.js";

const MAX_BODY_BYTES = 262_144;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const JSON_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu;

export interface WalkingSkeletonFormSubmissionHttpRequest {
  readonly body?: string | Uint8Array;
  readonly contentType?: string;
  readonly credential?: string;
  readonly csrfToken?: string;
  readonly idempotencyKey?: string;
  readonly method: string;
  readonly origin?: string;
  readonly referer?: string;
  readonly traceparent?: string;
}

export interface WalkingSkeletonFormSubmissionHttpResponse {
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

export interface WalkingSkeletonFormSubmissionHttpAdapter {
  handle(request: WalkingSkeletonFormSubmissionHttpRequest): Promise<Readonly<WalkingSkeletonFormSubmissionHttpResponse>>;
}

export interface WalkingSkeletonFormSubmissionHttpAdapterOptions {
  readonly resolveContext: (input: Readonly<{ readonly credential: string; readonly traceparent: string }>) => Promise<FormQueryContext>;
  readonly service: Readonly<{ submit(input: Readonly<{ readonly context: FormQueryContext; readonly data: Readonly<{ readonly content_version_id: string; readonly file_id: string; readonly synthetic_value: string }>; readonly fileReference: FileReference; readonly operationId: string; readonly traceparent: string }>): Promise<WalkingSkeletonFormSubmissionReceipt> }>;
  readonly validateMutation: (input: Readonly<{ readonly credential: string; readonly csrfToken?: string; readonly origin?: string; readonly referer?: string }>) => Promise<void>;
}

function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function parse(request: WalkingSkeletonFormSubmissionHttpRequest): Readonly<{ readonly data: Readonly<{ readonly content_version_id: string; readonly file_id: string; readonly synthetic_value: string }>; readonly fileReference: FileReference }> {
  if (request.contentType === undefined || !JSON_TYPE.test(request.contentType) || request.body === undefined) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
  const bytes = typeof request.body === "string" ? new TextEncoder().encode(request.body) : request.body;
  if (bytes.byteLength > MAX_BODY_BYTES) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new WalkingSkeletonFormSubmissionError("submission_invalid"); }
  if (!object(value) || Object.keys(value).sort().join(",") !== "data,fileReference,version" || value["version"] !== 1 || !object(value["data"]) || !object(value["fileReference"])) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
  const data = value["data"];
  const file = value["fileReference"];
  if (Object.keys(data).sort().join(",") !== "content_version_id,file_id,synthetic_value" || typeof data["content_version_id"] !== "string" || typeof data["file_id"] !== "string" || typeof data["synthetic_value"] !== "string" ||
    Object.keys(file).some((key) => !["contentVersionId", "displayName", "fileId", "mediaType", "sizeBytes", "version"].includes(key)) || typeof file["contentVersionId"] !== "string" || typeof file["fileId"] !== "string" || typeof file["displayName"] !== "string" || file["version"] !== 1) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
  if ((file["mediaType"] !== undefined && typeof file["mediaType"] !== "string") ||
    (file["sizeBytes"] !== undefined && typeof file["sizeBytes"] !== "number")) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
  return Object.freeze({
    data: Object.freeze({ content_version_id: data["content_version_id"], file_id: data["file_id"], synthetic_value: data["synthetic_value"] }),
    fileReference: Object.freeze({ contentVersionId: file["contentVersionId"], displayName: file["displayName"], fileId: file["fileId"], ...(typeof file["mediaType"] === "string" ? { mediaType: file["mediaType"] } : {}), ...(typeof file["sizeBytes"] === "number" ? { sizeBytes: file["sizeBytes"] } : {}), version: 1 }),
  });
}

function response(status: number, body: unknown): Readonly<WalkingSkeletonFormSubmissionHttpResponse> {
  return Object.freeze({ body, headers: Object.freeze({ "Cache-Control": "no-store", "Content-Type": "application/json" }), status });
}

function failure(error: unknown): Readonly<WalkingSkeletonFormSubmissionHttpResponse> {
  if (error instanceof WalkingSkeletonFormSubmissionError) {
    const status = error.code === "submission_denied" ? 403 : error.code === "submission_conflict" ? 409 : error.code === "submission_invalid" ? 422 : 503;
    return response(status, Object.freeze({ code: error.code, retryable: error.retryable }));
  }
  const code = typeof error === "object" && error !== null ? String(Reflect.get(error, "code") ?? "") : "";
  if (code === "authentication_csrf_rejected") return response(403, Object.freeze({ code }));
  if (code === "authentication_session_invalid" || code === "authentication_refresh_rejected") return response(401, Object.freeze({ code: "authentication_required" }));
  return response(503, Object.freeze({ code: "submission_dependency_unavailable", retryable: true }));
}

export function createWalkingSkeletonFormSubmissionHttpAdapter(options: WalkingSkeletonFormSubmissionHttpAdapterOptions): WalkingSkeletonFormSubmissionHttpAdapter {
  return Object.freeze({
    async handle(request: WalkingSkeletonFormSubmissionHttpRequest) {
      if (request.method !== "POST") return response(405, Object.freeze({ code: "submission_method_not_allowed" }));
      if (request.credential === undefined || request.credential.length === 0) return response(401, Object.freeze({ code: "authentication_required" }));
      if (request.idempotencyKey === undefined || !UUID.test(request.idempotencyKey) || request.traceparent === undefined) return response(400, Object.freeze({ code: "submission_request_invalid" }));
      try {
        const body = parse(request);
        await options.validateMutation({ credential: request.credential, ...(request.csrfToken === undefined ? {} : { csrfToken: request.csrfToken }), ...(request.origin === undefined ? {} : { origin: request.origin }), ...(request.referer === undefined ? {} : { referer: request.referer }) });
        const context = await options.resolveContext({ credential: request.credential, traceparent: request.traceparent });
        const result = await options.service.submit({ ...body, context, operationId: request.idempotencyKey, traceparent: request.traceparent });
        return response(result.replayed ? 200 : 201, result);
      } catch (error) { return failure(error); }
    },
  });
}
