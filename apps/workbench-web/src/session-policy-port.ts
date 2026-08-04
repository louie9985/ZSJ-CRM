export interface PcSessionPolicy {
  readonly concurrentLimit: number;
  readonly revocationTargetSeconds: number;
}

export interface SessionPolicyPort {
  get(): Promise<PcSessionPolicy>;
  update(policy: PcSessionPolicy): Promise<PcSessionPolicy>;
}

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`session_policy_request_failed_${String(response.status)}`);
  return await response.json() as T;
}

export function createSessionPolicyPort(fetchPort: FetchPort = globalThis.fetch): SessionPolicyPort {
  return Object.freeze({
    get: async () => json<PcSessionPolicy>(await fetchPort("/authentication/session-policy", { credentials: "same-origin", headers: { Accept: "application/json" } })),
    async update(policy: PcSessionPolicy) {
      const session = await json<{ readonly csrfToken?: unknown }>(await fetchPort("/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" } }));
      if (typeof session.csrfToken !== "string" || session.csrfToken.length < 32) throw new Error("session_policy_csrf_unavailable");
      return json<PcSessionPolicy>(await fetchPort("/authentication/session-policy", {
        body: JSON.stringify(policy),
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-CSRF-Token": session.csrfToken },
        method: "PUT",
      }));
    },
  });
}
