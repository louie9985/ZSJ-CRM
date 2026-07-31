import { createApiPlatformComposition } from "@ai-crm/api";
import { describe, expect, it } from "vitest";

import { createE2eProcessBindings } from "./api-main.js";
import { createMainChainIntegrationFactory } from "./main-chain.js";
import { createE2eProcessAnchorHandler, createE2eTaskProjectionWorkerHandler } from "./worker-main.js";

describe("isolated E2E process composition", () => {
  it("starts from complete API bindings while leaving unfinished capabilities unavailable", async () => {
    const bindings = createE2eProcessBindings();
    const composition = createApiPlatformComposition(bindings);
    await expect(composition.lifecycle.onStart?.(new AbortController().signal)).resolves.toBeUndefined();
    expect(composition.lifecycle.dependencies?.()).toEqual([{ healthy: true, name: "e2e-process-bindings", required: true }]);
    await expect(bindings.queries.notifications.list({} as never)).rejects.toThrow("e2e_capability_not_composed");
  });

  it("keeps the Worker process alive until drain aborts its test-only anchor", async () => {
    const handler = createE2eProcessAnchorHandler();
    const controller = new AbortController();
    const running = Promise.resolve(handler.run(controller.signal));
    let settled = false;
    void running.then(() => { settled = true; });
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(settled).toBe(false);
    controller.abort();
    await expect(running).resolves.toBeUndefined();
  });

  it("installs the Task Projection Consumer in the isolated Worker composition", async () => {
    const handler = createE2eTaskProjectionWorkerHandler();
    const controller = new AbortController();
    await expect(handler.ready(controller.signal)).resolves.toBeUndefined();
    const running = Promise.resolve(handler.run(controller.signal));
    controller.abort();
    await expect(running).resolves.toBeUndefined();
    await expect(handler.stop?.()).resolves.toBeUndefined();
  });

  it("exposes explicit test-only replacement seams for the source and Workflow ledger", () => {
    const createSource = () => ({ marker: "source" }) as never;
    const createWorkflowLedger = () => ({ marker: "ledger" }) as never;
    const factory = createMainChainIntegrationFactory({ createSource, createWorkflowLedger });
    expect(factory.createSource).toBe(createSource);
    expect(factory.createWorkflowLedger).toBe(createWorkflowLedger);
  });
});
