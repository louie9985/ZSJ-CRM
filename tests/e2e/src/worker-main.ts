import { bootstrapWorker, type WorkerHandler } from "@ai-crm/worker";
import { createEventingCore, type EventingCore, type RabbitDelivery } from "@ai-crm/platform-eventing-outbox";
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
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    },
    stop: () => undefined,
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
  process.exitCode = await bootstrapWorker({
    composition: {
      handlers: [createE2eTaskProjectionWorkerHandler(), createE2eProcessAnchorHandler()],
      requireHandlers: true,
    },
  });
}
