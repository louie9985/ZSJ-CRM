import { bootstrapWorker, type WorkerHandler } from "@ai-crm/worker";

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
      handlers: [createE2eProcessAnchorHandler()],
      requireHandlers: true,
    },
  });
}
