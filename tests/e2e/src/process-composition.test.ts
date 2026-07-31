import { createApiPlatformComposition } from "@ai-crm/api";
import { describe, expect, it } from "vitest";

import { createE2eProcessBindings } from "./api-main.js";
import { createMainChainIntegrationFactory, externalMainChainInputFromEnvironment, parseExternalMainChainInput } from "./main-chain.js";
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

  it("accepts only a matching browser trace and stable FileReference fields", () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const input = parseExternalMainChainInput({
      fileReferenceJson: JSON.stringify({
        contentVersionId: "93000000-0000-4000-8000-000000000002",
        displayName: "clamav-clean.txt",
        fileId: "93000000-0000-4000-8000-000000000001",
        mediaType: "text/plain",
        sizeBytes: 24,
        version: 1,
      }),
      traceId,
      traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
    });
    expect(input).toMatchObject({ fileReference: { displayName: "clamav-clean.txt", version: 1 }, traceId });
  });

  it("rejects mismatched traces and provider storage details", () => {
    const input = {
      fileReferenceJson: JSON.stringify({
        bucket: "must-not-cross-boundary",
        contentVersionId: "93000000-0000-4000-8000-000000000002",
        displayName: "clamav-clean.txt",
        fileId: "93000000-0000-4000-8000-000000000001",
        version: 1,
      }),
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-00f067aa0ba902b7-01",
    };
    expect(() => parseExternalMainChainInput(input)).toThrow("e2e_main_chain_external_trace_invalid");
    expect(() => parseExternalMainChainInput({ ...input, traceId: "a".repeat(32) })).toThrow("e2e_main_chain_external_file_reference_invalid");
  });

  it("can fail durable execution closed when external evidence is required", () => {
    expect(() => externalMainChainInputFromEnvironment({}, true)).toThrow("e2e_durable_main_chain_external_evidence_required");
    expect(() => externalMainChainInputFromEnvironment({
      AI_CRM_E2E_BROWSER_TRACE_ID: "4bf92f3577b34da6a3ce929d0e0e4736",
    }, false)).toThrow("e2e_durable_main_chain_external_evidence_incomplete");
    expect(externalMainChainInputFromEnvironment({}, false)).toBeUndefined();
  });
});
