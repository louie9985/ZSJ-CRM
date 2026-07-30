import type { WorkbenchPort } from "./workbench-port";

const unavailableProductionPort: WorkbenchPort = {
  bootstrap: () => Promise.resolve({ kind: "maintenance" }),
  logout: () => Promise.resolve({ kind: "session-expired" }),
};

const lazyDevelopmentPort: WorkbenchPort = {
  bootstrap: async () => {
    const { developmentFixturePort } = await import("./development-fixture");
    return developmentFixturePort.bootstrap();
  },
  logout: async () => {
    const { developmentFixturePort } = await import("./development-fixture");
    return developmentFixturePort.logout();
  },
};

// A generated-client adapter replaces this fail-closed port after the relevant contracts pass G2.
export function selectRuntimeWorkbenchPort(environment: { readonly development: boolean; readonly e2e: boolean }): WorkbenchPort {
  return environment.development || environment.e2e ? lazyDevelopmentPort : unavailableProductionPort;
}

export const runtimeWorkbenchPort = selectRuntimeWorkbenchPort({
  development: import.meta.env.DEV,
  e2e: import.meta.env.VITE_AI_CRM_E2E === "true",
});
