import type { WorkbenchPort } from "./workbench-port";
import { createSameSiteCollectionPollingPort } from "./same-site-collection-port";
import { createSameSiteSyntheticFormEvidencePort } from "./same-site-synthetic-form-evidence-port";
import { createSameSiteWorkforceAdministrationPort } from "./same-site-workforce-administration-port";
import { createSameSiteWorkbenchPort } from "./same-site-workbench-port";

const connectedPort: WorkbenchPort = {
  ...createSameSiteWorkbenchPort(),
  workforceAdministration: createSameSiteWorkforceAdministrationPort(),
};

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
  workforceAdministration: {
    execute: async (command) => {
      const { developmentFixturePort } = await import("./development-fixture");
      const fixture = developmentFixturePort.workforceAdministration;
      if (fixture === undefined) throw new Error("workforce_fixture_missing");
      return fixture.execute(command);
    },
    listAccounts: async (query) => {
      const { developmentFixturePort } = await import("./development-fixture");
      const fixture = developmentFixturePort.workforceAdministration;
      if (fixture === undefined) throw new Error("workforce_fixture_missing");
      return fixture.listAccounts(query);
    },
    load: async () => {
      const { developmentFixturePort } = await import("./development-fixture");
      const fixture = developmentFixturePort.workforceAdministration;
      if (fixture === undefined) throw new Error("workforce_fixture_missing");
      return fixture.load();
    },
  },
};

function e2ePort(): WorkbenchPort {
  const polling = createSameSiteCollectionPollingPort();
  const runtimeEnvironment: unknown = import.meta.env;
  const environment = typeof runtimeEnvironment === "object" && runtimeEnvironment !== null
    ? runtimeEnvironment as Readonly<Record<string, unknown>>
    : {};
  const fileReferenceJson = environment["VITE_AI_CRM_E2E_FILE_REFERENCE_JSON"];
  const traceparent = environment["VITE_AI_CRM_E2E_TRACEPARENT"];
  const syntheticFormEvidence = createSameSiteSyntheticFormEvidencePort({
    ...(typeof fileReferenceJson === "string" ? { fileReferenceJson } : {}),
    ...(typeof traceparent === "string" ? { traceparent } : {}),
  });
  return {
    ...lazyDevelopmentPort,
    pollCollections: () => polling.pollCollections(),
    ...(syntheticFormEvidence === undefined ? {} : { syntheticFormEvidence }),
  };
}

// A generated-client adapter replaces this fail-closed port after the relevant contracts pass G2.
export function selectRuntimeWorkbenchPort(environment: { readonly connected?: boolean; readonly development: boolean; readonly e2e: boolean }): WorkbenchPort {
  return environment.e2e ? e2ePort() : environment.development ? lazyDevelopmentPort : environment.connected === true ? connectedPort : unavailableProductionPort;
}

export const runtimeWorkbenchPort = selectRuntimeWorkbenchPort({
  connected: true,
  development: import.meta.env.DEV,
  e2e: import.meta.env.VITE_AI_CRM_E2E === "true",
});
