import type { PlatformCollection, PlatformItem } from "./workbench-port";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PolledCollections = Readonly<{ notifications: PlatformCollection; tasks: PlatformCollection }>;

const stableReference = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u;
const taskStatuses = new Set(["cancelled", "completed", "open"]);

function object(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(code);
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, code: string, maximum = 8_000): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw new Error(code);
  return value;
}

function reference(value: unknown, code: string): string {
  const result = text(value, code, 255);
  if (!stableReference.test(result)) throw new Error(code);
  return result;
}

function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(code);
  return value;
}

function items(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error(code);
  return value;
}

async function page(fetchPort: FetchPort, path: string, code: string): Promise<Readonly<Record<string, unknown>>> {
  const response = await fetchPort(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    method: "GET",
  });
  if (!response.ok) throw new Error(`${code}_${String(response.status)}`);
  return object(await response.json(), `${code}_invalid`);
}

function taskItem(value: unknown): PlatformItem {
  const task = object(value, "workbench_task_invalid");
  const sourceType = reference(task["sourceType"], "workbench_task_source_invalid");
  const sourceTaskId = reference(task["sourceTaskId"], "workbench_task_source_invalid");
  const sourceVersion = positiveInteger(task["sourceVersion"], "workbench_task_version_invalid");
  const status = text(task["status"], "workbench_task_status_invalid", 16);
  if (!taskStatuses.has(status)) throw new Error("workbench_task_status_invalid");
  return {
    id: sourceTaskId,
    status: status === "open" ? "待处理" : status === "completed" ? "已完成" : "已取消",
    summary: `来源 ${sourceType} · 版本 ${String(sourceVersion)}`,
    tab: status === "open" ? "active" : "history",
    title: sourceTaskId,
  };
}

function notificationItem(value: unknown): PlatformItem {
  const notification = object(value, "workbench_notification_invalid");
  const notificationId = text(notification["notificationId"], "workbench_notification_id_invalid", 64);
  const sourceType = reference(notification["sourceType"], "workbench_notification_source_invalid");
  const sourceId = reference(notification["sourceId"], "workbench_notification_source_invalid");
  const archived = typeof notification["archivedAt"] === "string";
  const read = typeof notification["readAt"] === "string";
  const summary = typeof notification["summary"] === "string" ? text(notification["summary"], "workbench_notification_summary_invalid", 2_000) : `来源 ${sourceType}:${sourceId}`;
  const stateVersion = typeof notification["stateVersion"] === "number" ? positiveInteger(notification["stateVersion"], "workbench_notification_version_invalid") : 1;
  const deepLinkValue = notification["deepLink"];
  const deepLink = typeof deepLinkValue === "object" && deepLinkValue !== null && !Array.isArray(deepLinkValue) ? object(deepLinkValue, "workbench_notification_deep_link_invalid") : undefined;
  return {
    id: notificationId,
    status: archived ? "已归档" : read ? "已读" : "未读",
    summary,
    tab: archived ? "history" : "active",
    title: text(notification["title"], "workbench_notification_title_invalid", 512),
    stateVersion,
    ...(typeof notification["body"] === "string" ? { bodyMarkdown: text(notification["body"], "workbench_notification_body_invalid", 8_000) } : {}),
    ...(notification["bodyFormat"] === "plain-text" || notification["bodyFormat"] === "restricted-markdown" ? { bodyFormat: notification["bodyFormat"] } : {}),
    ...(typeof notification["createdAt"] === "string" ? { createdAt: notification["createdAt"] } : {}),
    ...(deepLink === undefined ? {} : { deepLink: {
      routeId: reference(deepLink["routeId"], "workbench_notification_deep_link_invalid"),
      resourceType: reference(deepLink["resourceType"], "workbench_notification_deep_link_invalid"),
      resourceId: reference(deepLink["resourceId"], "workbench_notification_deep_link_invalid"),
    } }),
  };
}

export function createSameSiteCollectionPollingPort(fetchPort: FetchPort = globalThis.fetch): Readonly<{
  pollCollections(): Promise<PolledCollections>;
}> {
  return Object.freeze({
    async pollCollections(): Promise<PolledCollections> {
      const [taskPage, notificationPage] = await Promise.all([
        page(fetchPort, "/tasks?limit=50", "workbench_tasks_unavailable"),
        page(fetchPort, "/notifications?limit=50", "workbench_notifications_unavailable"),
      ]);
      const tasks = items(taskPage["items"], "workbench_task_page_invalid").map(taskItem);
      const notifications = items(notificationPage["items"], "workbench_notification_page_invalid").map(notificationItem);
      return Object.freeze({
        notifications: Object.freeze({ fixture: false, items: notifications, statuses: ["全部", "未读", "已读", "已归档"], title: "通知" }),
        tasks: Object.freeze({ fixture: false, items: tasks, statuses: ["全部", "待处理", "已完成", "已取消"], title: "任务" }),
      });
    },
  });
}
