import { describe, expect, it, vi } from "vitest";

import {
  authorizeBrowserTaskFixture,
  closeBrowserAuthenticationBffResources,
  createBrowserTaskAuthorizationFixtures,
} from "./browser-authentication-bff.js";

const subject = Object.freeze({ issuer: "https://identity.example.test/realms/ai-crm", subject: "browser-subject-synthetic" });
const authorizationInput = Object.freeze({
  at: "2026-08-02T00:00:00.000Z",
  permission: Object.freeze({ action: "complete", resource: "platform.task-center.task-projection" }),
  traceId: "71000000000000000000000000000003",
});

describe("browser authentication BFF cleanup", () => {
  it("closes Redis even when application shutdown fails", async () => {
    const stopFailure = new Error("synthetic_application_stop_failure");
    const stop = vi.fn().mockRejectedValue(stopFailure);
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(closeBrowserAuthenticationBffResources({ stop }, { close })).rejects.toMatchObject({
      errors: [stopFailure],
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports both independent cleanup failures", async () => {
    const stopFailure = new Error("synthetic_application_stop_failure");
    const redisFailure = new Error("synthetic_redis_close_failure");

    await expect(closeBrowserAuthenticationBffResources(
      { stop: () => Promise.reject(stopFailure) },
      { close: () => Promise.reject(redisFailure) },
    )).rejects.toMatchObject({ errors: [stopFailure, redisFailure] });
  });
});

describe("browser Task workforce and authorization fixture", () => {
  it("resolves the linked active workforce through Organization and Authorization services", async () => {
    const fixtures = await createBrowserTaskAuthorizationFixtures(subject);
    await expect(authorizeBrowserTaskFixture(fixtures, "allowed", subject, authorizationInput)).resolves.toMatchObject({
      decision: { allowed: true, reason: "allowed" },
      workforce: { assignments: [{ assignmentId: "71000000-0000-4000-8000-000000000007" }], workforcePersonId: "71000000-0000-4000-8000-000000000001" },
    });
  });

  it.each(["unlinked", "inactive_employment", "permission_denied"] as const)("fails closed for %s", async (scenario) => {
    const fixtures = await createBrowserTaskAuthorizationFixtures(subject);
    await expect(authorizeBrowserTaskFixture(fixtures, scenario, subject, authorizationInput)).rejects.toBeDefined();
  });
});
