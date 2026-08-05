import { createApiApplication, createApiPlatformComposition } from "@ai-crm/api";
import { describe, expect, it } from "vitest";

import { createE2eProcessBindings, e2eTaskFixture } from "./api-main.js";

describe("E2E API Task composition", () => {
  it("keeps Task Center authorization fail closed", async () => {
    const bindings = createE2eProcessBindings();
    await expect(bindings.queries.tasks.list({
      actor: { activeAssignmentIds: [e2eTaskFixture.activeAssignmentId], principalId: "unknown" },
    })).rejects.toMatchObject({ code: "TASK_OPERATION_DENIED" });
  });

  it("maps Task denial to 403 and Task authorization failure to 503", async () => {
    const requestWith = async (allowTaskOperation: NonNullable<NonNullable<Parameters<typeof createE2eProcessBindings>[0]>["allowTaskOperation"]>): Promise<{ readonly body: unknown; readonly status: number }> => {
      const platform = createApiPlatformComposition(createE2eProcessBindings({ allowTaskOperation }));
      const application = createApiApplication({ ...platform.lifecycle, logger: { log: () => undefined } });
      await application.start(0, "127.0.0.1");
      try {
        const server = application.instance()?.getHttpServer() as unknown as { address(): { port: number } | null };
        const address = server.address();
        if (address === null) throw new Error("e2e_api_address_missing");
        const response = await fetch(`http://127.0.0.1:${String(address.port)}/tasks/${e2eTaskFixture.sourceType}/${e2eTaskFixture.sourceTaskId}/complete`, {
          headers: {
            Cookie: `__Host-ai_crm_pc_session=${e2eTaskFixture.credential}`,
            "Idempotency-Key": "task-complete.e2e-api-authorization",
            Origin: "http://e2e.invalid",
            "X-CSRF-Token": e2eTaskFixture.csrfToken,
          },
          method: "POST",
        });
        return { body: await response.json(), status: response.status };
      } finally {
        await application.stop();
      }
    };
    await expect(requestWith(() => false)).resolves.toEqual({ body: { code: "TASK_OPERATION_DENIED" }, status: 403 });
    await expect(requestWith(() => { throw new Error("synthetic_authorization_outage"); })).resolves.toEqual({ body: { code: "TASK_AUTHORIZATION_FAILED" }, status: 503 });
  });

  it("authenticates and idempotently routes completion through the Walking Skeleton source", async () => {
    const traces: string[] = [];
    const platform = createApiPlatformComposition(createE2eProcessBindings({ onAuthorizationTrace: (traceId) => { traces.push(traceId); } }));
    const application = createApiApplication({ ...platform.lifecycle, logger: { log: () => undefined } });
    await application.start(0, "127.0.0.1");
    try {
      const server = application.instance()?.getHttpServer() as unknown as { address(): { port: number } | null };
      const address = server.address();
      if (address === null) throw new Error("e2e_api_address_missing");
      const url = `http://127.0.0.1:${String(address.port)}/tasks/${e2eTaskFixture.sourceType}/${e2eTaskFixture.sourceTaskId}/complete`;
      const traceId = "0123456789abcdef0123456789abcdef";
      const request = () => fetch(url, { headers: {
        Cookie: `__Host-ai_crm_pc_session=${e2eTaskFixture.credential}`,
        "Idempotency-Key": "task-complete.e2e-api-0001",
        Origin: "http://e2e.invalid",
        traceparent: `00-${traceId}-0123456789abcdef-01`,
        "X-CSRF-Token": e2eTaskFixture.csrfToken,
      }, method: "POST" });
      const first = await request();
      const firstBody = await first.json() as { sourceCommandId?: string; status?: string };
      expect(first.status).toBe(202);
      expect(firstBody.status).toBe("accepted");
      expect(typeof firstBody.sourceCommandId).toBe("string");
      const duplicate = await request();
      expect(duplicate.status).toBe(202);
      const duplicateBody: unknown = await duplicate.json();
      expect(duplicateBody).toEqual(firstBody);
      expect(traces).toEqual([traceId, traceId]);

      const missingSession = await fetch(url, { headers: { "Idempotency-Key": "task-complete.e2e-api-0002" }, method: "POST" });
      expect(missingSession.status).toBe(401);
      expect(await missingSession.json()).toEqual({ code: "authentication_required" });

      const wrongCsrf = await fetch(url, { headers: {
        Cookie: `__Host-ai_crm_pc_session=${e2eTaskFixture.credential}`,
        "Idempotency-Key": "task-complete.e2e-api-0002",
        Origin: "http://e2e.invalid",
        "X-CSRF-Token": "x".repeat(43),
      }, method: "POST" });
      const wrongCsrfBody: unknown = await wrongCsrf.json();
      expect(wrongCsrfBody).toEqual({ code: "authentication_csrf_rejected" });
      expect(wrongCsrf.status).toBe(403);

      const secondCommand = await fetch(url, { headers: {
        Cookie: `__Host-ai_crm_pc_session=${e2eTaskFixture.credential}`,
        "Idempotency-Key": "task-complete.e2e-api-0002",
        Origin: "http://e2e.invalid",
        "X-CSRF-Token": e2eTaskFixture.csrfToken,
      }, method: "POST" });
      expect(secondCommand.status).toBe(503);
      expect(await secondCommand.json()).toEqual({ code: "TASK_SOURCE_UNAVAILABLE" });
    } finally {
      await application.stop();
    }
  });
});
