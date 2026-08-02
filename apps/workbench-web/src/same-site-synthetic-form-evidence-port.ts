import type {
  SyntheticFormEvidencePort,
  SyntheticFormEvidenceReceipt,
  SyntheticFormEvidenceRelease,
  SyntheticFormEvidenceSubmission,
  SyntheticFormFileReference,
} from "./synthetic-form-evidence-page";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/u;

function parseFileReference(value: string | undefined): SyntheticFormFileReference | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    return Object.freeze({ ...(parsed as SyntheticFormFileReference) });
  } catch {
    return undefined;
  }
}

async function body<T>(response: Response, code: string): Promise<T> {
  if (!response.ok) throw new Error(`${code}_${String(response.status)}`);
  return await response.json() as T;
}

export function createSameSiteSyntheticFormEvidencePort(
  options: Readonly<{ fileReferenceJson?: string; traceparent?: string }>,
  fetchPort: FetchPort = globalThis.fetch,
): (SyntheticFormEvidencePort & {
  readonly fileReference: SyntheticFormFileReference;
  loadRelease(): Promise<SyntheticFormEvidenceRelease>;
}) | undefined {
  const fileReference = parseFileReference(options.fileReferenceJson);
  if (fileReference === undefined || options.traceparent === undefined || !TRACEPARENT.test(options.traceparent)) return undefined;
  const traceparent = options.traceparent;
  const operationId = globalThis.crypto.randomUUID();
  return Object.freeze({
    fileReference,
    async loadRelease(): Promise<SyntheticFormEvidenceRelease> {
      const response = await fetchPort("/form-definitions/platform.synthetic.task-completion/releases/1", {
        credentials: "same-origin",
        headers: { Accept: "application/json", traceparent },
      });
      return body<SyntheticFormEvidenceRelease>(response, "synthetic_form_release_unavailable");
    },
    async submit(input: SyntheticFormEvidenceSubmission): Promise<SyntheticFormEvidenceReceipt> {
      const session = await body<{ readonly csrfToken?: unknown }>(await fetchPort("/auth/pc/session", {
        credentials: "same-origin",
        headers: { Accept: "application/json", traceparent },
      }), "synthetic_form_session_unavailable");
      if (typeof session.csrfToken !== "string" || session.csrfToken.length < 32) throw new Error("synthetic_form_session_invalid");
      const response = await fetchPort("/__e2e/walking-skeleton/form-submissions", {
        body: JSON.stringify({ data: input.data, fileReference: input.fileReference, version: 1 }),
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationId,
          "X-CSRF-Token": session.csrfToken,
          traceparent,
        },
        method: "POST",
      });
      return body<SyntheticFormEvidenceReceipt>(response, "synthetic_form_submission_unavailable");
    },
  });
}
