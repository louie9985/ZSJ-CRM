import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { request as httpRequest } from "node:http";
import type { OutgoingHttpHeaders } from "node:http";
import { AuthorizationDeniedError, AuthorizationUnavailableError } from "@ai-crm/platform-authorization";
import { TaskCenterError } from "@ai-crm/platform-task-center";
import { describe, expect, it, vi } from "vitest";
import type { ApiPlatformHttpComposition } from "./composition.js";
import { createApiApplication } from "./index.js";

const logger = { log: () => undefined };

function requestStatus(url: URL, options: { readonly headers?: OutgoingHttpHeaders | readonly string[]; readonly method?: string }): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers: options.headers, method: options.method }, (response) => {
      response.resume();
      response.on("end", () => { resolve(response.statusCode ?? 0); });
    });
    request.on("error", reject);
    request.end();
  });
}

function requestResult(url: URL, options: { readonly headers?: OutgoingHttpHeaders | readonly string[]; readonly method?: string }): Promise<Readonly<{ readonly status: number; readonly traceId?: string }>> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers: options.headers, method: options.method }, (response) => {
      response.resume();
      response.on("end", () => {
        const traceId = response.headers["x-trace-id"];
        resolve(Object.freeze({ status: response.statusCode ?? 0, ...(typeof traceId === "string" ? { traceId } : {}) }));
      });
    });
    request.on("error", reject);
    request.end();
  });
}

describe("API composition root", () => {
  it("exposes contract-shaped liveness and readiness", async () => {
    const app = createApiApplication({ dependencies: () => [{ name: "database", required: true, healthy: false }], logger });
    expect(app.health("liveness")).toEqual({ status: "ok" });
    expect(app.health("readiness")).toEqual({ status: "unavailable" });
    await app.start(0);
    const url = await app.instance()?.getUrl();
    if (url === undefined) throw new Error("api_not_started");
    const live = await fetch(`${url}/health/live`);
    const ready = await fetch(`${url}/health/ready`);
    const liveBody: unknown = await live.json();
    const readyBody: unknown = await ready.json();
    expect({ body: liveBody, status: live.status }).toEqual({ body: { status: "ok" }, status: 200 });
    expect({ body: readyBody, status: ready.status }).toEqual({ body: { status: "unavailable" }, status: 503 });
    await app.stop();
  });

  it("runs lifecycle hooks once and returns 404 for unregistered routes", async () => {
    const calls: string[] = [];
    const app = createApiApplication({ logger, onStart: () => { calls.push("start"); }, onStop: () => { calls.push("stop"); } });
    await app.start(0);
    expect(calls).toEqual(["start"]);
    await app.stop();
    await app.stop();
    expect(calls).toEqual(["start", "stop"]);
  });

  it("exposes the reviewed PC BFF HTTP adapter without returning credentials in bodies", async () => {
    const authentication = {
      beginLogin: vi.fn().mockResolvedValue({ headers: { Location: "https://identity.invalid/login" }, status: 302 }),
      beginReauthentication: vi.fn().mockResolvedValue({ headers: { Location: "https://identity.invalid/login?prompt=login" }, status: 302 }),
      completeLogin: vi.fn(),
      currentSession: vi.fn(),
      logout: vi.fn().mockResolvedValue({
        headers: { Location: "https://identity.invalid/logout", "Set-Cookie": "__Host-ai_crm_pc_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" },
        status: 302,
      }),
      refresh: vi.fn(),
    };
    const app = createApiApplication({
      authentication,
      authenticationCallbackUrl: (path) => `https://api.invalid${path}`,
      logger,
    });
    await app.start(0);
    const url = await app.instance()?.getUrl();
    if (url === undefined) throw new Error("api_not_started");
    const response = await fetch(`${url}/auth/pc/login?returnTo=%2Fworkspace`, { redirect: "manual" });
    expect({ body: await response.text(), location: response.headers.get("location"), status: response.status }).toEqual({
      body: "",
      location: "https://identity.invalid/login",
      status: 302,
    });
    expect(response.headers.get("x-trace-id")).toMatch(/^(?!0{32})[0-9a-f]{32}$/u);
    expect(authentication.beginLogin).toHaveBeenCalledWith("/workspace", response.headers.get("x-trace-id"));
    const reauthentication = await fetch(`${url}/auth/pc/reauthentication?returnTo=%2Faccount`, {
      headers: {
        cookie: `__Host-ai_crm_pc_session=${"c".repeat(43)}`,
        origin: "https://workbench.example.test",
        "x-csrf-token": "x".repeat(43),
      },
      method: "POST",
      redirect: "manual",
    });
    expect(reauthentication.status).toBe(302);
    expect(reauthentication.headers.get("location")).toBe("https://identity.invalid/login?prompt=login");
    const jsonReauthentication = await fetch(`${url}/auth/pc/reauthentication?returnTo=%2Faccount`, {
      headers: {
        accept: "application/json",
        cookie: `__Host-ai_crm_pc_session=${"c".repeat(43)}`,
        origin: "https://workbench.example.test",
        "x-csrf-token": "x".repeat(43),
      },
      method: "POST",
    });
    const jsonReauthenticationBody: unknown = await jsonReauthentication.json();
    expect({ body: jsonReauthenticationBody, location: jsonReauthentication.headers.get("location"), status: jsonReauthentication.status }).toEqual({
      body: { redirectUrl: "https://identity.invalid/login?prompt=login" },
      location: null,
      status: 200,
    });
    expect(authentication.beginReauthentication).toHaveBeenCalledWith(expect.objectContaining({
      cookie: `__Host-ai_crm_pc_session=${"c".repeat(43)}`,
      csrfToken: "x".repeat(43),
      origin: "https://workbench.example.test",
    }), "/account");
    const logout = await fetch(`${url}/auth/pc/logout`, {
      headers: {
        accept: "application/json",
        cookie: `__Host-ai_crm_pc_session=${"c".repeat(43)}`,
        origin: "https://workbench.example.test",
        "x-csrf-token": "x".repeat(43),
      },
      method: "POST",
    });
    const logoutBody: unknown = await logout.json();
    expect({ body: logoutBody, location: logout.headers.get("location"), status: logout.status }).toEqual({
      body: { redirectUrl: "https://identity.invalid/logout" },
      location: null,
      status: 200,
    });
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    await app.stop();
  });

  it("rejects repeated or out-of-contract authentication inputs before the adapter", async () => {
    const authentication = {
      beginLogin: vi.fn(), beginReauthentication: vi.fn(), completeLogin: vi.fn(), currentSession: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    };
    const app = createApiApplication({
      authentication,
      authenticationCallbackUrl: (path) => `https://api.invalid${path}`,
      logger,
    });
    await app.start(0, "127.0.0.1");
    const address = await app.instance()?.getUrl();
    if (address === undefined) throw new Error("api_not_started");
    expect((await fetch(`${address}/auth/pc/login?returnTo=%2Fa&returnTo=%2Fb`)).status).toBe(400);
    expect((await fetch(`${address}/auth/pc/callback?code=ok&state=short`)).status).toBe(400);
    expect((await fetch(`${address}/auth/pc/refresh`, { method: "POST" })).status).toBe(403);
    expect(await requestStatus(new URL("/auth/pc/logout", address), {
      headers: { origin: `https://${"a".repeat(513)}.invalid` },
      method: "POST",
    })).toBe(403);
    expect(await requestStatus(new URL("/auth/pc/session", address), {
      headers: { cookie: `session=${"a".repeat(4097)}` },
    })).toBe(401);
    expect(authentication.beginLogin).not.toHaveBeenCalled();
    expect(authentication.completeLogin).not.toHaveBeenCalled();
    expect(authentication.refresh).not.toHaveBeenCalled();
    expect(authentication.logout).not.toHaveBeenCalled();
    expect(authentication.currentSession).not.toHaveBeenCalled();
    await app.stop();
  });

  it("routes protected platform HTTP operations through the reviewed adapters", async () => {
    const authorize = vi.fn().mockResolvedValue({
      decision: { allowed: true },
      principal: {
        authenticationSubject: { issuer: "https://identity.invalid/realms/synthetic", subject: "subject-1" },
        clientId: "api",
        expiresAt: "2026-07-28T01:00:00.000Z",
        issuedAt: "2026-07-28T00:00:00.000Z",
      },
      workforce: {
        assignments: [],
        employmentIds: [],
        resolvedAt: "2026-07-28T00:00:00.000Z",
        subject: { issuer: "https://identity.invalid/realms/synthetic", subject: "subject-1" },
        workforcePersonId: "20000000-0000-4000-8000-000000000001",
      },
    });
    const applicationRegistry = {
      loadRegistry: vi.fn().mockResolvedValue({ body: { version: 1 }, headers: { "Cache-Control": "no-store" }, status: 200 }),
      resolveDeepLink: vi.fn(),
    };
    const forms = { handle: vi.fn().mockResolvedValue({ body: { valid: true }, headers: { "Cache-Control": "no-store" }, status: 200 }) };
    const fileCenter = {
      authorizeDownload: vi.fn(),
      confirmUpload: vi.fn(),
      createUpload: vi.fn().mockResolvedValue({ body: { replayed: false }, headers: { "Cache-Control": "no-store" }, status: 201 }),
    };
    const tasks = { list: vi.fn().mockResolvedValue({ items: [{ sourceTaskId: "task.synthetic", sourceType: "tests.synthetic", sourceVersion: 2, status: "completed" }] }) };
    const notifications = { list: vi.fn().mockResolvedValue({ items: [{ notificationId: "notification.synthetic", sourceId: "task.synthetic", sourceType: "tests.synthetic" }] }) };
    const validateFormMutation = vi.fn();
    const app = createApiApplication({
      logger,
      platformHttp: { applicationRegistry, authorize, fileCenter, forms, notifications, tasks, validateFormMutation, validateTaskMutation: vi.fn() },
    });
    await app.start(0, "127.0.0.1");
    const address = await app.instance()?.getUrl();
    if (address === undefined) throw new Error("api_not_started");
    const cookie = `__Host-ai_crm_pc_session=${"a".repeat(43)}`;

    const requestTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const registryResponse = await fetch(`${address}/application-registry`, { headers: {
      cookie,
      traceparent: `00-${requestTraceId}-00f067aa0ba902b7-01`,
    } });
    expect(registryResponse.status).toBe(200);
    expect(registryResponse.headers.get("x-trace-id")).toMatch(/^(?!0{32})[0-9a-f]{32}$/u);
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      credential: "a".repeat(43),
      permission: { action: "read", resource: "platform.app-registry.registry" },
      traceId: requestTraceId,
    }));
    expect(applicationRegistry.loadRegistry).toHaveBeenCalledWith(expect.objectContaining({
      workforcePersonId: "20000000-0000-4000-8000-000000000001",
      traceId: requestTraceId,
    }));
    const [taskResponse, notificationResponse] = await Promise.all([
      fetch(`${address}/tasks?limit=50&status=completed&cursor=cursor.synthetic`, { headers: { cookie, traceparent: `00-${requestTraceId}-00f067aa0ba902b7-01` } }),
      fetch(`${address}/notifications?limit=50&cursor=cursor.synthetic&includeArchived=true`, { headers: { cookie, traceparent: `00-${requestTraceId}-00f067aa0ba902b7-01` } }),
    ]);
    expect(taskResponse.status).toBe(200);
    expect(notificationResponse.status).toBe(200);
    const taskQuery = (tasks.list.mock.calls[0] as unknown as readonly [{ readonly actor: { readonly principalId: string; readonly workforcePersonId: string }; readonly limit: number }] | undefined)?.[0];
    const notificationQuery = (notifications.list.mock.calls[0] as unknown as readonly [{ readonly actor: { readonly principalId: string; readonly workforcePersonId: string }; readonly limit: number }] | undefined)?.[0];
    expect(taskQuery?.limit).toBe(50);
    expect(taskQuery).toMatchObject({ cursor: "cursor.synthetic", status: "completed" });
    expect(taskQuery?.actor.principalId).toMatch(/^subject:/u);
    expect(taskQuery?.actor.workforcePersonId).toBe("20000000-0000-4000-8000-000000000001");
    expect(notificationQuery?.limit).toBe(50);
    expect(notificationQuery).toMatchObject({ cursor: "cursor.synthetic", includeArchived: true });
    expect(notificationQuery?.actor.principalId).toMatch(/^subject:/u);
    expect(notificationQuery?.actor.workforcePersonId).toBe("20000000-0000-4000-8000-000000000001");
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      permission: { action: "list", resource: "platform.task-center.task-projection" },
    }));
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      permission: { action: "list", resource: "platform.notifications.in-app-notification" },
    }));

    for (const traceparent of [undefined, "malformed"] as const) {
      const response = await fetch(`${address}/application-registry`, { headers: {
        cookie,
        ...(traceparent === undefined ? {} : { traceparent }),
      } });
      const responseTraceId = response.headers.get("x-trace-id");
      expect(response.status).toBe(200);
      expect(responseTraceId).toMatch(/^(?!0{32})[0-9a-f]{32}$/u);
      expect(authorize).toHaveBeenLastCalledWith(expect.objectContaining({ traceId: responseTraceId }));
      expect(applicationRegistry.loadRegistry).toHaveBeenLastCalledWith(expect.objectContaining({ traceId: responseTraceId }));
    }
    const authorizationCallsBeforeRepeated = authorize.mock.calls.length;
    const repeated = await requestResult(new URL("/application-registry", address), {
      headers: ["Cookie", cookie, "traceparent", `00-${requestTraceId}-00f067aa0ba902b7-01`, "traceparent", `00-${"a".repeat(32)}-00f067aa0ba902b7-01`],
    });
    expect(repeated).toEqual({ status: 400 });
    expect(authorize).toHaveBeenCalledTimes(authorizationCallsBeforeRepeated);

    const releaseResponse = await fetch(`${address}/form-definitions/platform.synthetic/releases/1`, {
      headers: { cookie },
    });
    expect(releaseResponse.status).toBe(200);
    const releaseRequest = forms.handle.mock.calls[0]?.[0] as { readonly body?: Uint8Array; readonly path?: string };
    expect(releaseRequest.path).toBe("/form-definitions/platform.synthetic/releases/1");
    expect(releaseRequest.body).toBeUndefined();

    const rawFormBody = JSON.stringify({ data: { synthetic: "value" } });
    const formResponse = await fetch(`${address}/form-definitions/platform.synthetic/releases/1/validate`, {
      body: rawFormBody,
      headers: { "content-type": "application/json", cookie },
      method: "POST",
    });
    expect(formResponse.status).toBe(200);
    const formRequest = forms.handle.mock.calls[1]?.[0] as { readonly body?: Uint8Array; readonly path?: string };
    expect(formRequest.path).toBe("/form-definitions/platform.synthetic/releases/1/validate");
    expect(new TextDecoder().decode(formRequest.body)).toBe(rawFormBody);
    const withinContractBody = JSON.stringify({ data: "x".repeat(120_000) });
    expect((await fetch(`${address}/form-definitions/platform.synthetic/releases/1/validate`, {
      body: withinContractBody,
      headers: { "content-type": "application/json", cookie },
      method: "POST",
    })).status).toBe(200);
    const callsBeforeOversize = forms.handle.mock.calls.length;
    expect((await fetch(`${address}/form-definitions/platform.synthetic/releases/1/validate`, {
      body: JSON.stringify({ data: "x".repeat(270_000) }),
      headers: { "content-type": "application/json", cookie },
      method: "POST",
    })).status).toBe(413);
    expect(forms.handle).toHaveBeenCalledTimes(callsBeforeOversize);
    expect(validateFormMutation).not.toHaveBeenCalled();

    const uploadResponse = await fetch(`${address}/files/upload-sessions`, {
      body: JSON.stringify({ declaredMediaType: "text/plain", declaredSizeBytes: 1, displayName: "synthetic.txt", ownerModule: "platform.synthetic" }),
      headers: {
        "content-type": "application/json",
        cookie,
        "idempotency-key": "30000000-0000-4000-8000-000000000001",
        origin: "https://workbench.invalid",
        "x-csrf-token": "c".repeat(32),
      },
      method: "POST",
    });
    expect(uploadResponse.status).toBe(201);
    expect(fileCenter.createUpload).toHaveBeenCalledWith(expect.objectContaining({
      cookie,
      idempotencyKey: "30000000-0000-4000-8000-000000000001",
      origin: "https://workbench.invalid",
    }), expect.objectContaining({ ownerModule: "platform.synthetic" }));
    await app.stop();
  });

  it("fails Task and Notification lists closed without a session or when authorization is unavailable", async () => {
    const authorize = vi.fn().mockRejectedValue(new AuthorizationUnavailableError());
    const tasks = { list: vi.fn() };
    const notifications = { list: vi.fn() };
    const app = createApiApplication({
      logger,
      platformHttp: {
        applicationRegistry: { loadRegistry: vi.fn(), resolveDeepLink: vi.fn() }, authorize,
        fileCenter: { authorizeDownload: vi.fn(), confirmUpload: vi.fn(), createUpload: vi.fn() },
        forms: { handle: vi.fn() }, notifications, tasks,
        validateFormMutation: vi.fn(), validateTaskMutation: vi.fn(),
      },
    });
    await app.start(0, "127.0.0.1");
    try {
      const address = await app.instance()?.getUrl();
      if (address === undefined) throw new Error("api_not_started");
      const paths = ["/tasks", "/notifications"] as const;
      const unauthenticated = await Promise.all(paths.map((path) => fetch(`${address}${path}`)));
      expect(unauthenticated.map(({ status }) => status)).toEqual([401, 401]);
      const cookie = `__Host-ai_crm_pc_session=${"a".repeat(43)}`;
      const unavailable = await Promise.all(paths.map((path) => fetch(`${address}${path}`, { headers: { cookie } })));
      expect(unavailable.map(({ status }) => status)).toEqual([503, 503]);
      expect(tasks.list).not.toHaveBeenCalled();
      expect(notifications.list).not.toHaveBeenCalled();
      expect(authorize).toHaveBeenCalledTimes(2);
    } finally {
      await app.stop();
    }
  });

  it.each([
    ["/tasks?limit=0", "task_invalid_input"],
    ["/tasks?limit=1.5", "task_invalid_input"],
    ["/tasks?status=unknown", "task_invalid_input"],
    ["/tasks?status=open&status=completed", "task_invalid_input"],
    ["/tasks?cursor=", "task_invalid_input"],
    ["/notifications?limit=101", "notification_invalid_input"],
    ["/notifications?cursor=", "notification_invalid_input"],
    ["/notifications?cursor=one&cursor=two", "notification_invalid_input"],
    ["/notifications?includeArchived=TRUE", "notification_invalid_input"],
    ["/notifications?includeArchived=true&includeArchived=false", "notification_invalid_input"],
  ] as const)("rejects an invalid list query %s before authorization", async (path, code) => {
    const authorize = vi.fn();
    const tasks = { list: vi.fn() };
    const notifications = { list: vi.fn() };
    const app = createApiApplication({
      logger,
      platformHttp: {
        applicationRegistry: { loadRegistry: vi.fn(), resolveDeepLink: vi.fn() }, authorize,
        fileCenter: { authorizeDownload: vi.fn(), confirmUpload: vi.fn(), createUpload: vi.fn() },
        forms: { handle: vi.fn() }, notifications, tasks,
        validateFormMutation: vi.fn(), validateTaskMutation: vi.fn(),
      },
    });
    await app.start(0, "127.0.0.1");
    try {
      const address = await app.instance()?.getUrl();
      if (address === undefined) throw new Error("api_not_started");
      const response = await fetch(`${address}${path}`, { headers: { cookie: `__Host-ai_crm_pc_session=${"a".repeat(43)}` } });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ code });
      expect(authorize).not.toHaveBeenCalled();
      expect(tasks.list).not.toHaveBeenCalled();
      expect(notifications.list).not.toHaveBeenCalled();
    } finally {
      await app.stop();
    }
  });

  it("distinguishes Task authorization denial from unavailable authorization", async () => {
    const complete = vi.fn()
      .mockRejectedValueOnce(new AuthorizationDeniedError("decision-task-denied"))
      .mockRejectedValueOnce(new TaskCenterError("TASK_OPERATION_DENIED"))
      .mockRejectedValueOnce(new AuthorizationUnavailableError())
      .mockRejectedValueOnce(new TaskCenterError("TASK_AUTHORIZATION_FAILED", { retryable: true }));
    const app = createApiApplication({
      logger,
      platformHttp: {
        applicationRegistry: { loadRegistry: vi.fn(), resolveDeepLink: vi.fn() },
        authorize: vi.fn().mockResolvedValue({
          decision: { allowed: true, decisionId: "decision-task-http", evaluatedAt: "2026-07-31T00:00:00.000Z", policyVersion: "synthetic-v1", reason: "allowed" },
          principal: { authenticationSubject: { issuer: "https://identity.invalid/realms/synthetic", subject: "subject-task" }, clientId: "pc-web", expiresAt: "2026-08-01T00:00:00.000Z", issuedAt: "2026-07-31T00:00:00.000Z" },
          workforce: { assignments: [], employmentIds: [], resolvedAt: "2026-07-31T00:00:00.000Z", subject: { issuer: "https://identity.invalid/realms/synthetic", subject: "subject-task" }, workforcePersonId: "person-task" },
        }),
        fileCenter: { authorizeDownload: vi.fn(), confirmUpload: vi.fn(), createUpload: vi.fn() },
        forms: { handle: vi.fn() },
        tasks: { complete },
        validateFormMutation: vi.fn(),
        validateTaskMutation: vi.fn(),
      },
    });
    await app.start(0, "127.0.0.1");
    try {
      const address = await app.instance()?.getUrl();
      if (address === undefined) throw new Error("api_not_started");
      const request = () => fetch(`${address}/tasks/tests.walking-skeleton/source-task.synthetic/complete`, {
        headers: {
          cookie: `__Host-ai_crm_pc_session=${"a".repeat(43)}`,
          "idempotency-key": "task-complete.synthetic-0001",
          origin: "https://workbench.invalid",
          "x-csrf-token": "c".repeat(43),
        },
        method: "POST",
      });
      const emptyObject = await fetch(`${address}/tasks/tests.walking-skeleton/source-task.synthetic/complete`, {
        body: "{}",
        headers: {
          "content-type": "application/json",
          cookie: `__Host-ai_crm_pc_session=${"a".repeat(43)}`,
          "idempotency-key": "task-complete.synthetic-empty-body",
          origin: "https://workbench.invalid",
          "x-csrf-token": "c".repeat(43),
        },
        method: "POST",
      });
      expect(emptyObject.status).toBe(400);
      await expect(emptyObject.json()).resolves.toEqual({ code: "task_invalid_input" });
      const responses = [await request(), await request(), await request(), await request()];
      expect(responses.map((response) => response.status)).toEqual([403, 403, 503, 503]);
      const bodies = await Promise.all(responses.map(async (response) => response.json() as Promise<{ readonly code: string }>));
      expect(bodies.map((body) => body.code)).toEqual([
        "AUTHORIZATION_DENIED",
        "TASK_OPERATION_DENIED",
        "AUTHORIZATION_UNAVAILABLE",
        "TASK_AUTHORIZATION_FAILED",
      ]);
    } finally {
      await app.stop();
    }
  });

  it.each(["subject_not_associated", "employment_not_active", "assignment_not_active"])(
    "maps Task workforce denial %s to forbidden",
    async (code) => {
      const authorize = vi.fn().mockRejectedValue(Object.assign(new Error(code), { code }));
      const complete = vi.fn();
      const app = createApiApplication({
        logger,
        platformHttp: {
          applicationRegistry: { loadRegistry: vi.fn(), resolveDeepLink: vi.fn() },
          authorize,
          fileCenter: { authorizeDownload: vi.fn(), confirmUpload: vi.fn(), createUpload: vi.fn() },
          forms: { handle: vi.fn() },
          tasks: { complete },
          validateFormMutation: vi.fn(),
          validateTaskMutation: vi.fn(),
        },
      });
      await app.start(0, "127.0.0.1");
      try {
        const address = await app.instance()?.getUrl();
        if (address === undefined) throw new Error("api_not_started");
        const response = await fetch(`${address}/tasks/tests.walking-skeleton/source-task.synthetic/complete`, {
          headers: {
            cookie: `__Host-ai_crm_pc_session=${"a".repeat(43)}`,
            "idempotency-key": "task-complete.synthetic-workforce-denial",
            origin: "https://workbench.invalid",
            "x-csrf-token": "c".repeat(43),
          },
          method: "POST",
        });
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({ code });
        expect(complete).not.toHaveBeenCalled();
      } finally {
        await app.stop();
      }
    },
  );

  it("serializes concurrent starts", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const onStart = vi.fn(async () => { await gate; });
    const app = createApiApplication({ logger, onStart });
    const first = app.start(0);
    const second = app.start(0);
    release?.();
    await Promise.all([first, second]);
    expect(onStart).toHaveBeenCalledOnce();
    await app.stop();
  });

  it("fails readiness closed when dependency evaluation throws", async () => {
    const app = createApiApplication({ dependencies: () => { throw new Error("synthetic_dependency_failure"); }, logger });
    await app.start(0);
    const url = await app.instance()?.getUrl();
    if (url === undefined) throw new Error("api_not_started");
    const ready = await fetch(`${url}/health/ready`);
    expect({ body: await ready.json() as unknown, status: ready.status }).toEqual({ body: { status: "unavailable" }, status: 503 });
    await app.stop();
  });

  it("restarts only after an in-progress stop completes", async () => {
    let releaseStop: (() => void) | undefined;
    const stopGate = new Promise<void>((resolve) => { releaseStop = resolve; });
    const onStart = vi.fn();
    const app = createApiApplication({ logger, onStart, onStop: async () => { await stopGate; } });
    await app.start(0);
    const stopping = app.stop();
    const restarting = app.start(0);
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(onStart).toHaveBeenCalledOnce();
    releaseStop?.();
    await Promise.all([stopping, restarting]);
    expect(onStart).toHaveBeenCalledTimes(2);
    await app.stop();
  });

  it("cancels an in-progress startup before stopping", async () => {
    const app = createApiApplication({
      logger,
      onStart: (signal) => new Promise<void>((resolve) => { signal.addEventListener("abort", () => { resolve(); }, { once: true }); }),
      startupTimeoutMs: 100,
    });
    const starting = app.start(0);
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    const stopping = app.stop();
    const results = await Promise.allSettled([starting, stopping]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
    expect(app.health("readiness")).toEqual({ status: "unavailable" });
  });

  it("enters terminal state when failed-start cleanup rejects", async () => {
    const app = createApiApplication({
      logger,
      onStart: () => { throw new Error("synthetic_start_failure"); },
      onStop: () => { throw new Error("synthetic_cleanup_failure"); },
      startupTimeoutMs: 20,
    });
    await expect(app.start(0)).rejects.toThrow("synthetic_start_failure");
    await expect(app.start(0)).rejects.toThrow("api_terminal");
  });

  it("enters terminal state when failed-start cleanup times out", async () => {
    const app = createApiApplication({
      logger,
      onStart: () => { throw new Error("synthetic_start_failure"); },
      onStop: () => new Promise(() => undefined),
      startupTimeoutMs: 5,
    });
    await expect(app.start(0)).rejects.toThrow("synthetic_start_failure");
    await expect(app.start(0)).rejects.toThrow("api_terminal");
  });

  it("treats an uncooperative timed-out startup as terminal", async () => {
    const app = createApiApplication({
      logger,
      onStart: () => new Promise(() => undefined),
      startupTimeoutMs: 5,
    });
    await expect(app.start(0)).rejects.toThrow("api_start_timeout");
    await expect(app.start(0)).rejects.toThrow("api_terminal");
  });

  it("bounds stop and makes a timed-out application terminal", async () => {
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const candidate = {
      close,
      enableShutdownHooks: vi.fn(),
      listen: vi.fn(() => Promise.resolve()),
      useBodyParser: vi.fn(),
    } as unknown as INestApplication;
    const create = vi.spyOn(NestFactory, "create").mockResolvedValueOnce(candidate);
    try {
      const app = createApiApplication({ logger, shutdownTimeoutMs: 5 });
      await app.start(0);
      await expect(app.stop()).rejects.toThrow("api_stop_timeout");
      await expect(app.start(0)).rejects.toThrow("api_terminal");
    } finally {
      create.mockRestore();
    }
  });

  it("makes an application terminal when its stop hook rejects", async () => {
    const app = createApiApplication({ logger, onStop: () => { throw new Error("synthetic_stop_failure"); } });
    await app.start(0);
    await expect(app.stop()).rejects.toThrow("api_stop_failed");
    await expect(app.start(0)).rejects.toThrow("api_terminal");
  });

  it("exposes token-free workbench and workforce administration BFF bindings", async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      body: { kind: "ready", context: { displayName: "Synthetic Administrator" }, navigationIds: ["crm.workforce-administration"] },
      headers: { "Cache-Control": "no-store" },
      status: 200,
    });
    const load = vi.fn().mockResolvedValue({ body: { accounts: [], departments: [], positions: [] }, headers: { "Cache-Control": "no-store" }, status: 200 });
    const listAccounts = vi.fn().mockResolvedValue({ body: { items: [], page: 1, pageSize: 20, total: 0 }, headers: { "Cache-Control": "no-store" }, status: 200 });
    const execute = vi.fn();
    const app = createApiApplication({ logger, workbenchHttp: { bootstrap }, workforceAdministrationHttp: { execute, listAccounts, load } });
    await app.start(0, "127.0.0.1");
    const address = await app.instance()?.getUrl();
    if (address === undefined) throw new Error("api_not_started");
    const cookie = `__Host-ai_crm_pc_session=${"a".repeat(43)}`;
    const workbench = await fetch(`${address}/workbench/bootstrap`, { headers: { cookie } });
    const workforce = await fetch(`${address}/workforce-administration`, { headers: { cookie } });
    const workbenchBody: unknown = await workbench.json();
    const workforceBody: unknown = await workforce.json();
    expect({ body: workbenchBody, status: workbench.status }).toEqual({ body: { kind: "ready", context: { displayName: "Synthetic Administrator" }, navigationIds: ["crm.workforce-administration"] }, status: 200 });
    expect({ body: workforceBody, status: workforce.status }).toEqual({ body: { accounts: [], departments: [], positions: [] }, status: 200 });
    const bootstrapInput: unknown = bootstrap.mock.calls[0]?.[0];
    const loadInput: unknown = load.mock.calls[0]?.[0];
    expect(bootstrapInput).toMatchObject({ credential: "a".repeat(43) });
    expect(loadInput).toMatchObject({ credential: "a".repeat(43) });
    if (typeof bootstrapInput !== "object" || bootstrapInput === null || typeof loadInput !== "object" || loadInput === null) throw new Error("binding_input_missing");
    expect(Reflect.get(bootstrapInput, "traceId")).toMatch(/^[0-9a-f]{32}$/u);
    expect(Reflect.get(loadInput, "traceId")).toMatch(/^[0-9a-f]{32}$/u);
    expect((await fetch(`${address}/workforce-administration/commands`, { method: "POST" })).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    await app.stop();
  });

  it("revokes the current BFF session and clears its cookie after a system-account profile update", async () => {
    const execute = vi.fn().mockResolvedValue({ body: { replayed: false }, headers: { "Cache-Control": "no-store" }, status: 200 });
    const revokeBrowserSession = vi.fn().mockResolvedValue(undefined);
    const validateFormMutation = vi.fn().mockResolvedValue(undefined);
    const platformHttp = { validateFormMutation } as unknown as ApiPlatformHttpComposition;
    const app = createApiApplication({
      logger,
      platformHttp,
      revokeBrowserSession,
      workforceAdministrationHttp: { execute, listAccounts: vi.fn(), load: vi.fn() },
    });
    await app.start(0, "127.0.0.1");
    const address = await app.instance()?.getUrl();
    if (address === undefined) throw new Error("api_not_started");
    const credential = "a".repeat(43);
    const response = await fetch(`${address}/workforce-administration/commands`, {
      body: JSON.stringify({ accountId: "10000000-0000-4000-8000-000000000009", expectedRevision: 4, kind: "update_system_account", legalName: "ZSJ系统管理员", username: "system.admin.two" }),
      headers: {
        "content-type": "application/json",
        cookie: `__Host-ai_crm_pc_session=${credential}`,
        "idempotency-key": "30000000-0000-4000-8000-000000000001",
        origin: "https://workbench.example.test",
        "x-csrf-token": "c".repeat(32),
      },
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(revokeBrowserSession).toHaveBeenCalledWith(credential, response.headers.get("x-trace-id"));
    expect(execute).toHaveBeenCalledOnce();
    await app.stop();
  });

  it("closes a Nest application that is created after startup cancellation", async () => {
    let release: ((candidate: INestApplication) => void) | undefined;
    const delayedCandidate = new Promise<INestApplication>((resolve) => { release = resolve; });
    const close = vi.fn(() => Promise.resolve());
    const candidate = { close, enableShutdownHooks: vi.fn(), listen: vi.fn(), useBodyParser: vi.fn() } as unknown as INestApplication;
    const create = vi.spyOn(NestFactory, "create").mockReturnValueOnce(delayedCandidate);
    try {
      const app = createApiApplication({ logger, startupTimeoutMs: 100 });
      const starting = app.start(0);
      const startingOutcome = starting.then(() => undefined, (error: unknown) => error);
      await vi.waitFor(() => { expect(create).toHaveBeenCalledOnce(); });
      const stoppingOutcome = app.stop().then(() => undefined, (error: unknown) => error);
      const outcomes = await Promise.all([startingOutcome, stoppingOutcome]);
      expect(outcomes[0]).toBeInstanceOf(Error);
      expect(outcomes[1]).toBeUndefined();
      release?.(candidate);
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect(close).toHaveBeenCalledOnce();
      expect(app.instance()).toBeUndefined();
      expect(app.health("readiness")).toEqual({ status: "unavailable" });
    } finally {
      create.mockRestore();
    }
  });
});
