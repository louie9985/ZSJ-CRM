import { createServer, type Server } from "node:http";
import { once } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import {
  createRealtimeServer,
  REALTIME_PROTOCOL,
  type RealtimeEventSource,
  type RealtimeReferenceEvent,
  type RealtimeServer,
} from "./realtime-server.js";

class SyntheticEvents implements RealtimeEventSource {
  private handler: ((event: RealtimeReferenceEvent) => void | Promise<void>) | undefined;
  public subscribe(handler: (event: RealtimeReferenceEvent) => void | Promise<void>): () => void {
    this.handler = handler;
    return () => { this.handler = undefined; };
  }
  public async emit(event: RealtimeReferenceEvent): Promise<void> { await this.handler?.(event); }
}

const identity = Object.freeze({
  activeAssignmentIds: ["assignment.synthetic"],
  principalId: "principal.synthetic",
  sessionReference: "session.synthetic",
  workforcePersonId: "person.synthetic",
});

const opened: Array<{ http: Server; realtime: RealtimeServer; socket?: WebSocket }> = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(async ({ http, realtime, socket }) => {
    socket?.terminate();
    await realtime.close();
    await new Promise<void>((resolve) => { http.close(() => { resolve(); }); });
  }));
});

async function fixture(overrides: Partial<Parameters<typeof createRealtimeServer>[0]> = {}) {
  const events = new SyntheticEvents();
  const snapshots = {
    notification: vi.fn(() => Promise.resolve({ notificationId: "notification.synthetic", stateVersion: 2, title: "Synthetic" })),
    task: vi.fn(() => Promise.resolve({ taskId: "task.synthetic", stateVersion: 1, title: "Synthetic task" })),
  };
  const realtime = createRealtimeServer({
    allowedOrigins: ["https://workbench.example.test"],
    authenticate: vi.fn(() => Promise.resolve(identity)),
    credentialFromCookie: (cookie) => cookie === "session=valid" ? "valid" : undefined,
    enabled: true,
    events,
    revalidate: vi.fn(() => Promise.resolve(true)),
    snapshots,
    ...overrides,
  });
  const http = createServer((_request, response) => { response.writeHead(404).end(); });
  realtime.attach(http);
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  if (typeof address !== "object" || address === null) throw new Error("synthetic_server_address_missing");
  opened.push({ http, realtime });
  return { events, http, realtime, snapshots, url: `ws://127.0.0.1:${String(address.port)}/realtime` };
}

interface TestConnection { readonly socket: WebSocket; readonly next: () => Promise<Record<string, unknown>> }

async function connect(url: string): Promise<TestConnection> {
  const socket = new WebSocket(url, REALTIME_PROTOCOL, { headers: { Cookie: "session=valid", Origin: "https://workbench.example.test" } });
  const queued: Record<string, unknown>[] = [];
  const waiters: Array<(message: Record<string, unknown>) => void> = [];
  socket.on("message", (data) => {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : Buffer.from(data as ArrayBuffer).toString("utf8");
    const message = JSON.parse(text) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) waiter(message); else queued.push(message);
  });
  await once(socket, "open");
  const current = opened.at(-1);
  if (current) current.socket = socket;
  return { socket, next: () => {
    const message = queued.shift();
    return message ? Promise.resolve(message) : new Promise((resolve) => { waiters.push(resolve); });
  } };
}

describe("Workbench realtime server", () => {
  it("rejects an origin outside the PC BFF allowlist before authentication", async () => {
    const authenticate = vi.fn(() => Promise.resolve(identity));
    const { url } = await fixture({ authenticate });
    const socket = new WebSocket(url, REALTIME_PROTOCOL, { headers: { Cookie: "session=valid", Origin: "https://attacker.example.test" } });
    socket.on("error", () => undefined);
    const result = await once(socket, "unexpected-response") as [unknown, { destroy?: () => void; statusCode?: number }];
    const response = result[1];
    expect(response.statusCode).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
    response.destroy?.();
  });

  it("sends ready and the latest authorized snapshot while dropping duplicate and older versions", async () => {
    const { events, snapshots, url } = await fixture();
    const connection = await connect(url);
    expect(await connection.next()).toMatchObject({ protocol: REALTIME_PROTOCOL, type: "connection.ready" });
    const message = connection.next();
    await events.emit({ kind: "notification", eventId: "00000000-0000-4000-8000-000000000101", notificationId: "notification.synthetic", occurredAt: "2026-08-03T10:00:00.000Z", principalId: identity.principalId, stateVersion: 2 });
    expect(await message).toMatchObject({ notificationId: "notification.synthetic", stateVersion: 2, type: "notification.upsert" });
    await events.emit({ kind: "notification", eventId: "00000000-0000-4000-8000-000000000102", notificationId: "notification.synthetic", occurredAt: "2026-08-03T10:00:01.000Z", principalId: identity.principalId, stateVersion: 1 });
    expect(snapshots.notification).toHaveBeenCalledTimes(1);
  });

  it("requests collection resynchronization instead of sending an oversized snapshot", async () => {
    const { events, url } = await fixture({ snapshots: { notification: () => Promise.resolve({ notificationId: "notification.synthetic", stateVersion: 1, bodyMarkdown: "x".repeat(40_000) }), task: () => Promise.resolve(undefined) } });
    const connection = await connect(url);
    await connection.next();
    const message = connection.next();
    await events.emit({ kind: "notification", eventId: "00000000-0000-4000-8000-000000000103", notificationId: "notification.synthetic", occurredAt: "2026-08-03T10:00:00.000Z", principalId: identity.principalId, stateVersion: 1 });
    expect(await message).toMatchObject({ collections: ["tasks", "notifications", "unread-count"], reason: "consumer-error", type: "collection.resync-required" });
  });

  it("sends a revocation reason and closes only the matching session", async () => {
    const { events, url } = await fixture();
    const connection = await connect(url);
    await connection.next();
    const message = connection.next();
    const closed = once(connection.socket, "close");
    await events.emit({ kind: "session-revoked", eventId: "00000000-0000-4000-8000-000000000104", occurredAt: "2026-08-03T10:00:00.000Z", principalId: identity.principalId, reason: "concurrent-limit", sessionReference: identity.sessionReference });
    expect(await message).toMatchObject({ reason: "concurrent-limit", type: "session.revoked" });
    expect((await closed)[0]).toBe(4001);
  });

  it("delivers assignment-targeted tasks and periodically revokes an invalid session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const revalidate = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    const { events, snapshots, url } = await fixture({ revalidate, revalidationIntervalMs: 1_000 });
    const connection = await connect(url);
    await connection.next();
    const taskMessage = connection.next();
    await events.emit({ assignmentId: "assignment.synthetic", kind: "task", eventId: "00000000-0000-4000-8000-000000000105", occurredAt: "2026-08-03T10:00:00.000Z", stateVersion: 1, taskId: "task.synthetic" });
    expect(await taskMessage).toMatchObject({ taskId: "task.synthetic", type: "task.upsert" });
    expect(snapshots.task).toHaveBeenCalledOnce();
    const revoked = connection.next();
    await vi.advanceTimersByTimeAsync(2_100);
    expect(await revoked).toMatchObject({ reason: "policy-changed", type: "session.revoked" });
    vi.useRealTimers();
  });
});
