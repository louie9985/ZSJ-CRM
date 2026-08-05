import type { WorkbenchPort } from "./workbench-port";
import { createSameSiteCollectionPollingPort } from "./same-site-collection-port";
import { createSameSiteSyntheticFormEvidencePort } from "./same-site-synthetic-form-evidence-port";
import { createSameSiteWorkbenchPort } from "./same-site-workbench-port";
import { createSameSitePartTimePort } from "./same-site-part-time-port";
import type { NotificationTemplatePort } from "./notification-template-port";
import type { WorkforceAdministrationPort } from "./workbench-port";

const notificationTemplates: NotificationTemplatePort = {
  activate: async (...input) => (await import("./notification-template-port")).createNotificationTemplatePort().activate(...input),
  get: async (...input) => (await import("./notification-template-port")).createNotificationTemplatePort().get(...input),
  list: async () => (await import("./notification-template-port")).createNotificationTemplatePort().list(),
  preview: async (...input) => (await import("./notification-template-port")).createNotificationTemplatePort().preview(...input),
  publish: async (...input) => (await import("./notification-template-port")).createNotificationTemplatePort().publish(...input),
  save: async (...input) => (await import("./notification-template-port")).createNotificationTemplatePort().save(...input),
};
const workforceAdministration: WorkforceAdministrationPort = {
  execute: async (...input) => (await import("./same-site-workforce-administration-port")).createSameSiteWorkforceAdministrationPort().execute(...input),
  listAccounts: async (...input) => (await import("./same-site-workforce-administration-port")).createSameSiteWorkforceAdministrationPort().listAccounts(...input),
  load: async () => (await import("./same-site-workforce-administration-port")).createSameSiteWorkforceAdministrationPort().load(),
  reauthenticate: async (...input) => (await import("./same-site-workforce-administration-port")).createSameSiteWorkforceAdministrationPort().reauthenticate(...input),
};

const connectedPort: WorkbenchPort = {
  ...createSameSiteWorkbenchPort(),
  partTime: createSameSitePartTimePort(),
  ...createSameSiteCollectionPollingPort(),
  notificationTemplates,
  workforceAdministration,
};

const unavailableProductionPort: WorkbenchPort = {
  login: () => Promise.resolve("unavailable"),
  bootstrap: () => Promise.resolve({ kind: "maintenance" }),
  logout: () => Promise.resolve({ kind: "session-expired" }),
};

const lazyDevelopmentPort: WorkbenchPort = {
  login: () => Promise.resolve("authenticated"),
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
    reauthenticate: () => Promise.resolve(),
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
  const workspaceProfileId = environment["VITE_AI_CRM_E2E_WORKSPACE_PROFILE_ID"];
  const syntheticFormEvidence = createSameSiteSyntheticFormEvidencePort({
    ...(typeof fileReferenceJson === "string" ? { fileReferenceJson } : {}),
    ...(typeof traceparent === "string" ? { traceparent } : {}),
  });
  return {
    ...lazyDevelopmentPort,
    bootstrap: async () => {
      const result = await lazyDevelopmentPort.bootstrap();
      return result.kind === "ready" && typeof workspaceProfileId === "string"
        ? { ...result, workspaceProfileId }
        : result;
    },
    pollCollections: () => polling.pollCollections(),
    ...(syntheticFormEvidence === undefined ? {} : { syntheticFormEvidence }),
  };
}

export function selectRuntimeWorkbenchPort(environment: { readonly connected?: boolean; readonly development: boolean; readonly e2e: boolean }): WorkbenchPort {
  if (environment.e2e) return e2ePort();
  if (environment.connected !== undefined) return environment.connected ? connectedPort : unavailableProductionPort;
  return environment.development ? connectedPort : unavailableProductionPort;
}

export const runtimeWorkbenchPort = selectRuntimeWorkbenchPort({
  connected: true,
  development: import.meta.env.DEV,
  e2e: import.meta.env.VITE_AI_CRM_E2E === "true",
});
