import type { PartTimeBootstrapResult, PartTimePort } from "./workbench-port";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("part_time_session_invalid");
  return value as Readonly<Record<string, unknown>>;
}

export function createSameSitePartTimePort(fetchPort: FetchPort = globalThis.fetch): PartTimePort {
  return Object.freeze({
    async login(identifier: string, password: string) {
      const response = await fetchPort("/auth/part-time/login", { body: JSON.stringify({ identifier, password }), credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, method: "POST" });
      if (response.status === 401) return "invalid";
      if (response.status === 403) return "security-rejected";
      if (response.status === 429) return "rate-limited";
      if (response.status === 503) return "unavailable";
      if (response.status !== 200) throw new Error(`part_time_login_${String(response.status)}`);
      return "authenticated";
    },
    async bootstrap(): Promise<PartTimeBootstrapResult> {
      const response = await fetchPort("/auth/part-time/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (response.status === 401) return { kind: "logged-out" };
      if (response.status === 503) throw new Error("part_time_unavailable");
      if (!response.ok) throw new Error(`part_time_session_${String(response.status)}`);
      const body = record(await response.json());
      return { kind: "ready", displayName: typeof body["displayName"] === "string" ? body["displayName"] : "兼职用户" };
    },
    async logout() {
      const sessionResponse = await fetchPort("/auth/part-time/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
      const headers: HeadersInit = { Accept: "application/json" };
      if (sessionResponse.ok) {
        const session = record(await sessionResponse.json());
        if (typeof session["csrfToken"] === "string") headers["X-CSRF-Token"] = session["csrfToken"];
      }
      const response = await fetchPort("/auth/part-time/logout", { credentials: "same-origin", headers, method: "POST" });
      if (response.status === 204) return { kind: "logged-out" as const };
      if (response.status === 401) return { kind: "session-expired" as const };
      throw new Error(`part_time_logout_${String(response.status)}`);
    },
  });
}
