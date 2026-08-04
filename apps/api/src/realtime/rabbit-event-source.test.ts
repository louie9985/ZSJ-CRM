import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { ConsumeMessage } from "amqplib";
import { parseRealtimeEvent } from "./rabbit-event-source.js";

const message = (value: unknown): ConsumeMessage => ({ content: Buffer.from(JSON.stringify(value)), fields: {} as ConsumeMessage["fields"], properties: {} as ConsumeMessage["properties"] });

describe("Rabbit realtime event source", () => {
  it("extracts only the reviewed lightweight data from an Outbox CloudEvent", () => {
    const data = { eventId: "00000000-0000-4000-8000-000000000301", occurredAt: "2026-08-03T00:00:00.000Z", notificationId: "00000000-0000-4000-8000-000000000302", principalId: "subject:synthetic", stateVersion: 2 };
    expect(parseRealtimeEvent(message({ specversion: "1.0", type: "notifications.in-app-changed.v1", data }))).toEqual({ ...data, kind: "notification" });
  });

  it("accepts assignment-targeted task changes and rejects unbounded or malformed events", () => {
    const data = { assignmentId: "assignment.synthetic", eventId: "00000000-0000-4000-8000-000000000303", occurredAt: "2026-08-03T00:00:00.000Z", stateVersion: 1, taskId: "00000000-0000-4000-8000-000000000304" };
    expect(parseRealtimeEvent(message({ type: "task-center.projection-changed.v1", data }))).toEqual({ ...data, kind: "task" });
    expect(parseRealtimeEvent(message({ type: "notifications.in-app-changed.v1", data: {} }))).toBeUndefined();
    expect(parseRealtimeEvent({ ...message({}), content: Buffer.alloc(16 * 1024 + 1) })).toBeUndefined();
  });
});
