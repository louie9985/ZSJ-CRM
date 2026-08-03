import { describe, expect, it } from "vitest";

import { selectRuntimeWorkbenchPort } from "./runtime";

describe("Workbench runtime selection", () => {
  it("keeps production fail-closed unless the explicit E2E build boundary is selected", async () => {
    await expect(selectRuntimeWorkbenchPort({ development: false, e2e: false }).bootstrap()).resolves.toEqual({ kind: "maintenance" });
    await expect(selectRuntimeWorkbenchPort({ development: false, e2e: true }).bootstrap()).resolves.toMatchObject({ kind: "ready" });
  });

  it("lets the explicit connected flag override development mode", async () => {
    await expect(selectRuntimeWorkbenchPort({ connected: false, development: true, e2e: false }).bootstrap()).resolves.toEqual({ kind: "maintenance" });
  });
});
