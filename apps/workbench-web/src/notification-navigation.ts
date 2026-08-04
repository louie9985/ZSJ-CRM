import type { PlatformItem } from "./workbench-port";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function value(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("notification_navigation_invalid");
  return value as Readonly<Record<string, unknown>>;
}

export async function resolveNotificationPath(item: PlatformItem, fetchPort: FetchPort = globalThis.fetch): Promise<string> {
  if (item.deepLink === undefined) throw new Error("notification_navigation_missing");
  const response = await fetchPort("/application-registry/deep-links/resolve", {
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify({ version: 1, source: "notification", applicationId: item.deepLink.applicationId, routeId: item.deepLink.routeId, resourceReference: item.deepLink.resourceId }),
  });
  if (!response.ok) throw new Error(response.status === 403 ? "notification_navigation_denied" : response.status === 404 ? "notification_navigation_missing" : "notification_navigation_unavailable");
  const result = value(await response.json());
  if (typeof result["path"] !== "string" || !result["path"].startsWith("/") || typeof result["resourceReference"] !== "string") throw new Error("notification_navigation_invalid");
  return result["path"].replace(":resourceReference", encodeURIComponent(result["resourceReference"]));
}

export async function markNotificationRead(notificationId: string, fetchPort: FetchPort = globalThis.fetch): Promise<void> {
  const sessionResponse = await fetchPort("/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" }, method: "GET" });
  if (!sessionResponse.ok) throw new Error("notification_read_session_unavailable");
  const session = value(await sessionResponse.json());
  if (typeof session["csrfToken"] !== "string" || session["csrfToken"].length < 32) throw new Error("notification_read_session_invalid");
  const response = await fetchPort(`/notifications/${encodeURIComponent(notificationId)}/read`, { credentials: "same-origin", headers: { Accept: "application/json", "X-CSRF-Token": session["csrfToken"] }, method: "POST" });
  if (!response.ok) throw new Error("notification_read_failed");
}
