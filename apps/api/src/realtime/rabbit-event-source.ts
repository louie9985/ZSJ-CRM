import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";

import type { RealtimeEventSource, RealtimeReferenceEvent } from "./realtime-server.js";

const MAX_EVENT_BYTES = 16 * 1024;

export function parseRealtimeEvent(message: ConsumeMessage): RealtimeReferenceEvent | undefined {
  if (message.content.byteLength > MAX_EVENT_BYTES) return undefined;
  let value: unknown;
  try { value = JSON.parse(message.content.toString("utf8")) as unknown; } catch { return undefined; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const envelope = value as Record<string, unknown>;
  const data = typeof envelope["data"] === "object" && envelope["data"] !== null && !Array.isArray(envelope["data"])
    ? envelope["data"] as Record<string, unknown>
    : envelope;
  const eventType = typeof envelope["type"] === "string" ? envelope["type"] : undefined;
  if (typeof data["eventId"] !== "string" || typeof data["occurredAt"] !== "string") return undefined;
  if ((eventType === "task-center.projection-changed.v1" || data["kind"] === "task") && typeof data["taskId"] === "string" && (typeof data["principalId"] === "string" || typeof data["assignmentId"] === "string") && Number.isSafeInteger(data["stateVersion"]) && Number(data["stateVersion"]) > 0) return { ...data, kind: "task" } as unknown as RealtimeReferenceEvent;
  if (typeof data["principalId"] !== "string") return undefined;
  if ((eventType === "notifications.in-app-changed.v1" || data["kind"] === "notification") && typeof data["notificationId"] === "string" && Number.isSafeInteger(data["stateVersion"]) && Number(data["stateVersion"]) > 0) return { ...data, kind: "notification" } as unknown as RealtimeReferenceEvent;
  if ((eventType === "authentication.pc-session-revoked.v1" || data["kind"] === "session-revoked") && typeof data["sessionReference"] === "string" && ["administrator", "concurrent-limit", "identity-invalid", "policy-changed"].includes(String(data["reason"]))) return { ...data, kind: "session-revoked" } as unknown as RealtimeReferenceEvent;
  return undefined;
}

export interface RabbitRealtimeEventSource extends RealtimeEventSource {
  close(): Promise<void>;
  health(): boolean;
  start(): Promise<void>;
}

export function createRabbitRealtimeEventSource(options: { readonly connectionUrl: string; readonly exchange?: string; readonly nodeId: string }): RabbitRealtimeEventSource {
  const handlers = new Set<(event: RealtimeReferenceEvent) => void | Promise<void>>();
  let connection: ChannelModel | undefined;
  let channel: Channel | undefined;
  let healthy = false;
  let closed = false;
  let reconnectAttempt = 0;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let connecting: Promise<void> | undefined;
  const isClosed = (): boolean => closed;
  const scheduleReconnect = (): void => {
    if (closed || reconnectTimer !== undefined) return;
    const delay = Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempt, 5)));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void establish().catch(() => { scheduleReconnect(); });
    }, delay);
    reconnectTimer.unref();
  };
  const establish = async (): Promise<void> => {
    if (closed || connecting !== undefined || healthy) return connecting;
    connecting = (async () => {
      let nextConnection: ChannelModel | undefined;
      let nextChannel: Channel | undefined;
      try {
        nextConnection = await connect(options.connectionUrl);
        nextChannel = await nextConnection.createChannel();
        const exchange = options.exchange ?? "ai-crm.crm.events.v1";
        await nextChannel.checkExchange(exchange);
        const queue = await nextChannel.assertQueue("", { autoDelete: true, durable: false, exclusive: true, arguments: { "x-expires": 60_000 } });
        for (const routingKey of ["task-center.projection-changed.v1", "notifications.in-app-changed.v1", "authentication.pc-session-revoked.v1"]) await nextChannel.bindQueue(queue.queue, exchange, routingKey);
        const consumingChannel = nextChannel;
        await consumingChannel.consume(queue.queue, (message) => {
          if (message === null) return;
          const event = parseRealtimeEvent(message);
          if (event === undefined) { consumingChannel.nack(message, false, false); return; }
          void Promise.allSettled([...handlers].map((handler) => handler(event))).finally(() => { if (consumingChannel === channel) consumingChannel.ack(message); });
        }, { noAck: false, consumerTag: `realtime.${options.nodeId}` });
        if (isClosed()) { await nextChannel.close().catch(() => undefined); await nextConnection.close().catch(() => undefined); return; }
        connection = nextConnection;
        channel = nextChannel;
        healthy = true;
        reconnectAttempt = 0;
        const disconnected = (): void => {
          if (connection !== nextConnection) return;
          healthy = false;
          connection = undefined;
          channel = undefined;
          scheduleReconnect();
        };
        nextConnection.on("error", () => { healthy = false; });
        nextConnection.on("close", disconnected);
        nextChannel.on("close", disconnected);
      } catch (error) {
        healthy = false;
        await nextChannel?.close().catch(() => undefined);
        await nextConnection?.close().catch(() => undefined);
        throw error;
      }
    })().finally(() => { connecting = undefined; });
    return connecting;
  };
  return Object.freeze({
    async start() {
      closed = false;
      try { await establish(); } catch (error) { scheduleReconnect(); throw error; }
    },
    subscribe(handler: (event: RealtimeReferenceEvent) => void | Promise<void>) { handlers.add(handler); return () => { handlers.delete(handler); }; },
    async close() { closed = true; healthy = false; if (reconnectTimer !== undefined) clearTimeout(reconnectTimer); reconnectTimer = undefined; const closingChannel = channel; const closingConnection = connection; channel = undefined; connection = undefined; await closingChannel?.close().catch(() => undefined); await closingConnection?.close().catch(() => undefined); },
    health: () => healthy,
  });
}
