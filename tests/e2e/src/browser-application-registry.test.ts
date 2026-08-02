import { describe, expect, it } from "vitest";

import { browserRegistryEvidence, createBrowserApplicationRegistryFixture } from "./browser-application-registry.js";

const context = Object.freeze({
  activeAssignmentIds: Object.freeze(["71000000-0000-4000-8000-000000000007"]),
  actorId: "subject:synthetic-browser-user",
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  workforcePersonId: "71000000-0000-4000-8000-000000000001",
});

describe("browser Application Registry fixture", () => {
  it("loads the registered synthetic Workbench route and resolves its task deep link", async () => {
    const fixture = await createBrowserApplicationRegistryFixture();

    const registry = await fixture.applicationRegistry.loadRegistry(context);
    expect(registry).toMatchObject({
      headers: { "Cache-Control": "no-store", "X-Trace-Id": context.traceId },
      status: 200,
    });
    expect(registry.body).toEqual({
      applications: [{ applicationId: browserRegistryEvidence.applicationId, audience: "internal", enabled: true, permissionCode: "platform.synthetic:view" }],
      navigation: [{ applicationId: browserRegistryEvidence.applicationId, enabled: true, navigationId: browserRegistryEvidence.navigationId, order: 10, routeId: browserRegistryEvidence.routeId }],
      routes: [{ applicationId: browserRegistryEvidence.applicationId, deepLinkSources: ["task"], enabled: true, path: browserRegistryEvidence.routeTemplate, permissionCode: "platform.synthetic:open", routeId: browserRegistryEvidence.routeId }],
      version: 1,
    });

    const resolved = await fixture.applicationRegistry.resolveDeepLink(context, {
      applicationId: browserRegistryEvidence.applicationId,
      resourceReference: browserRegistryEvidence.resourceReference,
      routeId: browserRegistryEvidence.routeId,
      source: "task",
      version: 1,
    });
    expect(resolved).toEqual({
      body: {
        applicationId: browserRegistryEvidence.applicationId,
        path: browserRegistryEvidence.routeTemplate,
        resourceReference: browserRegistryEvidence.resourceReference,
        routeId: browserRegistryEvidence.routeId,
      },
      headers: { "Cache-Control": "no-store", "X-Trace-Id": context.traceId },
      status: 200,
    });
  });

  it("fails closed for an unregistered link or unauthenticated context", async () => {
    const fixture = await createBrowserApplicationRegistryFixture();
    await expect(fixture.applicationRegistry.resolveDeepLink(context, {
      applicationId: browserRegistryEvidence.applicationId,
      resourceReference: browserRegistryEvidence.resourceReference,
      routeId: "platform.synthetic.unknown",
      source: "task",
      version: 1,
    })).rejects.toMatchObject({ code: "app_registry_invalid_input" });
    await expect(fixture.applicationRegistry.loadRegistry({ traceId: context.traceId })).rejects.toMatchObject({ code: "app_registry_invalid_input" });
  });
});
