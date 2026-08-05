import type { EventingCore, JobDeliveryIsolation, MessageHandler, RabbitDelivery } from "@ai-crm/crm-eventing-outbox";
import type { TaskCenter } from "@ai-crm/crm-task-center";
import { describe, expect, it, vi } from "vitest";
import { createOutboxPublisherLoopHandler, createRabbitInboxHandler, createTaskReconciliationHandler } from "./handlers.js";
import { createWorkerHandlerRegistry } from "./handler-registry.js";

describe("Worker handler composition", () => {
  it("seals explicit registration and rejects duplicate identifiers", () => {
    const registry = createWorkerHandlerRegistry();
    const handler = { name: "eventing.publisher", ready: () => undefined, run: () => Promise.resolve() };
    registry.register(handler);
    expect(registry.handlers()).toEqual([handler]);
    expect(() => { registry.register({ ...handler, name: "late" }); }).toThrow("worker_handler_registry_sealed");
  });

  it("runs the public Outbox publisher until acquisition is aborted", async () => {
    const controller = new AbortController();
    const publishBatch = vi.fn(() => {
      controller.abort();
      return Promise.resolve({ claimed: 0, isolated: 0, published: 0, retained: 0 });
    });
    const handler = createOutboxPublisherLoopHandler({ publishBatch }, 10);
    await handler.run(controller.signal);
    expect(publishBatch).toHaveBeenCalledOnce();
  });

  it("connects a Rabbit delivery to durable Inbox consumption before ACK", async () => {
    const order: string[] = [];
    const core = { consume: vi.fn(() => { order.push("consume"); return Promise.resolve({ status: "completed" as const }); }) } as unknown as EventingCore;
    const messageHandler = { kind: "event", messageType: "crm.synthetic.changed.v1", messageVersion: 1, handle: vi.fn() } satisfies MessageHandler;
    const delivery: RabbitDelivery = {
      ack: () => { order.push("ack"); },
      attempt: 1,
      body: Buffer.from(JSON.stringify({
        correlationid: "018f3f7a-9ec6-7c65-8e6e-6c9e43043112",
        data: {},
        datacontenttype: "application/json",
        dataschema: "urn:ai-crm:events:synthetic:v1",
        id: "018f3f7a-9ec6-7c65-8e6e-6c9e43043111",
        source: "urn:ai-crm:crm.synthetic",
        specversion: "1.0",
        time: "2026-07-27T00:00:00.000Z",
        type: "crm.synthetic.changed.v1",
      })),
      deadLetter: vi.fn(),
      retry: vi.fn(() => Promise.resolve()),
    };
    const adapter = {
      bindingIds: () => ["synthetic.binding"],
      concurrency: 1,
      drain: () => Promise.resolve(),
      healthy: () => true,
      prefetch: 1,
      ready: () => undefined,
      run: async (accept: (bindingId: string, value: RabbitDelivery) => Promise<void>) => { await accept("synthetic.binding", delivery); },
      stop: () => undefined,
    };
    const handler = createRabbitInboxHandler(core, adapter, [{
      bindingId: "synthetic.binding",
      classify: () => "terminal",
      consumer: "synthetic.consumer",
      eventPolicy: { backoffSeconds: [], maxAttempts: 1, timeoutMs: 100 },
      handler: messageHandler,
    }]);
    await handler.ready(new AbortController().signal);
    await handler.run(new AbortController().signal);
    expect(order).toEqual(["consume", "ack"]);
  });

  it("fails closed when configured Rabbit bindings do not match the concrete adapter", () => {
    const core = {} as EventingCore;
    const adapter = { bindingIds: () => [], concurrency: 1, drain: () => Promise.resolve(), healthy: () => true, prefetch: 1, ready: () => undefined, run: () => Promise.resolve(), stop: () => undefined };
    expect(() => createRabbitInboxHandler(core, adapter, [{
      bindingId: "synthetic.binding",
      classify: () => "terminal",
      consumer: "synthetic.consumer",
      eventPolicy: { backoffSeconds: [], maxAttempts: 1, timeoutMs: 100 },
      handler: {} as MessageHandler,
    }])).toThrow("worker_rabbit_bindings_invalid");
  });

  it("isolates a terminal Job and commits its durable callback before dead-lettering", async () => {
    const order: string[] = [];
    const input = {
      jobId: "018f3f7a-9ec6-7c65-8e6e-6c9e43043111",
      jobType: "crm.synthetic-check",
      jobVersion: 1,
      source: "urn:ai-crm:walking-skeleton",
      idempotencyKey: "synthetic:terminal-handler",
      requestedAt: "2026-07-27T00:00:00.000Z",
      correlationId: "018f3f7a-9ec6-7c65-8e6e-6c9e43043112",
      policy: { maxAttempts: 1, backoffSeconds: [], timeoutMs: 1000, failureDisposition: "isolate" },
      payload: { reference: "must-not-reach-callback" },
    };
    const core = {
      consume: vi.fn(() => { order.push("consume"); return Promise.reject(new Error("raw failure")); }),
      isolateJobForDeliveryFailure: vi.fn(async (notice: JobDeliveryIsolation, callback?: (input: JobDeliveryIsolation) => Promise<void>) => {
        order.push(`isolate:${notice.category}`);
        await callback?.(notice);
        return { jobId: notice.jobId, status: "isolated" as const };
      }),
    } as unknown as EventingCore;
    const delivery: RabbitDelivery = {
      ack: () => { order.push("ack"); }, attempt: 1, body: Buffer.from(JSON.stringify(input)),
      deadLetter: () => { order.push("dead-letter"); }, retry: () => Promise.resolve(),
    };
    const adapter = {
      bindingIds: () => ["synthetic.job-binding"], concurrency: 1, drain: () => Promise.resolve(), healthy: () => true, prefetch: 1,
      ready: () => undefined, run: async (accept: (bindingId: string, value: RabbitDelivery) => Promise<void>) => { await accept("synthetic.job-binding", delivery); }, stop: () => undefined,
    };
    const handler = createRabbitInboxHandler(core, adapter, [{
      bindingId: "synthetic.job-binding", classify: () => "terminal", consumer: "synthetic.job-consumer",
      eventPolicy: { backoffSeconds: [], maxAttempts: 1, timeoutMs: 1000 },
      handler: { kind: "job", messageType: input.jobType, messageVersion: 1, recheckAuthoritativeState: () => Promise.resolve(true), handle: () => Promise.resolve() },
      onIsolated: (notice) => { order.push(`durable:${String(notice.attempt)}`); expect(notice).not.toHaveProperty("payload"); expect(notice).not.toHaveProperty("error"); return Promise.resolve(); },
    }]);
    await handler.run(new AbortController().signal);
    expect(order).toEqual(["consume", "isolate:terminal_failure", "durable:1", "dead-letter"]);
  });

  it("forwards authoritative consume results to the binding before ACK", async () => {
    const order: string[] = [];
    const core = { consume: vi.fn(() => Promise.resolve({ status: "skipped" as const, reason: "authoritative_state_rejected" as const })) } as unknown as EventingCore;
    const body = Buffer.from(JSON.stringify({
      specversion: "1.0", id: "018f3f7a-9ec6-7c65-8e6e-6c9e43043111", source: "urn:ai-crm:walking-skeleton",
      type: "crm.synthetic.changed.v1", time: "2026-07-27T00:00:00.000Z", datacontenttype: "application/json",
      dataschema: "urn:ai-crm:events:synthetic:v1", correlationid: "018f3f7a-9ec6-7c65-8e6e-6c9e43043112", data: {},
    }));
    const delivery: RabbitDelivery = { ack: () => { order.push("ack"); }, attempt: 1, body, deadLetter: () => { order.push("dead-letter"); }, retry: () => Promise.resolve() };
    const adapter = { bindingIds: () => ["synthetic.binding"], concurrency: 1, drain: () => Promise.resolve(), healthy: () => true, prefetch: 1, ready: () => undefined, run: async (accept: (bindingId: string, value: RabbitDelivery) => Promise<void>) => { await accept("synthetic.binding", delivery); }, stop: () => undefined };
    const handler = createRabbitInboxHandler(core, adapter, [{ bindingId: "synthetic.binding", classify: () => "terminal", consumer: "synthetic.consumer", eventPolicy: { backoffSeconds: [], maxAttempts: 1, timeoutMs: 1000 }, handler: { kind: "event", messageType: "crm.synthetic.changed.v1", messageVersion: 1, handle: () => Promise.resolve() }, onConsumed: ({ result }) => { order.push(result.status); return Promise.resolve(); } }]);
    await handler.run(new AbortController().signal);
    expect(order).toEqual(["skipped", "ack"]);
  });

  it("yields the event loop between continuously available work items", async () => {
    const controller = new AbortController();
    const reconcile = vi.fn(() => Promise.resolve({ status: "current" as const }));
    const handler = createTaskReconciliationHandler({ reconcile } as unknown as TaskCenter, {
      next: () => Promise.resolve({ actor: { principalId: "synthetic" }, key: { sourceTaskId: "task", sourceType: "synthetic" } }),
    });
    const timer = setTimeout(() => { controller.abort(); }, 10);
    await handler.run(controller.signal);
    clearTimeout(timer);
    expect(reconcile).toHaveBeenCalled();
    expect(controller.signal.aborted).toBe(true);
  });
});
