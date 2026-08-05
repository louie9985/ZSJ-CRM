import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import WebSocket, { WebSocketServer } from "ws";

export const REALTIME_PATH = "/realtime";
export const REALTIME_PROTOCOL = "ai-crm.realtime.v1";
export const REALTIME_MAX_FRAME_BYTES = 32 * 1024;
const MAX_BUFFERED_BYTES = 256 * 1024;

export interface RealtimeIdentity {
  readonly activeAssignmentIds: readonly string[];
  readonly principalId: string;
  readonly selectedAssignmentId?: string;
  readonly sessionReference: string;
  readonly workforcePersonId: string;
}

export type RealtimeReferenceEvent =
  | { readonly kind: "notification"; readonly eventId: string; readonly notificationId: string; readonly occurredAt: string; readonly principalId: string; readonly stateVersion: number }
  | { readonly kind: "session-revoked"; readonly eventId: string; readonly occurredAt: string; readonly principalId: string; readonly reason: "administrator" | "concurrent-limit" | "identity-invalid" | "policy-changed"; readonly sessionReference: string }
  | { readonly kind: "task"; readonly assignmentId?: string; readonly eventId: string; readonly occurredAt: string; readonly principalId?: string; readonly stateVersion: number; readonly taskId: string };

export interface RealtimeEventSource {
  subscribe(handler: (event: RealtimeReferenceEvent) => void | Promise<void>): () => void;
}

export interface RealtimeSnapshotReader {
  notification(identity: RealtimeIdentity, notificationId: string): Promise<Readonly<Record<string, unknown>> | undefined>;
  task(identity: RealtimeIdentity, taskId: string): Promise<Readonly<Record<string, unknown>> | undefined>;
}

export interface RealtimeServer {
  attach(server: HttpServer): void;
  close(): Promise<void>;
  health(): { readonly activeConnections: number; readonly status: "disabled" | "ok" };
}

interface ConnectionState {
  alive: boolean;
  readonly credential: string;
  readonly identity: RealtimeIdentity;
  lastPingAt: number;
  lastRevalidatedAt: number;
  revalidating: boolean;
  readonly versions: Map<string, number>;
  readonly websocket: WebSocket;
}

function rejectUpgrade(socket: Duplex, status: 400 | 401 | 403 | 404 | 426 | 429 | 503): void {
  if (!socket.destroyed) socket.end(`HTTP/1.1 ${String(status)} ${status === 426 ? "Upgrade Required" : "Rejected"}\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`);
}

function encoded(value: unknown): string | undefined {
  const result = JSON.stringify(value);
  return Buffer.byteLength(result, "utf8") <= REALTIME_MAX_FRAME_BYTES ? result : undefined;
}

export function createRealtimeServer(options: {
  readonly allowedOrigins: readonly string[];
  readonly authenticate: (input: { readonly credential: string; readonly origin: string }) => Promise<RealtimeIdentity>;
  readonly credentialFromCookie: (cookie: string | undefined) => string | undefined;
  readonly enabled: boolean;
  readonly events: RealtimeEventSource;
  readonly maxConnectionsPerSession?: number;
  readonly now?: () => Date;
  readonly revalidationIntervalMs?: number;
  readonly revalidate: (input: { readonly credential: string; readonly identity: RealtimeIdentity }) => Promise<boolean>;
  readonly snapshots: RealtimeSnapshotReader;
}): RealtimeServer {
  const now = options.now ?? (() => new Date());
  const maximumPerSession = options.maxConnectionsPerSession ?? 8;
  const revalidationIntervalMs = options.revalidationIntervalMs ?? 5_000;
  if (!Number.isSafeInteger(maximumPerSession) || maximumPerSession < 1 || maximumPerSession > 32) throw new Error("realtime_session_connection_limit_invalid");
  if (!Number.isSafeInteger(revalidationIntervalMs) || revalidationIntervalMs < 1_000 || revalidationIntervalMs > 60_000) throw new Error("realtime_revalidation_interval_invalid");
  const server = new WebSocketServer({ clientTracking: false, maxPayload: REALTIME_MAX_FRAME_BYTES, noServer: true, perMessageDeflate: false });
  const connections = new Set<ConnectionState>();
  const bySession = new Map<string, Set<ConnectionState>>();
  let attached: HttpServer | undefined;
  let closed = false;

  const send = (state: ConnectionState, message: unknown): boolean => {
    if (state.websocket.readyState !== WebSocket.OPEN) return false;
    if (state.websocket.bufferedAmount > MAX_BUFFERED_BYTES) {
      const resync = encoded({ type: "collection.resync-required", messageId: randomUUID(), occurredAt: now().toISOString(), collections: ["tasks", "notifications", "unread-count"], reason: "slow-client" });
      if (resync !== undefined && state.websocket.bufferedAmount + Buffer.byteLength(resync, "utf8") <= MAX_BUFFERED_BYTES) state.websocket.send(resync);
      state.websocket.close(1013, "resync-required");
      return false;
    }
    const payload = encoded(message);
    if (payload === undefined) {
      const resync = encoded({ type: "collection.resync-required", messageId: randomUUID(), occurredAt: now().toISOString(), collections: ["tasks", "notifications", "unread-count"], reason: "consumer-error" });
      if (resync !== undefined) state.websocket.send(resync);
      return false;
    }
    state.websocket.send(payload);
    return true;
  };

  const remove = (state: ConnectionState): void => {
    connections.delete(state);
    const sessions = bySession.get(state.identity.sessionReference);
    sessions?.delete(state);
    if (sessions?.size === 0) bySession.delete(state.identity.sessionReference);
  };

  server.on("connection", (websocket: WebSocket, request: IncomingMessage, identity: RealtimeIdentity, credential: string) => {
    const state: ConnectionState = { alive: true, credential, identity, lastPingAt: 0, lastRevalidatedAt: Date.now(), revalidating: false, versions: new Map(), websocket };
    connections.add(state);
    const sessions = bySession.get(identity.sessionReference) ?? new Set<ConnectionState>();
    sessions.add(state);
    bySession.set(identity.sessionReference, sessions);
    websocket.on("pong", () => { state.alive = true; });
    websocket.on("message", () => { websocket.close(1008, "server-push-only"); });
    websocket.on("close", () => { remove(state); });
    websocket.on("error", () => { remove(state); });
    send(state, { type: "connection.ready", messageId: randomUUID(), occurredAt: now().toISOString(), connectionId: randomUUID(), protocol: REALTIME_PROTOCOL });
    void request;
  });

  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (!options.enabled || closed) { rejectUpgrade(socket, 503); return; }
    let path: string;
    try { path = new URL(request.url ?? "", "http://realtime.invalid").pathname; } catch { rejectUpgrade(socket, 404); return; }
    if (path !== REALTIME_PATH) return;
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !options.allowedOrigins.includes(origin)) { rejectUpgrade(socket, 403); return; }
    if (request.headers["sec-websocket-protocol"] !== REALTIME_PROTOCOL) { rejectUpgrade(socket, 426); return; }
    const credential = options.credentialFromCookie(request.headers.cookie);
    if (credential === undefined) { rejectUpgrade(socket, 401); return; }
    void options.authenticate({ credential, origin }).then((identity) => {
      if (closed || socket.destroyed) return;
      if ((bySession.get(identity.sessionReference)?.size ?? 0) >= maximumPerSession) { rejectUpgrade(socket, 429); return; }
      server.handleUpgrade(request, socket, head, (websocket) => server.emit("connection", websocket, request, identity, credential));
    }).catch(() => { rejectUpgrade(socket, 403); });
  };

  const unsubscribe = options.events.subscribe(async (event) => {
    const targets = [...connections].filter((state) => state.identity.principalId === event.principalId || (event.kind === "task" && event.assignmentId !== undefined && state.identity.activeAssignmentIds.includes(event.assignmentId)));
    await Promise.all(targets.map(async (state) => {
      if (!await options.revalidate({ credential: state.credential, identity: state.identity }).catch(() => false)) {
        send(state, { type: "session.revoked", messageId: event.eventId, occurredAt: event.occurredAt, reason: event.kind === "session-revoked" ? event.reason : "identity-invalid" });
        state.websocket.close(4001, "session-revoked");
        return;
      }
      if (event.kind === "session-revoked") {
        if (event.sessionReference === state.identity.sessionReference) {
          send(state, { type: "session.revoked", messageId: event.eventId, occurredAt: event.occurredAt, reason: event.reason });
          state.websocket.close(4001, "session-revoked");
        }
        return;
      }
      const versionKey = `${event.kind}:${event.kind === "task" ? event.taskId : event.notificationId}`;
      if ((state.versions.get(versionKey) ?? 0) >= event.stateVersion) return;
      try {
        const snapshot = event.kind === "task" ? await options.snapshots.task(state.identity, event.taskId) : await options.snapshots.notification(state.identity, event.notificationId);
        if (snapshot === undefined) return;
        if (send(state, { type: `${event.kind}.upsert`, messageId: event.eventId, occurredAt: event.occurredAt, ...snapshot })) state.versions.set(versionKey, event.stateVersion);
      } catch {
        send(state, { type: "collection.resync-required", messageId: randomUUID(), occurredAt: now().toISOString(), collections: event.kind === "task" ? ["tasks"] : ["notifications", "unread-count"], reason: "consumer-error" });
      }
    }));
  });

  const timer = setInterval(() => {
    const timestamp = Date.now();
    for (const state of connections) {
      if (!state.revalidating && timestamp - state.lastRevalidatedAt >= revalidationIntervalMs) {
        state.revalidating = true;
        void options.revalidate({ credential: state.credential, identity: state.identity }).then((valid) => {
          state.lastRevalidatedAt = Date.now();
          if (!valid && connections.has(state)) {
            send(state, { type: "session.revoked", messageId: randomUUID(), occurredAt: now().toISOString(), reason: "policy-changed" });
            state.websocket.close(4001, "session-revoked");
          }
        }).catch(() => {
          if (connections.has(state)) state.websocket.close(1013, "revalidation-unavailable");
        }).finally(() => { state.revalidating = false; });
      }
      if (state.lastPingAt > 0 && timestamp - state.lastPingAt >= 10_000 && !state.alive) {
        state.websocket.terminate();
        remove(state);
        continue;
      }
      if (state.lastPingAt === 0 || timestamp - state.lastPingAt >= 20_000) {
        state.alive = false;
        state.lastPingAt = timestamp;
        state.websocket.ping();
      }
    }
  }, Math.min(5_000, revalidationIntervalMs));
  timer.unref();

  return Object.freeze({
    attach(httpServer: HttpServer) {
      if (attached !== undefined && attached !== httpServer) throw new Error("realtime_server_already_attached");
      attached = httpServer;
      httpServer.on("upgrade", upgrade);
    },
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      unsubscribe();
      attached?.off("upgrade", upgrade);
      for (const state of connections) state.websocket.close(1001, "server-shutdown");
      connections.clear();
      bySession.clear();
      await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
    },
    health: () => ({ activeConnections: connections.size, status: options.enabled ? "ok" as const : "disabled" as const }),
  });
}
