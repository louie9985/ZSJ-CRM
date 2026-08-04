import { pcLoginUrl } from "./auth-routes";
import type { BootstrapResult, PlatformCollection, WorkbenchPort } from "./workbench-port";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type LocationPort = Pick<Location, "assign">;

function record(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(code);
  return value as Readonly<Record<string, unknown>>;
}

function boundedText(value: unknown, code: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\0\r\n]/u.test(value)) throw new Error(code);
  return value;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function emptyCollection(title: string): PlatformCollection {
  return { fixture: false, items: [], statuses: [], title };
}

function parseReady(value: unknown): Extract<BootstrapResult, { kind: "ready" }> {
  const body = record(value, "workbench_bootstrap_invalid");
  if (body["kind"] !== "ready" || body["fixture"] !== false) throw new Error("workbench_bootstrap_invalid");
  const context = record(body["context"], "workbench_context_invalid");
  const accountKind = context["accountKind"];
  if (accountKind !== "system_administrator" && accountKind !== "workforce") throw new Error("workbench_context_invalid");
  const assignmentReference = context["assignmentReference"] === undefined ? undefined : boundedText(context["assignmentReference"], "workbench_assignment_invalid", 64);
  const navigationIds = body["navigationIds"];
  if (!Array.isArray(navigationIds) || navigationIds.length > 128 || navigationIds.some((item) => typeof item !== "string" || !/^[a-z][a-z0-9_.-]{0,127}$/u.test(item)) || new Set(navigationIds).size !== navigationIds.length) throw new Error("workbench_navigation_invalid");
  const safeNavigationIds: string[] = [];
  for (const item of navigationIds) if (typeof item === "string") safeNavigationIds.push(item);
  const applicationIds = body["applicationIds"];
  if (applicationIds !== undefined && (!Array.isArray(applicationIds) || applicationIds.length > 32 || applicationIds.some((item) => typeof item !== "string" || !/^[a-z][a-z0-9_.-]{0,127}$/u.test(item)) || new Set(applicationIds).size !== applicationIds.length)) throw new Error("workbench_application_ids_invalid");
  const safeApplicationIds: string[] = [];
  if (Array.isArray(applicationIds)) for (const item of applicationIds) if (typeof item === "string") safeApplicationIds.push(item);
  const workspaceProfileId = body["workspaceProfileId"];
  if (workspaceProfileId !== undefined && (typeof workspaceProfileId !== "string" || !/^[a-z][a-z0-9_.-]{0,127}$/u.test(workspaceProfileId))) throw new Error("workbench_workspace_profile_invalid");
  const counts = record(body["counts"], "workbench_counts_invalid");
  return Object.freeze({
    kind: "ready",
    ...(applicationIds === undefined ? {} : { applicationIds: Object.freeze(safeApplicationIds) }),
    fixture: false,
    context: Object.freeze({
      accountKind,
      displayName: boundedText(context["displayName"], "workbench_display_name_invalid", 64),
      sessionScope: boundedText(context["sessionScope"], "workbench_session_scope_invalid", 128),
      ...(assignmentReference === undefined ? {} : { assignmentReference }),
    }),
    counts: Object.freeze({ files: count(counts["files"]), forms: count(counts["forms"]), notifications: count(counts["notifications"]), tasks: count(counts["tasks"]) }),
    collections: Object.freeze({ files: emptyCollection("文件"), forms: emptyCollection("表单"), notifications: emptyCollection("通知"), tasks: emptyCollection("任务") }),
    navigationIds: Object.freeze(safeNavigationIds),
    ...(typeof workspaceProfileId === "string" ? { workspaceProfileId } : {}),
  });
}

async function responseBody(response: Response, code: string): Promise<unknown> {
  try { return await response.json(); } catch { throw new Error(code); }
}

export function createSameSiteWorkbenchPort(
  fetchPort: FetchPort = globalThis.fetch,
  locationPort: LocationPort = globalThis.location,
): Pick<WorkbenchPort, "beginLogin" | "bootstrap" | "logout"> {
  return Object.freeze({
    beginLogin(returnTo: string): void {
      locationPort.assign(pcLoginUrl(returnTo));
    },
    async bootstrap(): Promise<BootstrapResult> {
      const response = await fetchPort("/workbench/bootstrap", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (response.status === 401) return { kind: "signed-out" };
      if (response.status === 403) return { kind: "forbidden" };
      if (response.status === 503) return { kind: "maintenance" };
      if (!response.ok) throw new Error(`workbench_bootstrap_${String(response.status)}`);
      return parseReady(await responseBody(response, "workbench_bootstrap_invalid"));
    },
    async logout(): Promise<{ kind: "logged-out" | "session-expired" }> {
      const sessionResponse = await fetchPort("/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (sessionResponse.status === 401) return { kind: "logged-out" };
      if (!sessionResponse.ok) throw new Error("workbench_logout_session_unavailable");
      const session = record(await responseBody(sessionResponse, "workbench_logout_session_invalid"), "workbench_logout_session_invalid");
      const csrfToken = boundedText(session["csrfToken"], "workbench_logout_session_invalid", 512);
      const response = await fetchPort("/auth/pc/logout", { credentials: "same-origin", headers: { Accept: "application/json", "X-CSRF-Token": csrfToken }, method: "POST" });
      if (response.status === 401) return { kind: "session-expired" };
      if (response.status === 204) return { kind: "logged-out" };
      if (response.status === 200) {
        const body = record(await responseBody(response, "workbench_logout_response_invalid"), "workbench_logout_response_invalid");
        const redirectUrl = boundedText(body["redirectUrl"], "workbench_logout_response_invalid", 4096);
        let parsedRedirect: URL;
        try { parsedRedirect = new URL(redirectUrl); } catch { throw new Error("workbench_logout_response_invalid"); }
        if (parsedRedirect.protocol !== "https:" && parsedRedirect.protocol !== "http:") throw new Error("workbench_logout_response_invalid");
        locationPort.assign(parsedRedirect.href);
        return { kind: "logged-out" };
      }
      throw new Error(`workbench_logout_${String(response.status)}`);
    },
  });
}
