import { createHash } from "node:crypto";
import "reflect-metadata";
import { Controller, Get, Inject, Injectable, Module, Post, Put, Req, Res, type OnApplicationShutdown } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { DynamicModule, INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { evaluateHealth, extractTraceContext, injectTraceContext, type ApplicationLogger, type HealthDependency, type HealthResult, type TraceContext } from "@ai-crm/observability";
import type { PermissionRequest } from "@ai-crm/platform-authorization";
import type { RealtimeServer } from "./realtime/realtime-server.js";
import { BrowserSessionFailure } from "./auth/errors.js";
import { parsePcSessionCredential, type AuthenticationHttpResponse, type BrowserRequestContext, type PcAuthenticationHttpAdapter } from "./auth/http-adapter.js";
import { clearPcSessionCookie } from "./auth/session-security.js";
import type { ApiPlatformHttpComposition, AuthorizedOperationContext } from "./composition.js";

export {
  createOidcClient,
  createPcAuthenticationHttpAdapter,
  createPcBffSessionService,
  connectRedisSessionStore,
  createRedisBrowserSessionStore,
  type AuthenticationAuditPort,
  type PcAuthenticationHttpAdapter,
  type RedisSessionConnection,
} from "./auth/index.js";
export { createFormSchemaHttpAdapter, type FormSchemaHttpAdapter } from "./platform-http/form-schema-http.js";
export { createWorkbenchBootstrapFacade, type WorkbenchFacadeDependencies } from "./workbench/facade.js";
export { createWorkbenchHttpAdapter, type WorkbenchBootstrapFacade } from "./platform-http/workbench-http.js";
export { createWorkforceAdministrationHttpAdapter, type WorkforceAdministrationFacade } from "./platform-http/workforce-administration-http.js";
export { createRabbitRealtimeEventSource, createRealtimeServer, REALTIME_MAX_FRAME_BYTES, REALTIME_PATH, REALTIME_PROTOCOL, type RabbitRealtimeEventSource, type RealtimeEventSource, type RealtimeIdentity, type RealtimeReferenceEvent, type RealtimeServer, type RealtimeSnapshotReader } from "./realtime/index.js";

export const applicationId = "@ai-crm/api" as const;
const API_COMPOSITION = Symbol("api-composition");
const API_RUNTIME_STATE = Symbol("api-runtime-state");
const REQUEST_TRACE_CONTEXT = Symbol("api-request-trace-context");
interface ApiRuntimeState { ready: boolean; }

export interface ApiComposition {
  readonly authentication?: PcAuthenticationHttpAdapter;
  readonly authenticationCallbackUrl?: (requestPathAndQuery: string) => string;
  readonly dependencies?: () => readonly HealthDependency[];
  readonly logger: ApplicationLogger;
  readonly onStart?: (signal: AbortSignal) => void | Promise<void>;
  readonly onStop?: () => void | Promise<void>;
  readonly platformHttp?: Readonly<ApiPlatformHttpComposition>;
  readonly realtime?: RealtimeServer;
  readonly revokeBrowserSession?: (credential: string, traceId: string) => Promise<void>;
  readonly workbenchHttp?: Readonly<{
    bootstrap(input: Readonly<{ credential: string; traceId: string }>): Promise<PlatformHttpResponse>;
  }>;
  readonly workforceAdministrationHttp?: Readonly<{
    execute(input: Readonly<{ body: unknown; credential: string; idempotencyKey: string; traceId: string }>): Promise<PlatformHttpResponse>;
    listAccounts(input: Readonly<{ credential: string; query: unknown; traceId: string }>): Promise<PlatformHttpResponse>;
    load(input: Readonly<{ credential: string; traceId: string }>): Promise<PlatformHttpResponse>;
  }>;
  readonly shutdownTimeoutMs?: number;
  readonly startupTimeoutMs?: number;
}

interface PlatformHttpResponse {
  readonly body?: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

function sendPlatformResponse(response: Response, result: PlatformHttpResponse): void {
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  if (result.body === undefined) response.status(result.status).send();
  else response.status(result.status).json(result.body);
}

function stableActorId(context: Readonly<AuthorizedOperationContext>): string {
  const subject = context.principal.authenticationSubject;
  return `subject:${createHash("sha256").update(`${subject.issuer}\0${subject.subject}`).digest("hex")}`;
}

function credentialFromRequest(request: Request): string | undefined {
  const cookie = singleHeader(request, "cookie", 4096);
  if (!cookie.valid) return undefined;
  try { return parsePcSessionCredential(cookie.value); } catch { return undefined; }
}

function platformHeader(request: Request, name: string, maximumLength: number, minimumLength = 0): string | undefined {
  const result = singleHeader(request, name, maximumLength, minimumLength);
  return result.valid ? result.value : undefined;
}

interface RequestValue {
  readonly valid: boolean;
  readonly value?: string;
}

function singleHeader(request: Request, name: string, maximumLength: number, minimumLength = 0): RequestValue {
  let occurrences = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) occurrences += 1;
  }
  const value = request.headers[name];
  if (occurrences > 1 || Array.isArray(value)) return { valid: false };
  if (value === undefined) return { valid: minimumLength === 0 };
  return {
    valid: value.length >= minimumLength && value.length <= maximumLength && !/[\0\r\n]/u.test(value),
    value,
  };
}

function singleQuery(request: Request, name: string, maximumLength: number, minimumLength = 0): RequestValue {
  const value = request.query[name];
  if (value === undefined) return { valid: minimumLength === 0 };
  if (typeof value !== "string") return { valid: false };
  return { valid: value.length >= minimumLength && value.length <= maximumLength, value };
}

/**
 * Establishes the HTTP trace boundary for every BFF/API request. The
 * propagator validates the W3C value and creates a local child when absent or
 * malformed; only the opaque trace id is exposed back to callers. Cookies,
 * credentials and request bodies never enter this response header.
 */
function traceBoundary(request: Request, response: Response, next: NextFunction): void {
  const traceparent = singleHeader(request, "traceparent", 512);
  if (!traceparent.valid) {
    response.status(400).send();
    return;
  }
  const context = extractTraceContext({ traceparent: traceparent.value });
  Reflect.set(request, REQUEST_TRACE_CONTEXT, context);
  response.setHeader("X-Trace-Id", context.traceId);
  next();
}

function requestTraceContext(request: Request): TraceContext {
  const context = Reflect.get(request, REQUEST_TRACE_CONTEXT) as unknown;
  if (typeof context !== "object" || context === null) throw new Error("api_request_trace_context_missing");
  const traceId = Reflect.get(context, "traceId") as unknown;
  const spanId = Reflect.get(context, "spanId") as unknown;
  const traceFlags = Reflect.get(context, "traceFlags") as unknown;
  if (typeof traceId !== "string" || typeof spanId !== "string" || typeof traceFlags !== "number") {
    throw new Error("api_request_trace_context_missing");
  }
  return Object.freeze({ spanId, traceFlags, traceId });
}

function requestTraceparent(request: Request): string {
  const traceparent = injectTraceContext(requestTraceContext(request))["traceparent"];
  if (traceparent === undefined) throw new Error("api_request_trace_context_invalid");
  return traceparent;
}

function sendAuthenticationResponse(response: Response, result: AuthenticationHttpResponse): void {
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  if (result.body === undefined) response.status(result.status).send();
  else response.status(result.status).json(result.body);
}

const invalidCallbackResponse: AuthenticationHttpResponse = Object.freeze({
  body: Object.freeze({ code: "authentication_callback_invalid", message: "The authentication callback is invalid or expired." }),
  headers: Object.freeze({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }),
  status: 400,
});
const invalidCsrfResponse: AuthenticationHttpResponse = Object.freeze({
  body: Object.freeze({ code: "authentication_csrf_rejected", message: "The browser request failed security validation." }),
  headers: Object.freeze({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }),
  status: 403,
});
const invalidSessionResponse: AuthenticationHttpResponse = Object.freeze({
  body: Object.freeze({ code: "authentication_required", message: "Authentication is required." }),
  headers: Object.freeze({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }),
  status: 401,
});

@Controller("auth/pc")
class PcAuthenticationController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  private adapter(): PcAuthenticationHttpAdapter {
    if (this.composition.authentication === undefined) throw new Error("api_authentication_binding_missing");
    return this.composition.authentication;
  }

  @Get("login")
  async login(@Req() request: Request, @Res() response: Response): Promise<void> {
    const returnTo = singleQuery(request, "returnTo", 512);
    if (!returnTo.valid) {
      sendAuthenticationResponse(response, invalidCallbackResponse);
      return;
    }
    sendAuthenticationResponse(response, await this.adapter().beginLogin(returnTo.value, requestTraceContext(request).traceId));
  }

  @Get("callback")
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    const code = singleQuery(request, "code", 4096, 1);
    const state = singleQuery(request, "state", 512, 32);
    if (!code.valid || !state.valid) {
      sendAuthenticationResponse(response, invalidCallbackResponse);
      return;
    }
    const callbackUrl = this.composition.authenticationCallbackUrl?.(request.originalUrl);
    if (callbackUrl === undefined) throw new Error("api_authentication_callback_binding_missing");
    const cookie = singleHeader(request, "cookie", 4096);
    if (!cookie.valid) {
      sendAuthenticationResponse(response, invalidCallbackResponse);
      return;
    }
    sendAuthenticationResponse(response, await this.adapter().completeLogin(
      callbackUrl,
      requestTraceContext(request).traceId,
      cookie.value,
    ));
  }

  @Get("session")
  async session(@Req() request: Request, @Res() response: Response): Promise<void> {
    const cookie = singleHeader(request, "cookie", 4096);
    if (!cookie.valid) {
      sendAuthenticationResponse(response, invalidSessionResponse);
      return;
    }
    sendAuthenticationResponse(response, await this.adapter().currentSession(cookie.value));
  }

  @Post("refresh")
  async refresh(@Req() request: Request, @Res() response: Response): Promise<void> {
    const context = this.mutationContext(request, true);
    if (context.error) {
      sendAuthenticationResponse(response, context.error);
      return;
    }
    sendAuthenticationResponse(response, await this.adapter().refresh(context.value));
  }

  @Post("reauthentication")
  async reauthentication(@Req() request: Request, @Res() response: Response): Promise<void> {
    const returnTo = singleQuery(request, "returnTo", 512);
    const context = this.mutationContext(request, true);
    if (!returnTo.valid) {
      sendAuthenticationResponse(response, invalidCallbackResponse);
      return;
    }
    if (context.error) {
      sendAuthenticationResponse(response, context.error);
      return;
    }
    const adapter = this.adapter();
    if (adapter.beginReauthentication === undefined) {
      sendAuthenticationResponse(response, Object.freeze({
        body: Object.freeze({ code: "authentication_dependency_unavailable", message: "Authentication is temporarily unavailable." }),
        headers: Object.freeze({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }),
        status: 503,
      }));
      return;
    }
    const result = await adapter.beginReauthentication(context.value, returnTo.value);
    const accept = singleHeader(request, "accept", 512);
    if (!accept.valid) {
      sendAuthenticationResponse(response, invalidCallbackResponse);
      return;
    }
    if (result.status === 302 && accept.value?.split(",").some((value) => value.trim().split(";")[0] === "application/json")) {
      const redirectUrl = result.headers["Location"];
      if (redirectUrl === undefined || redirectUrl.length === 0 || redirectUrl.length > 4096 || /[\0\r\n]/u.test(redirectUrl)) {
        sendAuthenticationResponse(response, invalidCallbackResponse);
        return;
      }
      sendAuthenticationResponse(response, Object.freeze({
        body: Object.freeze({ redirectUrl }),
        headers: Object.freeze({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }),
        status: 200,
      }));
      return;
    }
    sendAuthenticationResponse(response, result);
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res() response: Response): Promise<void> {
    const context = this.mutationContext(request, false);
    if (context.error) {
      sendAuthenticationResponse(response, context.error);
      return;
    }
    const result = await this.adapter().logout(context.value);
    const accept = singleHeader(request, "accept", 512);
    if (!accept.valid) {
      sendAuthenticationResponse(response, invalidCallbackResponse);
      return;
    }
    if (result.status === 302 && accept.value?.split(",").some((value) => value.trim().split(";")[0] === "application/json")) {
      const redirectUrl = result.headers["Location"];
      if (redirectUrl === undefined || redirectUrl.length === 0 || redirectUrl.length > 4096 || /[\0\r\n]/u.test(redirectUrl)) {
        sendAuthenticationResponse(response, invalidCallbackResponse);
        return;
      }
      const setCookie = result.headers["Set-Cookie"];
      sendAuthenticationResponse(response, Object.freeze({
        body: Object.freeze({ redirectUrl }),
        headers: Object.freeze({
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          ...(setCookie === undefined ? {} : { "Set-Cookie": setCookie }),
        }),
        status: 200,
      }));
      return;
    }
    sendAuthenticationResponse(response, result);
  }

  private mutationContext(request: Request, csrfRequired: boolean):
    | { readonly error: AuthenticationHttpResponse; readonly value?: never }
    | { readonly error?: never; readonly value: BrowserRequestContext } {
    const cookie = singleHeader(request, "cookie", 4096);
    if (!cookie.valid) return { error: invalidSessionResponse };
    const csrfToken = singleHeader(request, "x-csrf-token", 512, csrfRequired ? 32 : 0);
    const origin = singleHeader(request, "origin", 512);
    const referer = singleHeader(request, "referer", 2048);
    if (!csrfToken.valid || !origin.valid || !referer.valid) return { error: invalidCsrfResponse };
    return { value: { cookie: cookie.value, csrfToken: csrfToken.value, origin: origin.value, referer: referer.value, traceId: requestTraceContext(request).traceId } };
  }
}

@Controller("authentication/session-policy")
class PcSessionPolicyController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Get()
  async get(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const credential = credentialFromRequest(request);
      const http = this.composition.platformHttp;
      if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
      if (http?.sessionPolicy === undefined) throw new Error("session_policy_unavailable");
      const traceId = requestTraceContext(request).traceId;
      const context = await http.authorize({ at: new Date().toISOString(), credential, permission: { action: "read", resource: "platform.authentication.session-policy" }, traceId });
      const assignmentId = context.workforce.assignments[0]?.assignmentId;
      const policy = await http.sessionPolicy.get({ actor: { actorId: context.workforce.workforcePersonId, actorType: "authenticated_subject", ...(assignmentId === undefined ? {} : { assignmentId }) } });
      sendPlatformResponse(response, { body: policy, headers: { "Cache-Control": "no-store" }, status: 200 });
    } catch (error) { sendPlatformResponse(response, sessionPolicyError(error)); }
  }

  @Put()
  async update(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const credential = credentialFromRequest(request);
      const http = this.composition.platformHttp;
      const operation = singleHeader(request, "idempotency-key", 128, 36);
      const csrf = singleHeader(request, "x-csrf-token", 512, 32);
      const origin = singleHeader(request, "origin", 512, 1);
      const referer = singleHeader(request, "referer", 2048, 1);
      const body = request.body as unknown;
      const validBody = typeof body === "object" && body !== null && !Array.isArray(body) && Object.keys(body).length === 2 && Number.isSafeInteger(Reflect.get(body, "concurrentLimit")) && Number.isSafeInteger(Reflect.get(body, "revocationTargetSeconds"));
      if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
      if (!operation.valid || operation.value === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(operation.value) || !csrf.valid || !origin.valid || !referer.valid || !validBody) throw Object.assign(new Error("session_policy_invalid"), { code: "session_policy_invalid" });
      if (http?.sessionPolicy === undefined || http.validateNotificationMutation === undefined) throw new Error("session_policy_unavailable");
      const traceId = requestTraceContext(request).traceId;
      await http.validateNotificationMutation({ credential, ...(csrf.value === undefined ? {} : { csrfToken: csrf.value }), ...(origin.value === undefined ? {} : { origin: origin.value }), ...(referer.value === undefined ? {} : { referer: referer.value }) });
      const context = await http.authorize({ at: new Date().toISOString(), credential, permission: { action: "manage", resource: "platform.authentication.session-policy" }, traceId });
      const assignmentId = context.workforce.assignments[0]?.assignmentId;
      const policy = await http.sessionPolicy.update({ actor: { actorId: context.workforce.workforcePersonId, actorType: "authenticated_subject", ...(assignmentId === undefined ? {} : { assignmentId }) }, concurrentLimit: Reflect.get(body, "concurrentLimit") as number, operationId: operation.value, reason: "pc_session_policy_updated", revocationTargetSeconds: Reflect.get(body, "revocationTargetSeconds") as number, traceId });
      sendPlatformResponse(response, { body: policy, headers: { "Cache-Control": "no-store" }, status: 200 });
    } catch (error) { sendPlatformResponse(response, sessionPolicyError(error)); }
  }
}

function sessionPolicyError(error: unknown): PlatformHttpResponse {
  const code = typeof error === "object" && error !== null ? String(Reflect.get(error, "code") ?? Reflect.get(error, "message") ?? "") : "";
  const name: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "name") as unknown : undefined;
  const status = error instanceof BrowserSessionFailure ? 401
    : code === "authentication_csrf_rejected" || code === "configuration_denied" || code === "AUTHORIZATION_DENIED" || name === "AuthorizationDeniedError" ? 403
      : code === "session_policy_invalid" || code === "configuration_invalid_input" ? 400
        : code === "configuration_operation_conflict" || code === "configuration_overlap" ? 409 : 503;
  return Object.freeze({ body: Object.freeze({ code: code || "session_policy_unavailable" }), headers: Object.freeze({ "Cache-Control": "no-store" }), status });
}

function unavailablePlatformResponse(code: string): PlatformHttpResponse {
  return Object.freeze({ body: Object.freeze({ code }), headers: Object.freeze({ "Cache-Control": "no-store" }), status: 503 });
}

@Controller("workbench")
class WorkbenchController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Get("bootstrap")
  async bootstrap(@Req() request: Request, @Res() response: Response): Promise<void> {
    const credential = credentialFromRequest(request);
    if (credential === undefined) {
      sendPlatformResponse(response, { body: { code: "authentication_required" }, headers: { "Cache-Control": "no-store" }, status: 401 });
      return;
    }
    const binding = this.composition.workbenchHttp;
    sendPlatformResponse(response, binding === undefined
      ? unavailablePlatformResponse("workbench_unavailable")
      : await binding.bootstrap({ credential, traceId: requestTraceContext(request).traceId }));
  }
}

@Controller("workforce-administration")
class WorkforceAdministrationController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Get()
  async load(@Req() request: Request, @Res() response: Response): Promise<void> {
    const credential = credentialFromRequest(request);
    if (credential === undefined) {
      sendPlatformResponse(response, { body: { code: "authentication_required" }, headers: { "Cache-Control": "no-store" }, status: 401 });
      return;
    }
    const binding = this.composition.workforceAdministrationHttp;
    sendPlatformResponse(response, binding === undefined
      ? unavailablePlatformResponse("workforce_administration_unavailable")
      : await binding.load({ credential, traceId: requestTraceContext(request).traceId }));
  }

  @Get("accounts")
  async listAccounts(@Req() request: Request, @Res() response: Response): Promise<void> {
    const credential = credentialFromRequest(request);
    if (credential === undefined) {
      sendPlatformResponse(response, { body: { code: "authentication_required" }, headers: { "Cache-Control": "no-store" }, status: 401 });
      return;
    }
    const binding = this.composition.workforceAdministrationHttp;
    sendPlatformResponse(response, binding === undefined
      ? unavailablePlatformResponse("workforce_administration_unavailable")
      : await binding.listAccounts({ credential, query: request.query, traceId: requestTraceContext(request).traceId }));
  }

  @Post("commands")
  async execute(@Req() request: Request, @Res() response: Response): Promise<void> {
    const credential = credentialFromRequest(request);
    const csrfToken = singleHeader(request, "x-csrf-token", 512, 32);
    const idempotencyKey = singleHeader(request, "idempotency-key", 64, 36);
    const origin = singleHeader(request, "origin", 512);
    const referer = singleHeader(request, "referer", 2048);
    if (credential === undefined || !csrfToken.valid || !idempotencyKey.valid || idempotencyKey.value === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(idempotencyKey.value) || !origin.valid || !referer.valid) {
      sendPlatformResponse(response, { body: { code: "workforce_administration_request_invalid" }, headers: { "Cache-Control": "no-store" }, status: credential === undefined ? 401 : 400 });
      return;
    }
    try {
      await platform(this.composition).validateFormMutation({
        credential,
        ...(csrfToken.value === undefined ? {} : { csrfToken: csrfToken.value }),
        ...(origin.value === undefined ? {} : { origin: origin.value }),
        ...(referer.value === undefined ? {} : { referer: referer.value }),
      });
    } catch {
      sendPlatformResponse(response, { body: { code: "workforce_administration_csrf_rejected" }, headers: { "Cache-Control": "no-store" }, status: 403 });
      return;
    }
    const requestBody: unknown = request.body;
    const commandKind: unknown = typeof requestBody === "object" && requestBody !== null && !Array.isArray(requestBody)
      ? Object.getOwnPropertyDescriptor(requestBody, "kind")?.value as unknown
      : undefined;
    const revokeCurrentSession = commandKind === "update_system_account";
    if (revokeCurrentSession && this.composition.revokeBrowserSession === undefined) {
      sendPlatformResponse(response, unavailablePlatformResponse("workforce_administration_unavailable"));
      return;
    }
    const binding = this.composition.workforceAdministrationHttp;
    const traceId = requestTraceContext(request).traceId;
    const result = binding === undefined
      ? unavailablePlatformResponse("workforce_administration_unavailable")
      : await binding.execute({ body: request.body, credential, idempotencyKey: idempotencyKey.value, traceId });
    if (revokeCurrentSession && result.status === 200) {
      try {
        await this.composition.revokeBrowserSession?.(credential, traceId);
        sendPlatformResponse(response, Object.freeze({ ...result, headers: Object.freeze({ ...result.headers, "Set-Cookie": clearPcSessionCookie() }) }));
      } catch {
        sendPlatformResponse(response, unavailablePlatformResponse("workforce_administration_session_revocation_failed"));
      }
      return;
    }
    sendPlatformResponse(response, result);
  }
}

function platform(composition: ApiComposition): Readonly<ApiPlatformHttpComposition> {
  if (composition.platformHttp === undefined) throw new Error("api_platform_http_binding_missing");
  return composition.platformHttp;
}

function registryAuthorizationFailure(error: unknown): PlatformHttpResponse {
  const unavailable = error instanceof BrowserSessionFailure && error.code === "authentication_dependency_unavailable";
  const unauthorized = error instanceof BrowserSessionFailure && !unavailable;
  const forbidden = !unauthorized && !unavailable && typeof error === "object" && error !== null &&
    (Reflect.get(error, "name") === "AuthorizationDeniedError" ||
      ["subject_not_associated", "employment_not_active", "assignment_not_active"].includes(String(Reflect.get(error, "code"))));
  const status = unauthorized ? 401 : forbidden ? 403 : 503;
  const code = unauthorized ? "app_registry_unauthorized" : forbidden ? "app_registry_denied" : "app_registry_unavailable";
  return Object.freeze({
    body: Object.freeze({ code }),
    headers: Object.freeze({ "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'" }),
    status,
  });
}

@Controller("application-registry")
class ApplicationRegistryController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  private async context(request: Request, permission: PermissionRequest): Promise<Readonly<{
    readonly activeAssignmentIds: readonly string[];
    readonly actorId: string;
    readonly traceId: string;
    readonly workforcePersonId: string;
  }>> {
    const credential = credentialFromRequest(request);
    if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
    const traceId = requestTraceContext(request).traceId;
    const authorized = await platform(this.composition).authorize({
      at: new Date().toISOString(),
      credential,
      permission,
      traceId,
    });
    return Object.freeze({
      activeAssignmentIds: Object.freeze(authorized.workforce.assignments.map((assignment) => assignment.assignmentId)),
      actorId: stableActorId(authorized),
      traceId,
      workforcePersonId: authorized.workforce.workforcePersonId,
    });
  }

  @Get()
  async load(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const context = await this.context(request, { action: "read", resource: "platform.app-registry.registry" });
      sendPlatformResponse(response, await platform(this.composition).applicationRegistry.loadRegistry(context));
    } catch (error) { sendPlatformResponse(response, registryAuthorizationFailure(error)); }
  }

  @Post("deep-links/resolve")
  async resolve(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const context = await this.context(request, { action: "resolve", resource: "platform.app-registry.deep-link" });
      sendPlatformResponse(response, await platform(this.composition).applicationRegistry.resolveDeepLink(context, request.body));
    } catch (error) { sendPlatformResponse(response, registryAuthorizationFailure(error)); }
  }
}

@Controller("form-definitions")
class FormSchemaController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  private request(request: Request, operation: "read" | "validate"): Parameters<ApiPlatformHttpComposition["forms"]["handle"]>[0] {
    const rawBody = Reflect.get(request, "rawBody") as unknown;
    const contentType = platformHeader(request, "content-type", 128);
    const credential = credentialFromRequest(request);
    const traceparent = requestTraceparent(request);
    const canonicalPath = `/form-definitions/${String(request.params["definitionId"])}/releases/${String(request.params["releaseVersion"])}${operation === "validate" ? "/validate" : ""}`;
    const queryOffset = request.originalUrl.indexOf("?");
    const rawPath = queryOffset === -1 ? request.originalUrl : request.originalUrl.slice(0, queryOffset);
    const path = rawPath.endsWith(canonicalPath)
      ? `${canonicalPath}${queryOffset === -1 ? "" : request.originalUrl.slice(queryOffset)}`
      : request.originalUrl;
    return {
      at: new Date().toISOString(),
      ...(request.method === "POST" && rawBody instanceof Uint8Array && rawBody.byteLength > 0 ? { body: rawBody } : {}),
      ...(contentType === undefined ? {} : { contentType }),
      ...(credential === undefined ? {} : { credential }),
      method: request.method,
      path,
      traceparent,
    };
  }

  @Get(":definitionId/releases/:releaseVersion")
  async release(@Req() request: Request, @Res() response: Response): Promise<void> {
    sendPlatformResponse(response, await platform(this.composition).forms.handle(this.request(request, "read")));
  }

  @Post(":definitionId/releases/:releaseVersion/validate")
  async validate(@Req() request: Request, @Res() response: Response): Promise<void> {
    sendPlatformResponse(response, await platform(this.composition).forms.handle(this.request(request, "validate")));
  }
}

@Controller("__e2e/walking-skeleton")
class WalkingSkeletonFormSubmissionController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Post("form-submissions")
  async submit(@Req() request: Request, @Res() response: Response): Promise<void> {
    const adapter = this.composition.platformHttp?.walkingSkeletonFormSubmissions;
    if (adapter === undefined) {
      sendPlatformResponse(response, { body: { code: "not_found" }, headers: { "Cache-Control": "no-store" }, status: 404 });
      return;
    }
    const rawBody = Reflect.get(request, "rawBody") as unknown;
    const contentType = singleHeader(request, "content-type", 128, 1);
    const csrfToken = singleHeader(request, "x-csrf-token", 512);
    const idempotencyKey = singleHeader(request, "idempotency-key", 255, 1);
    const origin = singleHeader(request, "origin", 512);
    const referer = singleHeader(request, "referer", 2048);
    if (!contentType.valid || !csrfToken.valid || !idempotencyKey.valid || !origin.valid || !referer.valid) {
      sendPlatformResponse(response, { body: { code: "submission_request_invalid" }, headers: { "Cache-Control": "no-store" }, status: 400 });
      return;
    }
    const credential = credentialFromRequest(request);
    sendPlatformResponse(response, await adapter.handle({
      ...(rawBody instanceof Uint8Array ? { body: rawBody } : {}),
      ...(contentType.value === undefined ? {} : { contentType: contentType.value }),
      ...(credential === undefined ? {} : { credential }),
      ...(csrfToken.value === undefined ? {} : { csrfToken: csrfToken.value }),
      ...(idempotencyKey.value === undefined ? {} : { idempotencyKey: idempotencyKey.value }),
      method: request.method,
      ...(origin.value === undefined ? {} : { origin: origin.value }),
      ...(referer.value === undefined ? {} : { referer: referer.value }),
      traceparent: requestTraceparent(request),
    }));
  }
}

@Controller("files")
class FileCenterController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  private context(request: Request) {
    return Object.freeze({
      cookie: platformHeader(request, "cookie", 4096),
      csrfToken: platformHeader(request, "x-csrf-token", 512),
      idempotencyKey: platformHeader(request, "idempotency-key", 64),
      origin: platformHeader(request, "origin", 512),
      referer: platformHeader(request, "referer", 2048),
      traceparent: requestTraceparent(request),
    });
  }

  @Post("upload-sessions")
  async createUpload(@Req() request: Request, @Res() response: Response): Promise<void> {
    sendPlatformResponse(response, await platform(this.composition).fileCenter.createUpload(this.context(request), request.body));
  }

  @Post("upload-sessions/:sessionId/confirm")
  async confirmUpload(@Req() request: Request, @Res() response: Response): Promise<void> {
    sendPlatformResponse(response, await platform(this.composition).fileCenter.confirmUpload(this.context(request), request.params["sessionId"]));
  }

  @Post("download-grants")
  async download(@Req() request: Request, @Res() response: Response): Promise<void> {
    sendPlatformResponse(response, await platform(this.composition).fileCenter.authorizeDownload(this.context(request), request.body));
  }
}

const TASK_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u;
const TASK_IDEMPOTENCY = TASK_REF;
const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function operationUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16] ?? "0", 16) & 3) | 8).toString(16);
  return `${bytes.slice(0, 8).join("")}-${bytes.slice(8, 12).join("")}-${bytes.slice(12, 16).join("")}-${bytes.slice(16, 20).join("")}-${bytes.slice(20).join("")}`;
}

function taskResponseError(error: unknown): PlatformHttpResponse {
  const code = typeof error === "object" && error !== null ? String(Reflect.get(error, "code") ?? "") : "";
  const workforceDenied = code === "subject_not_associated"
    || code === "employment_not_active"
    || code === "assignment_not_active";
  const denied = code === "AUTHORIZATION_DENIED"
    || code === "TASK_OPERATION_DENIED"
    || workforceDenied
    || (typeof error === "object" && error !== null && Reflect.get(error, "name") === "AuthorizationDeniedError");
  const status = code === "authentication_csrf_rejected" ? 403
    : denied ? 403
    : code.includes("INPUT_INVALID") ? 400
    : code.includes("NOT_FOUND") ? 404
      : code.includes("CONFLICT") || code.includes("IN_PROGRESS") ? 409
        : error instanceof BrowserSessionFailure ? 401 : 503;
  return Object.freeze({ body: Object.freeze({ code: code || "task_unavailable" }), headers: Object.freeze({ "Cache-Control": "no-store" }), status });
}

@Controller("tasks")
class TaskController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Get()
  async list(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const credential = credentialFromRequest(request);
      if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
      const limitValue = singleQuery(request, "limit", 3);
      const statusValue = singleQuery(request, "status", 9);
      const cursorValue = singleQuery(request, "cursor", 511);
      const limit = Number(limitValue.value ?? 50);
      const status = statusValue.value;
      if (!limitValue.valid || (limitValue.value !== undefined && (!/^\d{1,3}$/u.test(limitValue.value) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100))
        || !statusValue.valid || (status !== undefined && !["cancelled", "completed", "open"].includes(status))
        || !cursorValue.valid || cursorValue.value === "") {
        sendPlatformResponse(response, { body: { code: "task_invalid_input" }, headers: { "Cache-Control": "no-store" }, status: 400 });
        return;
      }
      const traceContext = requestTraceContext(request);
      const traceId = traceContext.traceId;
      const authorized = await platform(this.composition).authorize({
        at: new Date().toISOString(), credential, traceId,
        permission: { action: "list", resource: "platform.task-center.task-projection" },
      });
      const list = platform(this.composition).tasks?.list;
      if (typeof list !== "function") throw new Error("task_list_binding_missing");
      const body = await list({
        actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map(({ assignmentId }) => assignmentId) },
        limit,
        ...(status === undefined ? {} : { status: status as "cancelled" | "completed" | "open" }),
        ...(cursorValue.value === undefined ? {} : { cursor: cursorValue.value }),
      });
      sendPlatformResponse(response, { body, headers: { "Cache-Control": "no-store", "X-Trace-Id": traceId }, status: 200 });
    } catch (error) { sendPlatformResponse(response, taskResponseError(error)); }
  }

  @Post(":sourceType/:sourceTaskId/complete")
  async complete(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const sourceType = typeof request.params["sourceType"] === "string" ? request.params["sourceType"] : undefined;
      const sourceTaskId = typeof request.params["sourceTaskId"] === "string" ? request.params["sourceTaskId"] : undefined;
      const idempotencyKey = singleHeader(request, "idempotency-key", 255, 1);
      const csrfToken = singleHeader(request, "x-csrf-token", 512);
      const origin = singleHeader(request, "origin", 512);
      const referer = singleHeader(request, "referer", 2048);
      const credential = credentialFromRequest(request);
      const body = request.body as unknown;
      const bodyRecord = typeof body === "object" && body !== null && !Array.isArray(body) ? body as Readonly<Record<string, unknown>> : undefined;
      const bodyKeys = bodyRecord === undefined ? [] : Object.keys(bodyRecord);
      const sourceCommandReference = bodyRecord?.["sourceCommandReference"];
      const bodyValid = body === undefined || (bodyRecord !== undefined && bodyKeys.length === 1 && bodyKeys[0] === "sourceCommandReference" && typeof sourceCommandReference === "string" && TASK_REF.test(sourceCommandReference));
      if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
      if (!bodyValid || sourceType === undefined || sourceTaskId === undefined || !TASK_REF.test(sourceType) || !TASK_REF.test(sourceTaskId) || !idempotencyKey.valid || idempotencyKey.value === undefined || !TASK_IDEMPOTENCY.test(idempotencyKey.value) || !csrfToken.valid || !origin.valid || !referer.valid) {
        sendPlatformResponse(response, { body: { code: "task_invalid_input" }, headers: { "Cache-Control": "no-store" }, status: 400 });
        return;
      }
      await platform(this.composition).validateTaskMutation({
        credential,
        ...(csrfToken.value === undefined ? {} : { csrfToken: csrfToken.value }),
        ...(origin.value === undefined ? {} : { origin: origin.value }),
        ...(referer.value === undefined ? {} : { referer: referer.value }),
      });
      const traceId = requestTraceContext(request).traceId;
      const authorized = await platform(this.composition).authorize({
        at: new Date().toISOString(), credential, traceId,
        permission: { action: "complete", resource: "platform.task-center.task-projection" },
      });
      const command = {
        actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map((assignment) => assignment.assignmentId) },
        sourceType, sourceTaskId, idempotencyKey: idempotencyKey.value,
        ...(typeof sourceCommandReference === "string" ? { sourceCommandReference } : {}),
      };
      const completeWithTrace = platform(this.composition).taskCompletionWithTrace;
      const complete = platform(this.composition).tasks?.complete;
      const result = typeof completeWithTrace === "function"
        ? await completeWithTrace(command, requestTraceparent(request))
        : typeof complete === "function"
          ? await complete(command)
          : (() => { throw new Error("task_completion_binding_missing"); })();
      sendPlatformResponse(response, { body: result, headers: { "Cache-Control": "no-store" }, status: 202 });
    } catch (error) { sendPlatformResponse(response, taskResponseError(error)); }
  }
}

@Controller("notifications")
class NotificationController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Get()
  async list(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const credential = credentialFromRequest(request);
      if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
      const limitValue = singleQuery(request, "limit", 3);
      const cursorValue = singleQuery(request, "cursor", 128);
      const includeArchivedValue = singleQuery(request, "includeArchived", 5);
      const limit = Number(limitValue.value ?? 50);
      const includeArchived = includeArchivedValue.value === "true";
      if (!limitValue.valid || (limitValue.value !== undefined && (!/^\d{1,3}$/u.test(limitValue.value) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100))
        || !cursorValue.valid || cursorValue.value === "" || !includeArchivedValue.valid
        || (includeArchivedValue.value !== undefined && includeArchivedValue.value !== "true" && includeArchivedValue.value !== "false")) {
        sendPlatformResponse(response, { body: { code: "notification_invalid_input" }, headers: { "Cache-Control": "no-store" }, status: 400 });
        return;
      }
      const traceId = requestTraceContext(request).traceId;
      const authorized = await platform(this.composition).authorize({
        at: new Date().toISOString(), credential, traceId,
        permission: { action: "list", resource: "platform.notifications.in-app-notification" },
      });
      const list = platform(this.composition).notifications?.list;
      if (typeof list !== "function") throw new Error("notification_list_binding_missing");
      const body = await list({
        actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map(({ assignmentId }) => assignmentId) },
        limit,
        includeArchived,
        ...(cursorValue.value === undefined ? {} : { cursor: cursorValue.value }),
      });
      sendPlatformResponse(response, { body, headers: { "Cache-Control": "no-store", "X-Trace-Id": traceId }, status: 200 });
    } catch (error) { sendPlatformResponse(response, taskResponseError(error)); }
  }

  @Get("unread-count")
  async unreadCount(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const { actor: notificationActor, traceId } = await this.authorizedActor(request, { action: "list", resource: "platform.notifications.in-app-notification" });
      const unreadCount = platform(this.composition).notifications?.unreadCount;
      if (typeof unreadCount !== "function") throw new Error("notification_unread_count_binding_missing");
      sendPlatformResponse(response, { body: { count: await unreadCount(notificationActor) }, headers: { "Cache-Control": "no-store", "X-Trace-Id": traceId }, status: 200 });
    } catch (error) { sendPlatformResponse(response, taskResponseError(error)); }
  }

  @Get(":notificationId")
  async get(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const notificationId = request.params["notificationId"];
      if (typeof notificationId !== "string" || !UUID_VALUE.test(notificationId)) throw new Error("NOTIFICATION_INPUT_INVALID");
      const { actor: notificationActor, traceId } = await this.authorizedActor(request, { action: "read", resource: "platform.notifications.in-app-notification" });
      const get = platform(this.composition).notifications?.get;
      if (typeof get !== "function") throw new Error("notification_get_binding_missing");
      sendPlatformResponse(response, { body: await get(notificationActor, notificationId), headers: { "Cache-Control": "no-store", "X-Trace-Id": traceId }, status: 200 });
    } catch (error) { sendPlatformResponse(response, taskResponseError(error)); }
  }

  @Post(":notificationId/read")
  async markRead(@Req() request: Request, @Res() response: Response): Promise<void> { await this.changeState(request, response, "mark-read"); }

  @Post(":notificationId/archive")
  async archive(@Req() request: Request, @Res() response: Response): Promise<void> { await this.changeState(request, response, "archive"); }

  private async changeState(request: Request, response: Response, action: "archive" | "mark-read"): Promise<void> {
    try {
      const notificationId = request.params["notificationId"];
      if (typeof notificationId !== "string" || !UUID_VALUE.test(notificationId)) throw new Error("NOTIFICATION_INPUT_INVALID");
      const credential = credentialFromRequest(request);
      if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
      await platform(this.composition).validateNotificationMutation?.({ credential, ...this.mutationHeaders(request) });
      const { actor: notificationActor, traceId } = await this.authorizedActor(request, { action, resource: "platform.notifications.in-app-notification" });
      const operation = action === "archive" ? platform(this.composition).notifications?.archive : platform(this.composition).notifications?.markRead;
      if (typeof operation !== "function") throw new Error("notification_mutation_binding_missing");
      sendPlatformResponse(response, { body: await operation({ actor: notificationActor, notificationId }), headers: { "Cache-Control": "no-store", "X-Trace-Id": traceId }, status: 200 });
    } catch (error) { sendPlatformResponse(response, taskResponseError(error)); }
  }

  private mutationHeaders(request: Request): { readonly csrfToken?: string; readonly origin?: string; readonly referer?: string } {
    const csrfToken = singleHeader(request, "x-csrf-token", 512, 32);
    const origin = singleHeader(request, "origin", 512, 1);
    const referer = singleHeader(request, "referer", 2048, 1);
    if (!csrfToken.valid || !origin.valid || !referer.valid) throw new BrowserSessionFailure("authentication_csrf_rejected");
    return { ...(csrfToken.value === undefined ? {} : { csrfToken: csrfToken.value }), ...(origin.value === undefined ? {} : { origin: origin.value }), ...(referer.value === undefined ? {} : { referer: referer.value }) };
  }

  private async authorizedActor(request: Request, permission: PermissionRequest): Promise<{ readonly actor: { readonly principalId: string; readonly workforcePersonId: string; readonly activeAssignmentIds: readonly string[] }; readonly traceId: string }> {
    const credential = credentialFromRequest(request);
    if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
    const traceId = requestTraceContext(request).traceId;
    const authorized = await platform(this.composition).authorize({ at: new Date().toISOString(), credential, traceId, permission });
    return { actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map(({ assignmentId }) => assignmentId) }, traceId };
  }
}

@Controller("notification-templates")
class NotificationTemplateController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Get()
  async list(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.read(request, response, undefined);
  }

  @Get(":templateKey")
  async get(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.read(request, response, request.params["templateKey"]);
  }

  @Put(":templateKey/draft")
  async saveDraft(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.write(request, response, "manage");
  }

  @Post(":templateKey/preview")
  async preview(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.write(request, response, "preview");
  }

  @Post(":templateKey/publish")
  async publish(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.write(request, response, "publish");
  }

  @Post(":templateKey/activate")
  async activate(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.write(request, response, "activate");
  }

  private async read(request: Request, response: Response, key: unknown): Promise<void> {
    try {
      if (key !== undefined && (typeof key !== "string" || !TASK_REF.test(key))) throw new Error("NOTIFICATION_INPUT_INVALID");
      const { actor: notificationActor, traceId } = await this.authorizedActor(request, "read");
      const notifications = platform(this.composition).notifications;
      const body = key === undefined ? await notifications?.listTemplateDefinitions?.(notificationActor) : await notifications?.getTemplateAdministration?.(notificationActor, key);
      if (body === undefined) throw new Error("notification_template_binding_missing");
      sendPlatformResponse(response, { body, headers: { "Cache-Control": "no-store", "X-Trace-Id": traceId }, status: 200 });
    } catch (error) { sendPlatformResponse(response, taskResponseError(error)); }
  }

  private async write(request: Request, response: Response, operation: "activate" | "manage" | "preview" | "publish"): Promise<void> {
    try {
      const templateKey = request.params["templateKey"];
      if (typeof templateKey !== "string" || !TASK_REF.test(templateKey)) throw new Error("NOTIFICATION_INPUT_INVALID");
      const credential = credentialFromRequest(request);
      if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
      const security = this.mutationHeaders(request);
      await platform(this.composition).validateNotificationMutation?.({ credential, ...security });
      const requiredAction = operation === "preview" ? "manage" : operation;
      const { actor: notificationActor, traceId } = await this.authorizedActor(request, requiredAction);
      const body = typeof request.body === "object" && request.body !== null && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
      const notifications = platform(this.composition).notifications;
      let result: unknown;
      if (operation === "manage") {
        const idempotency = singleHeader(request, "idempotency-key", 255, 1);
        if (!idempotency.valid || idempotency.value === undefined || !TASK_IDEMPOTENCY.test(idempotency.value)) throw new Error("NOTIFICATION_INPUT_INVALID");
        if (typeof body["expectedRevision"] !== "number" || typeof body["titleTemplate"] !== "string" || typeof body["summaryTemplate"] !== "string" || typeof body["bodyTemplate"] !== "string") throw new Error("NOTIFICATION_INPUT_INVALID");
        result = await notifications?.saveTemplateDraft?.({ actor: notificationActor, templateKey, expectedRevision: body["expectedRevision"], operationId: operationUuid(`draft:${templateKey}:${idempotency.value}`), titleTemplate: body["titleTemplate"], summaryTemplate: body["summaryTemplate"], bodyTemplate: body["bodyTemplate"], updatedAt: new Date().toISOString() });
      } else if (operation === "preview") {
        if (typeof body["titleTemplate"] !== "string" || typeof body["summaryTemplate"] !== "string" || typeof body["bodyTemplate"] !== "string") throw new Error("NOTIFICATION_INPUT_INVALID");
        const exampleVariables = typeof body["exampleVariables"] === "object" && body["exampleVariables"] !== null && !Array.isArray(body["exampleVariables"]) ? body["exampleVariables"] as Record<string, string | number | boolean | null> : undefined;
        result = await notifications?.previewTemplate?.({ actor: notificationActor, templateKey, titleTemplate: body["titleTemplate"], summaryTemplate: body["summaryTemplate"], bodyTemplate: body["bodyTemplate"], ...(exampleVariables === undefined ? {} : { exampleVariables }) });
      } else {
        const idempotency = singleHeader(request, "idempotency-key", 255, 1);
        if (!idempotency.valid || idempotency.value === undefined || !TASK_IDEMPOTENCY.test(idempotency.value)) throw new Error("NOTIFICATION_INPUT_INVALID");
        const activationId = operationUuid(`${operation}:${templateKey}:${idempotency.value}`);
        result = operation === "publish"
          ? await notifications?.publishTemplateDraft?.({ actor: notificationActor, templateKey, activationId, publishedAt: new Date().toISOString() })
          : typeof body["version"] === "number" ? await notifications?.activateTemplate?.({ actor: notificationActor, templateKey, version: body["version"], activationId, activatedAt: new Date().toISOString() }) : (() => { throw new Error("NOTIFICATION_INPUT_INVALID"); })();
      }
      if (result === undefined && operation !== "activate") throw new Error("notification_template_binding_missing");
      sendPlatformResponse(response, { ...(result === undefined ? {} : { body: result }), headers: { "Cache-Control": "no-store", "X-Trace-Id": traceId }, status: operation === "publish" ? 201 : 200 });
    } catch (error) { sendPlatformResponse(response, taskResponseError(error)); }
  }

  private mutationHeaders(request: Request): { readonly csrfToken?: string; readonly origin?: string; readonly referer?: string } {
    const csrfToken = singleHeader(request, "x-csrf-token", 512, 32); const origin = singleHeader(request, "origin", 512, 1); const referer = singleHeader(request, "referer", 2048, 1);
    if (!csrfToken.valid || !origin.valid || !referer.valid) throw new BrowserSessionFailure("authentication_csrf_rejected");
    return { ...(csrfToken.value === undefined ? {} : { csrfToken: csrfToken.value }), ...(origin.value === undefined ? {} : { origin: origin.value }), ...(referer.value === undefined ? {} : { referer: referer.value }) };
  }

  private async authorizedActor(request: Request, action: "activate" | "manage" | "publish" | "read"): Promise<{ readonly actor: { readonly principalId: string; readonly workforcePersonId: string; readonly activeAssignmentIds: readonly string[] }; readonly traceId: string }> {
    const credential = credentialFromRequest(request); if (credential === undefined) throw new BrowserSessionFailure("authentication_session_invalid");
    const traceId = requestTraceContext(request).traceId;
    const authorized = await platform(this.composition).authorize({ at: new Date().toISOString(), credential, traceId, permission: { action, resource: "platform.notifications.template" } });
    return { actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map(({ assignmentId }) => assignmentId) }, traceId };
  }
}

const unavailableDependency = Object.freeze([{ name: "dependency-check", required: true, healthy: false }]);
function apiDependencies(composition: ApiComposition): readonly HealthDependency[] {
  try {
    return composition.dependencies?.() ?? [];
  } catch {
    composition.logger.log("error", { errorCode: "api_dependency_check_failed", operation: "api.health.dependencies", outcome: "failed" });
    return unavailableDependency;
  }
}

@Controller("health")
class HealthController {
  constructor(
    @Inject(API_COMPOSITION) private readonly composition: ApiComposition,
    @Inject(API_RUNTIME_STATE) private readonly state: ApiRuntimeState,
  ) {}

  @Get("live")
  liveness(): HealthResult { return evaluateHealth("liveness"); }

  @Get("ready")
  readiness(@Res() response: Response): void {
    const result = this.state.ready
      ? evaluateHealth("readiness", apiDependencies(this.composition))
      : { status: "unavailable" as const };
    response.status(result.status === "ok" ? 200 : 503).json(result);
  }
}

@Injectable()
class ApiLifecycle implements OnApplicationShutdown {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}
  async onApplicationShutdown(): Promise<void> {
    try {
      await this.composition.realtime?.close();
      await this.composition.onStop?.();
      this.composition.logger.log("info", { operation: "api.lifecycle.stop", outcome: "succeeded" });
    } catch (error) {
      this.composition.logger.log("error", { errorCode: "api_stop_failed", operation: "api.lifecycle.stop", outcome: "failed" });
      throw error;
    }
  }
}

@Module({})
// Nest requires a class as the module token; behavior is supplied by the dynamic module below.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class ApiModule {}

const createApiModule = (composition: ApiComposition, state: ApiRuntimeState): DynamicModule => ({
  controllers: [HealthController, PcAuthenticationController, PcSessionPolicyController, WorkbenchController, WorkforceAdministrationController, ApplicationRegistryController, FormSchemaController, WalkingSkeletonFormSubmissionController, FileCenterController, TaskController, NotificationController, NotificationTemplateController],
  module: ApiModule,
  providers: [
    { provide: API_COMPOSITION, useValue: composition },
    { provide: API_RUNTIME_STATE, useValue: state },
    ApiLifecycle,
  ],
});

export interface ApiApplication {
  readonly health: (kind: "liveness" | "readiness") => HealthResult;
  readonly instance: () => INestApplication | undefined;
  readonly start: (port?: number, host?: string) => Promise<void>;
  readonly stop: () => Promise<void>;
}

async function apiSettleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<{ readonly kind: "completed"; readonly value: T } | { readonly kind: "timeout" }> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.then((value) => ({ kind: "completed" as const, value })),
      new Promise<{ readonly kind: "timeout" }>((resolve) => { timeout = setTimeout(() => { resolve({ kind: "timeout" }); }, timeoutMs); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const createApiApplication = (composition: ApiComposition): ApiApplication => {
  let application: INestApplication | undefined;
  let activeStart = 0;
  let startPromise: Promise<void> | undefined;
  let startController: AbortController | undefined;
  let stopping: Promise<void> | undefined;
  let terminal = false;
  const state: ApiRuntimeState = { ready: false };
  const startupTimeoutMs = composition.startupTimeoutMs ?? 30_000;
  const shutdownTimeoutMs = composition.shutdownTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(startupTimeoutMs) || startupTimeoutMs < 1 || startupTimeoutMs > 300_000) throw new Error("api_startup_timeout_invalid");
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1 || shutdownTimeoutMs > 300_000) throw new Error("api_shutdown_timeout_invalid");
  const health = (kind: "liveness" | "readiness"): HealthResult =>
    kind === "readiness" && !state.ready
      ? { status: "unavailable" }
      : evaluateHealth(kind, apiDependencies(composition));
  const start = async (port = 3000, host = "0.0.0.0"): Promise<void> => {
    if (stopping) await stopping;
    if (application) return;
    if (startPromise) return startPromise;
    if (terminal) throw new Error("api_terminal");
    startPromise = (async () => {
      const startId = ++activeStart;
      let candidate: INestApplication | undefined;
      let candidateClose: Promise<void> | undefined;
      let initialize: Promise<void> | undefined;
      let stopHook: Promise<void> | undefined;
      const controller = new AbortController();
      startController = controller;
      const cancelled = (): boolean => controller.signal.aborted || startId !== activeStart;
      const closeCandidate = async (): Promise<void> => {
        const candidateToClose = candidate;
        if (candidateToClose && !candidateClose) candidateClose = Promise.resolve().then(async () => { await candidateToClose.close(); });
        await candidateClose;
      };
      const stopAttempt = async (): Promise<void> => {
        stopHook ??= Promise.resolve().then(async () => { await composition.onStop?.(); });
        await stopHook;
      };
      const attemptComposition: ApiComposition = { ...composition, onStop: stopAttempt };
      try {
        composition.logger.log("info", { operation: "api.lifecycle.start", outcome: "started" });
        initialize = (async (): Promise<void> => {
          await composition.onStart?.(controller.signal);
          if (cancelled()) throw new Error("api_start_cancelled");
          const created = await NestFactory.create<NestExpressApplication>(createApiModule(attemptComposition, state), {
            abortOnError: false,
            bodyParser: false,
            logger: false,
            rawBody: true,
          });
          created.useBodyParser("json", { limit: 262_144 });
          const useMiddleware = Reflect.get(created, "use");
          if (typeof useMiddleware === "function") useMiddleware.call(created, traceBoundary);
          candidate = created;
          composition.realtime?.attach(created.getHttpServer());
          if (cancelled()) {
            await closeCandidate();
            throw new Error("api_start_cancelled");
          }
          await candidate.listen(port, host);
          if (cancelled()) {
            await closeCandidate();
            throw new Error("api_start_cancelled");
          }
        })();
        const startupResult = await apiSettleWithin(initialize, startupTimeoutMs);
        if (startupResult.kind === "timeout") throw new Error("api_start_timeout");
        if (cancelled() || !candidate) throw new Error("api_start_cancelled");
        application = candidate;
        if (startId === activeStart) state.ready = true;
        composition.logger.log("info", { operation: "api.lifecycle.start", outcome: "succeeded" });
      } catch (error) {
        controller.abort();
        if (startId === activeStart) activeStart += 1;
        state.ready = false;
        composition.logger.log("error", { errorCode: "api_start_failed", operation: "api.lifecycle.start", outcome: "failed" });
        const cleanup = Promise.allSettled([initialize ?? Promise.resolve(), closeCandidate(), stopAttempt()]);
        const cleanupResult = await apiSettleWithin(cleanup, startupTimeoutMs);
        if (cleanupResult.kind === "timeout" || cleanupResult.value.some((result) => result.status === "rejected")) {
          terminal = true;
          composition.logger.log("error", { errorCode: "api_start_cleanup_failed", operation: "api.lifecycle.stop", outcome: "failed" });
        }
        application = undefined;
        throw error;
      }
    })().finally(() => { startController = undefined; startPromise = undefined; });
    return startPromise;
  };
  const stop = async (): Promise<void> => {
    if (stopping) return stopping;
    stopping = (async () => {
      state.ready = false;
      try {
        if (startPromise) {
          activeStart += 1;
          startController?.abort();
          const startupResult = await apiSettleWithin(
            startPromise.then(() => undefined, () => undefined),
            shutdownTimeoutMs,
          );
          if (startupResult.kind === "timeout") throw new Error("api_stop_timeout");
        }
        const stoppingApplication = application;
        application = undefined;
        if (!stoppingApplication) return;
        const closeResult = await apiSettleWithin(Promise.allSettled([stoppingApplication.close()]), shutdownTimeoutMs);
        if (closeResult.kind === "timeout") throw new Error("api_stop_timeout");
        if (closeResult.value.some((result) => result.status === "rejected")) throw new Error("api_stop_failed");
      } catch (error) {
        terminal = true;
        application = undefined;
        composition.logger.log("error", {
          errorCode: error instanceof Error && error.message === "api_stop_timeout" ? "api_stop_timeout" : "api_stop_failed",
          operation: "api.lifecycle.stop",
          outcome: "failed",
        });
        throw error;
      }
    })().finally(() => { stopping = undefined; });
    return stopping;
  };
  return { health, instance: () => application, start, stop };
};

export * from "./auth/index.js";
export {
  createApiPlatformComposition,
  type ApiPlatformBindings,
  type ApiPlatformComposition,
  type ApiQueryBindings,
  type AuthorizedOperationContext,
  type DatabaseMigrationCompatibility,
  type ProtectedOperationInput,
} from "./composition.js";
export { loadApiRuntimeConfiguration, type ApiRuntimeConfiguration } from "./runtime-config.js";
export { loadProductionApiConfiguration, type ProductionApiConfiguration } from "./production-config.js";
export {
  bootstrapApiProcess,
  runApiMain,
  type ApiProcessPort,
  type BootstrapApiProcessOptions,
  type RunApiMainOptions,
  type RunningApiProcess,
} from "./main.js";
export {
  createProductionApiPlatformBindings,
  defaultApiPlatformBindingFactory,
  type ApiPlatformBindingFactory,
  type ProductionApiBindingDependencies,
} from "./composition-factory.js";
