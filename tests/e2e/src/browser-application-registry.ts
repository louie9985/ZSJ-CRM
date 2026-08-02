import { randomUUID } from "node:crypto";

import {
  AppRegistryError,
  createApplicationRegistryService,
  createMemoryApplicationRegistryStore,
  type ApplicationRegistryService,
  type RegisteredDeepLink,
  type RegistryActor,
  type RegistrySnapshot,
  type ResolvedDeepLink,
} from "@ai-crm/platform-app-registry";

export const browserRegistryEvidence = Object.freeze({
  applicationId: "platform.synthetic",
  navigationId: "platform.synthetic.tasks",
  resourceReference: "source-task.main-chain-synthetic",
  resolvedPath: "/tasks/source-task.main-chain-synthetic",
  routeId: "platform.synthetic.task-detail",
  routeTemplate: "/tasks/:resource_reference",
} as const);

type RegistryHttpResponse = Readonly<{
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}>;

export interface BrowserApplicationRegistryFixture {
  readonly applicationRegistry: Readonly<{
    loadRegistry(context: unknown): Promise<RegistryHttpResponse>;
    resolveDeepLink(context: unknown, body: unknown): Promise<RegistryHttpResponse>;
  }>;
  readonly expectedEvidence: typeof browserRegistryEvidence;
}

const actor: RegistryActor = Object.freeze({
  actorId: "system.e2e-browser-registry",
  actorType: "system",
});
const traceId = "75000000000000000000000000000001";

function response(body: RegistrySnapshot | ResolvedDeepLink, requestTraceId: string): RegistryHttpResponse {
  return Object.freeze({
    body: body as unknown as Readonly<Record<string, unknown>>,
    headers: Object.freeze({ "Cache-Control": "no-store", "X-Trace-Id": requestTraceId }),
    status: 200,
  });
}

function authenticatedActor(value: unknown): Readonly<{ readonly actor: RegistryActor; readonly traceId: string }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AppRegistryError("app_registry_invalid_input");
  const context = value as Readonly<Record<string, unknown>>;
  if (typeof context["actorId"] !== "string" || typeof context["traceId"] !== "string" ||
    !/^(?!0{32})[0-9a-f]{32}$/u.test(context["traceId"])) throw new AppRegistryError("app_registry_invalid_input");
  return Object.freeze({
    actor: Object.freeze({ actorId: context["actorId"], actorType: "authenticated_subject" as const }),
    traceId: context["traceId"],
  });
}

function registeredDeepLink(value: unknown): RegisteredDeepLink {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AppRegistryError("app_registry_invalid_input");
  const link = value as Readonly<Record<string, unknown>>;
  if (link["applicationId"] !== browserRegistryEvidence.applicationId ||
    link["routeId"] !== browserRegistryEvidence.routeId ||
    link["resourceReference"] !== browserRegistryEvidence.resourceReference ||
    link["source"] !== "task" || link["version"] !== 1) throw new AppRegistryError("app_registry_invalid_input");
  return Object.freeze({
    applicationId: browserRegistryEvidence.applicationId,
    resourceReference: browserRegistryEvidence.resourceReference,
    routeId: browserRegistryEvidence.routeId,
    source: "task",
    version: 1,
  });
}

async function seedRegistry(service: ApplicationRegistryService): Promise<void> {
  const metadata = () => Object.freeze({
    actor,
    operationId: randomUUID(),
    reason: "business-neutral browser Application Registry fixture",
    traceId,
  });
  await service.mutate({
    ...metadata(),
    application: Object.freeze({
      applicationId: browserRegistryEvidence.applicationId,
      audience: "internal",
      enabled: true,
      permissionCode: "platform.synthetic:view",
    }),
    kind: "register_application",
  });
  await service.mutate({
    ...metadata(),
    kind: "register_route",
    route: Object.freeze({
      applicationId: browserRegistryEvidence.applicationId,
      deepLinkSources: Object.freeze(["task" as const]),
      enabled: true,
      path: browserRegistryEvidence.routeTemplate,
      permissionCode: "platform.synthetic:open",
      routeId: browserRegistryEvidence.routeId,
    }),
  });
  await service.mutate({
    ...metadata(),
    kind: "register_navigation",
    navigation: Object.freeze({
      applicationId: browserRegistryEvidence.applicationId,
      enabled: true,
      navigationId: browserRegistryEvidence.navigationId,
      order: 10,
      routeId: browserRegistryEvidence.routeId,
    }),
  });
}

export async function createBrowserApplicationRegistryFixture(): Promise<Readonly<BrowserApplicationRegistryFixture>> {
  const service = createApplicationRegistryService(
    createMemoryApplicationRegistryStore(),
    { authorize: () => Promise.resolve(Object.freeze({ allowed: true, decisionId: randomUUID() })) },
    { record: () => Promise.resolve() },
  );
  await seedRegistry(service);
  return Object.freeze({
    applicationRegistry: Object.freeze({
      async loadRegistry(context: unknown): Promise<RegistryHttpResponse> {
        const authenticated = authenticatedActor(context);
        return response(await service.loadRegistry({ actor: authenticated.actor, audience: "internal" }), authenticated.traceId);
      },
      async resolveDeepLink(context: unknown, body: unknown): Promise<RegistryHttpResponse> {
        const authenticated = authenticatedActor(context);
        const resolved = await service.resolveDeepLink({
          actor: authenticated.actor,
          audience: "internal",
          link: registeredDeepLink(body),
        });
        return response(resolved, authenticated.traceId);
      },
    }),
    expectedEvidence: browserRegistryEvidence,
  });
}
