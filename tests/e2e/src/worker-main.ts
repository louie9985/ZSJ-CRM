import { randomUUID } from "node:crypto";
import { bootstrapWorker, createAmqplibPublisherAdapter, createDefaultProductionWorkerResources, loadRabbitConnectionConfiguration, taskProjectionRabbitTopology, type WorkerHandler } from "@ai-crm/worker";
import { createEventingCore, createRabbitConfirmTransport, type EventEnvelope, type EventingCore, type RabbitDelivery } from "@ai-crm/platform-eventing-outbox";
import { InMemoryEventingStore } from "@ai-crm/platform-eventing-outbox/testing";
import { InMemoryTaskCenterStore } from "@ai-crm/platform-task-center";
import {
  createTaskProjectionConsumerHandler,
  taskProjectionBindingId,
  taskProjectionRuntimePolicy,
  type RabbitConsumerAdapter,
} from "@ai-crm/worker";

function createIsolatedProjectionAdapter(): RabbitConsumerAdapter {
  return Object.freeze({
    bindingIds: () => [taskProjectionBindingId],
    concurrency: taskProjectionRuntimePolicy.concurrency,
    prefetch: taskProjectionRuntimePolicy.prefetch,
    healthy: () => true,
    ready: () => undefined,
    run: async (_accept: (bindingId: string, message: RabbitDelivery) => Promise<void>, signal: AbortSignal) => {
      if (signal.aborted) return;
      await new Promise<void>((resolve) => { signal.addEventListener("abort", () => { resolve(); }, { once: true }); });
    },
    stop: () => { /* controlled test adapter */ },
    drain: () => Promise.resolve(),
  });
}

/** Isolated process composition: no broker or database is contacted. */
export function createE2eTaskProjectionWorkerHandler(): WorkerHandler {
  const core: EventingCore = createEventingCore(new InMemoryEventingStore());
  const store = new InMemoryTaskCenterStore();
  return createTaskProjectionConsumerHandler(core, createIsolatedProjectionAdapter(), {
    apply: (event, signal) => store.apply(event, signal),
  });
}

export function createE2eProcessAnchorHandler(): WorkerHandler {
  return Object.freeze({
    name: "e2e.process-anchor",
    ready: () => undefined,
    run: async (signal: AbortSignal) => {
      if (signal.aborted) return;
      await new Promise<void>((resolve) => {
        // An AbortSignal listener alone does not keep Node's event loop alive;
        // an unsettled top-level await would otherwise terminate with code 13.
        const keepAlive = setInterval(() => undefined, 60_000);
        signal.addEventListener("abort", () => {
          clearInterval(keepAlive);
          resolve();
        }, { once: true });
      });
    },
  });
}

if (process.env["AI_CRM_E2E_PROCESS_ENTRYPOINT"] === "worker") {
  if (process.env["AI_CRM_E2E_WORKER_REAL_INFRA"] === "true") {
    process.exitCode = await bootstrapWorker({ productionResourceFactory: createDefaultProductionWorkerResources });
  } else {
    process.exitCode = await bootstrapWorker({ composition: { handlers: [createE2eTaskProjectionWorkerHandler(), createE2eProcessAnchorHandler()], requireHandlers: true } });
  }
}

if (process.env["AI_CRM_E2E_PROCESS_ENTRYPOINT"] === "publish-task-projection") {
  const eventId = process.env["AI_CRM_E2E_TASK_PROJECTION_EVENT_ID"] ?? randomUUID();
  const sourceTaskId = process.env["AI_CRM_E2E_TASK_PROJECTION_SOURCE_TASK_ID"] ?? "task.e2e-isolated-worker";
  const envelope: EventEnvelope = Object.freeze({
    correlationid: randomUUID(), data: Object.freeze({
      assigneeReference: "assignment.e2e", deepLink: Object.freeze({ appId: "platform.synthetic", routeId: "platform.synthetic.detail" }),
      eventId, occurredAt: new Date().toISOString(), sourceTaskId, sourceType: "platform.synthetic", sourceVersion: 1, status: "open",
    }), datacontenttype: "application/json", dataschema: "urn:ai-crm:events:task-projection-lifecycle:v1",
    id: eventId, source: "urn:ai-crm:tests.e2e", specversion: "1.0", time: new Date().toISOString(), type: "task-center.projection-lifecycle.v1",
  });
  const publisher = await createAmqplibPublisherAdapter(await loadRabbitConnectionConfiguration("publisher"));
  try {
    const transport = await createRabbitConfirmTransport(publisher.channel, {
      exchange: taskProjectionRabbitTopology.exchange, exchangeType: taskProjectionRabbitTopology.exchangeType,
      routes: [{ messageKind: "event", messageType: "task-center.projection-lifecycle.v1", messageVersion: 1, routingKey: taskProjectionRabbitTopology.routingKey }],
    });
    await transport.publish({ attempt: 1, correlationId: envelope.correlationid, messageId: eventId, messageKind: "event", messageType: envelope.type, messageVersion: 1, payload: JSON.stringify(envelope), producer: envelope.source });
    process.stdout.write(`${JSON.stringify({ eventId, sourceTaskId, status: "task-projection-published" })}\n`);
  } finally {
    await publisher.close();
  }
}
