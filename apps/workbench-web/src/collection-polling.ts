import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { BootstrapResult, PlatformCollection, PlatformItem, WorkbenchPort } from "./workbench-port";

type ReadyCollections = Extract<BootstrapResult, { kind: "ready" }>["collections"];
type RealtimeCollections = Readonly<{ notifications: PlatformCollection; tasks: PlatformCollection }>;

export const collectionPollingIntervalMs = 30_000;
export const realtimeFallbackDelayMs = 15_000;
export const sessionLivenessIntervalMs = 5_000;
const realtimeProtocol = "ai-crm.realtime.v1";

interface NotificationRealtimeMessage {
  readonly type: "notification.upsert";
  readonly messageId: string;
  readonly notificationId: string;
  readonly stateVersion: number;
  readonly title: string;
  readonly summary: string;
  readonly bodyMarkdown: string;
  readonly bodyFormat: "plain-text" | "restricted-markdown";
  readonly createdAt: string;
  readonly readAt?: string;
  readonly archivedAt?: string;
  readonly deepLink: NonNullable<PlatformItem["deepLink"]>;
  readonly unread: { readonly count?: number; readonly resyncRequired?: true };
}

interface TaskRealtimeMessage {
  readonly type: "task.upsert";
  readonly messageId: string;
  readonly taskId: string;
  readonly stateVersion: number;
  readonly title: string;
  readonly summary: string;
  readonly status: "cancelled" | "completed" | "open";
}

type RealtimeMessage = NotificationRealtimeMessage | TaskRealtimeMessage | { readonly type: "collection.resync-required" | "connection.ready" | "realtime.error" | "session.revoked"; readonly messageId: string };

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
}

function parseMessage(value: string): RealtimeMessage | undefined {
  if (new TextEncoder().encode(value).byteLength > 32 * 1024) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { return undefined; }
  const input = record(parsed);
  if (input === undefined || typeof input["type"] !== "string" || typeof input["messageId"] !== "string") return undefined;
  if (["collection.resync-required", "connection.ready", "realtime.error", "session.revoked"].includes(input["type"])) return input as unknown as RealtimeMessage;
  if (input["type"] === "task.upsert" && typeof input["taskId"] === "string" && typeof input["stateVersion"] === "number" && typeof input["title"] === "string" && typeof input["summary"] === "string" && ["cancelled", "completed", "open"].includes(String(input["status"]))) return input as unknown as TaskRealtimeMessage;
  if (input["type"] === "notification.upsert" && typeof input["notificationId"] === "string" && typeof input["stateVersion"] === "number" && typeof input["title"] === "string" && typeof input["summary"] === "string" && typeof input["bodyMarkdown"] === "string" && record(input["deepLink"]) !== undefined && record(input["unread"]) !== undefined) return input as unknown as NotificationRealtimeMessage;
  return undefined;
}

function upsert(collection: PlatformCollection, item: PlatformItem): PlatformCollection {
  const existing = collection.items.find((candidate) => candidate.id === item.id);
  if ((existing?.stateVersion ?? 0) >= (item.stateVersion ?? 0)) return collection;
  return { ...collection, items: [item, ...collection.items.filter((candidate) => candidate.id !== item.id)] };
}

export function usePolledCollections(
  port: WorkbenchPort,
  initial: ReadyCollections,
  sessionScope: string,
  options?: { readonly initialUnreadCount?: number; readonly onNotification?: (item: PlatformItem) => void; readonly onSessionRevoked?: () => void },
): ReadyCollections & { readonly collections: ReadyCollections; readonly unreadCount: number } {
  const queryClient = useQueryClient();
  const [fallback, setFallback] = useState(false);
  const [unreadCount, setUnreadCount] = useState(options?.initialUnreadCount ?? initial.notifications.items.filter((item) => item.status === "未读").length);
  const seenMessages = useRef(new Set<string>());
  const polling = useQuery({
    enabled: fallback && port.pollCollections !== undefined,
    initialData: { notifications: initial.notifications, tasks: initial.tasks },
    queryFn: async (): Promise<RealtimeCollections> => port.pollCollections?.() ?? { notifications: initial.notifications, tasks: initial.tasks },
    queryKey: ["workbench-collections", sessionScope],
    refetchInterval: fallback ? collectionPollingIntervalMs : false,
    retry: false,
  });
  const refetch = polling.refetch;

  useEffect(() => {
    if (port.pollCollections === undefined || typeof globalThis.WebSocket !== "function") { setFallback(true); return; }
    let stopped = false;
    let socket: WebSocket | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const queryKey = ["workbench-collections", sessionScope] as const;
    const scheduleFallback = (): void => {
      if (fallbackTimer !== undefined) return;
      fallbackTimer = setTimeout(() => { setFallback(true); }, realtimeFallbackDelayMs);
    };
    const connect = (): void => {
      if (stopped) return;
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${scheme}//${window.location.host}/realtime`, realtimeProtocol);
      socket.addEventListener("open", () => { attempt = 0; setFallback(false); if (fallbackTimer !== undefined) clearTimeout(fallbackTimer); fallbackTimer = undefined; });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") { socket?.close(1003, "json-text-required"); return; }
        const message = parseMessage(event.data);
        if (message === undefined) { socket?.close(1007, "invalid-message"); return; }
        if (seenMessages.current.has(message.messageId)) return;
        seenMessages.current.add(message.messageId);
        if (seenMessages.current.size > 1_000) seenMessages.current.delete(seenMessages.current.values().next().value as string);
        if (message.type === "collection.resync-required") { void refetch(); return; }
        if (message.type === "session.revoked") { options?.onSessionRevoked?.(); return; }
        if (message.type === "notification.upsert") {
          const item: PlatformItem = { id: message.notificationId, title: message.title, summary: message.summary, status: message.archivedAt === undefined ? message.readAt === undefined ? "未读" : "已读" : "已归档", tab: message.archivedAt === undefined ? "active" : "history", stateVersion: message.stateVersion, bodyMarkdown: message.bodyMarkdown, bodyFormat: message.bodyFormat, createdAt: message.createdAt, deepLink: message.deepLink };
          queryClient.setQueryData<RealtimeCollections>(queryKey, (current) => current === undefined ? current : { ...current, notifications: upsert(current.notifications, item) });
          if (message.unread.count !== undefined) setUnreadCount(message.unread.count); else if (message.unread.resyncRequired) void refetch();
          if (document.visibilityState === "visible") options?.onNotification?.(item);
          return;
        }
        if (message.type === "task.upsert") {
          const item: PlatformItem = { id: message.taskId, title: message.title, summary: message.summary, status: message.status === "open" ? "待处理" : message.status === "completed" ? "已完成" : "已取消", tab: message.status === "open" ? "active" : "history", stateVersion: message.stateVersion };
          queryClient.setQueryData<RealtimeCollections>(queryKey, (current) => current === undefined ? current : { ...current, tasks: upsert(current.tasks, item) });
        }
      });
      socket.addEventListener("close", () => {
        if (stopped) return;
        scheduleFallback();
        const seconds = Math.min(30, 2 ** Math.min(attempt, 4));
        attempt += 1;
        const jitter = Math.floor(Math.random() * 250);
        reconnectTimer = setTimeout(() => { void refetch().finally(connect); }, seconds * 1_000 + jitter);
      });
      socket.addEventListener("error", () => { socket?.close(); });
    };
    void refetch().finally(connect);
    return () => { stopped = true; if (fallbackTimer !== undefined) clearTimeout(fallbackTimer); if (reconnectTimer !== undefined) clearTimeout(reconnectTimer); socket?.close(1000, "component-unmounted"); };
  }, [options, port, queryClient, refetch, sessionScope]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isStopped = (): boolean => stopped;
    const schedule = (): void => {
      if (!stopped) timer = setTimeout(() => { void check(); }, sessionLivenessIntervalMs);
    };
    const check = async (): Promise<void> => {
      if (stopped) return;
      try {
        const response = await fetch("/auth/pc/session", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          method: "GET",
        });
        if (isStopped()) return;
        if (response.status === 401) {
          queryClient.clear();
          options?.onSessionRevoked?.();
          return;
        }
      } catch {
        // Network and dependency failures are retried; only an explicit 401 ends the session.
      }
      if (isStopped()) return;
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [options, queryClient, sessionScope]);

  const collections = { ...initial, notifications: polling.data.notifications, tasks: polling.data.tasks };
  return { ...collections, collections, unreadCount };
}
