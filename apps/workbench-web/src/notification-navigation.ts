import type { PlatformItem } from "./workbench-port";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function value(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("notification_navigation_invalid");
  return value as Readonly<Record<string, unknown>>;
}

const crmRoutePaths: Readonly<Record<string, string>> = Object.freeze({
  "crm.tasks": "/crm/tasks/:resourceReference",
  "crm.notifications": "/crm/notifications/:resourceReference",
  "crm.forms": "/crm/forms/:resourceReference",
  "crm.files": "/crm/files/:resourceReference",
});

export function resolveNotificationPath(item: PlatformItem): Promise<string> {
  if (item.deepLink === undefined) throw new Error("notification_navigation_missing");
  const path = crmRoutePaths[item.deepLink.routeId];
  if (path === undefined) throw new Error("notification_navigation_missing");
  return Promise.resolve(path.replace(":resourceReference", encodeURIComponent(item.deepLink.resourceId)));
}

export async function markNotificationRead(notificationId: string, fetchPort: FetchPort = globalThis.fetch): Promise<void> {
  const sessionResponse = await fetchPort("/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" }, method: "GET" });
  if (!sessionResponse.ok) throw new Error("notification_read_session_unavailable");
  const session = value(await sessionResponse.json());
  if (typeof session["csrfToken"] !== "string" || session["csrfToken"].length < 32) throw new Error("notification_read_session_invalid");
  const response = await fetchPort(`/notifications/${encodeURIComponent(notificationId)}/read`, { credentials: "same-origin", headers: { Accept: "application/json", "X-CSRF-Token": session["csrfToken"] }, method: "POST" });
  if (!response.ok) throw new Error("notification_read_failed");
}
