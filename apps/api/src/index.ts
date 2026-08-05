import { createHash } from "node:crypto";
import "reflect-metadata";
import { Controller, Get, Inject, Injectable, Module, Post, Put, Req, Res, type OnApplicationShutdown } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { DynamicModule, INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { evaluateHealth, extractTraceContext, injectTraceContext, type ApplicationLogger, type HealthDependency, type HealthResult, type TraceContext } from "@ai-crm/observability";
import type { PermissionRequest } from "@ai-crm/crm-authorization";
import type { RealtimeServer } from "./realtime/realtime-server.js";
import { BrowserSessionFailure } from "./auth/errors.js";
import { parseSurfaceSessionCookie, type LocalAuthenticationHttpAdapter, type LocalAuthenticationHttpResponse, type LocalBrowserMutationContext } from "./auth/local-http-adapter.js";
import type { AuthenticationSurface } from "./auth/local-session-store.js";
import type { ApiPlatformHttpComposition, AuthorizedOperationContext } from "./composition.js";
import { createApiHttpRequestLoggingMiddleware } from "./api-http-logging.js";

export { AccountAccessApplicationService, connectRedisAccessSessionStore, createLocalAuthenticationHttpAdapter, createRedisAccessSessionStore, type AccessSessionStore, type LocalAuthenticationHttpAdapter } from "./auth/index.js";
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
  readonly accountAccess?: LocalAuthenticationHttpAdapter;
  readonly partTimeAccess?: LocalAuthenticationHttpAdapter;
  readonly dependencies?: () => readonly HealthDependency[];
  readonly logger: ApplicationLogger;
  readonly onStart?: (signal: AbortSignal) => void | Promise<void>;
  readonly onStop?: () => void | Promise<void>;
  readonly platformHttp?: Readonly<ApiPlatformHttpComposition>;
  readonly realtime?: RealtimeServer;
  readonly trustedProxyCidrs?: readonly string[];
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
  readonly diagnosticCode?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

function sendPlatformResponse(response: Response, result: PlatformHttpResponse): void {
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  if (result.body === undefined) response.status(result.status).send();
  else response.status(result.status).json(result.body);
}

function logPlatformDiagnostic(logger: ApplicationLogger, operation: string, result: PlatformHttpResponse, traceId: string): void {
  if (result.diagnosticCode === undefined || result.status < 400) return;
  try {
    logger.log(result.status >= 500 ? "error" : "warn", {
      errorCode: result.diagnosticCode,
      operation,
      outcome: result.status >= 500 ? "failed" : "rejected",
      traceId,
    });
  } catch {
    // Technical telemetry must never change an HTTP response.
  }
}

function stableActorId(context: Readonly<AuthorizedOperationContext>): string {
  return `account:${createHash("sha256").update(context.principal.accountId).digest("hex")}`;
}

interface RequestSessionCredential {
  readonly credential: string;
  readonly surface: AuthenticationSurface;
}

function sessionCredentialFromRequest(request: Request): Readonly<RequestSessionCredential> | undefined {
  const cookie = singleHeader(request, "cookie", 4096);
  if (!cookie.valid) return undefined;
  try {
    const requestedSurface = singleHeader(request, "x-ai-crm-surface", 16);
    if (!requestedSurface.valid || requestedSurface.value !== undefined && requestedSurface.value !== "pc" && requestedSurface.value !== "internal-h5") return undefined;
    const surfaces: readonly AuthenticationSurface[] = requestedSurface.value === undefined ? ["pc", "internal-h5"] : [requestedSurface.value];
    const matches = surfaces.flatMap((surface) => {
      const credential = parseSurfaceSessionCookie(surface, cookie.value);
      return credential === undefined ? [] : [{ credential, surface }];
    });
    return matches[0] === undefined ? undefined : Object.freeze(matches[0]);
  } catch { return undefined; }
}

function pcCredentialFromRequest(request: Request): string | undefined {
  const cookie = singleHeader(request, "cookie", 4096);
  if (!cookie.valid) return undefined;
  try { return parseSurfaceSessionCookie("pc", cookie.value); }
  catch { return undefined; }
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

function sendLocalAuthenticationResponse(response: Response, result: LocalAuthenticationHttpResponse): void {
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  if (result.body === undefined) response.status(result.status).send();
  else response.status(result.status).json(result.body);
}

function authenticationBody(request: Request): Readonly<Record<string, unknown>> {
  if (typeof request.body !== "object" || request.body === null || Array.isArray(request.body)) return Object.freeze({});
  return request.body as Readonly<Record<string, unknown>>;
}

function exactAuthenticationBody(request: Request, required: readonly string[]): Readonly<Record<string, unknown>> | undefined {
  const body = authenticationBody(request);
  const keys = Object.keys(body);
  return required.every((key) => Object.hasOwn(body, key)) && keys.every((key) => required.includes(key)) ? body : undefined;
}

function localMutationContext(request: Request): LocalBrowserMutationContext {
  const cookie = singleHeader(request, "cookie", 4096);
  const csrfToken = singleHeader(request, "x-csrf-token", 512);
  const origin = singleHeader(request, "origin", 512);
  const referer = singleHeader(request, "referer", 2048);
  return Object.freeze({
    ...(cookie.valid && cookie.value !== undefined ? { cookie: cookie.value } : {}),
    ...(csrfToken.valid && csrfToken.value !== undefined ? { csrfToken: csrfToken.value } : {}),
    ...(origin.valid && origin.value !== undefined ? { origin: origin.value } : {}),
    ...(referer.valid && referer.value !== undefined ? { referer: referer.value } : {}),
    sourceAddress: request.ip ?? "unavailable",
    traceId: requestTraceContext(request).traceId,
  });
}

abstract class InternalAuthenticationControllerBase {
  protected abstract readonly surface: "internal-h5" | "part-time" | "pc";
  constructor(protected readonly composition: ApiComposition) {}

  protected adapter(): LocalAuthenticationHttpAdapter {
    const adapter = this.surface === "part-time" ? this.composition.partTimeAccess : this.composition.accountAccess;
    if (adapter === undefined) throw new Error("api_account_access_binding_missing");
    return adapter;
  }

  async login(request: Request, response: Response): Promise<void> {
    const body = exactAuthenticationBody(request, ["identifier", "password"]);
    const identifier = body?.["identifier"];
    const password = body?.["password"];
    if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > 64 || typeof password !== "string" || password.length < 8 || password.length > 64 || !/^[\x20-\x7e]+$/u.test(password)) {
      sendLocalAuthenticationResponse(response, { body: { code: "authentication_invalid_credentials", message: "The login identifier or password is invalid." }, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }, status: 401 });
      return;
    }
    const origin = singleHeader(request, "origin", 512);
    const referer = singleHeader(request, "referer", 2048);
    sendLocalAuthenticationResponse(response, await this.adapter().login(this.surface, {
      identifier,
      ...(origin.valid && origin.value !== undefined ? { origin: origin.value } : {}),
      password,
      ...(referer.valid && referer.value !== undefined ? { referer: referer.value } : {}),
      sourceAddress: request.ip ?? "unavailable",
      traceId: requestTraceContext(request).traceId,
    }));
  }

  async session(request: Request, response: Response): Promise<void> {
    const value = singleHeader(request, "cookie", 4096);
    sendLocalAuthenticationResponse(response, await this.adapter().session(this.surface, value.valid ? value.value : undefined));
  }

  async reauthentication(request: Request, response: Response): Promise<void> {
    const body = exactAuthenticationBody(request, ["password"]);
    const password = body?.["password"];
    if (typeof password !== "string" || password.length < 1 || password.length > 64) {
      sendLocalAuthenticationResponse(response, { body: { code: "authentication_invalid_credentials", message: "The login identifier or password is invalid." }, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }, status: 401 });
      return;
    }
    sendLocalAuthenticationResponse(response, await this.adapter().reauthentication(this.surface, localMutationContext(request), password));
  }

  async assignment(request: Request, response: Response): Promise<void> {
    const assignmentId = exactAuthenticationBody(request, ["assignmentId"])?.["assignmentId"];
    if (typeof assignmentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(assignmentId)) {
      sendLocalAuthenticationResponse(response, { body: { code: "authentication_required", message: "Authentication is required." }, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }, status: 401 });
      return;
    }
    sendLocalAuthenticationResponse(response, await this.adapter().assignment(this.surface, localMutationContext(request), assignmentId));
  }

  async logout(request: Request, response: Response): Promise<void> {
    sendLocalAuthenticationResponse(response, await this.adapter().logout(this.surface, localMutationContext(request)));
  }
}

@Controller("auth/pc")
class PcAccountAccessController extends InternalAuthenticationControllerBase {
  protected readonly surface = "pc" as const;
  constructor(@Inject(API_COMPOSITION) composition: ApiComposition) { super(composition); }
  @Post("login") override login(@Req() request: Request, @Res() response: Response): Promise<void> { return super.login(request, response); }
  @Get("session") override session(@Req() request: Request, @Res() response: Response): Promise<void> { return super.session(request, response); }
  @Post("reauthentication") override reauthentication(@Req() request: Request, @Res() response: Response): Promise<void> { return super.reauthentication(request, response); }
  @Post("assignment") override assignment(@Req() request: Request, @Res() response: Response): Promise<void> { return super.assignment(request, response); }
  @Post("logout") override logout(@Req() request: Request, @Res() response: Response): Promise<void> { return super.logout(request, response); }
}

@Controller("auth/internal-h5")
class InternalH5AccountAccessController extends InternalAuthenticationControllerBase {
  protected readonly surface = "internal-h5" as const;
  constructor(@Inject(API_COMPOSITION) composition: ApiComposition) { super(composition); }
  @Post("login") override login(@Req() request: Request, @Res() response: Response): Promise<void> { return super.login(request, response); }
  @Get("session") override session(@Req() request: Request, @Res() response: Response): Promise<void> { return super.session(request, response); }
  @Post("reauthentication") override reauthentication(@Req() request: Request, @Res() response: Response): Promise<void> { return super.reauthentication(request, response); }
  @Post("logout") override logout(@Req() request: Request, @Res() response: Response): Promise<void> { return super.logout(request, response); }
}

@Controller("auth/part-time")
class PartTimeAccountAccessController extends InternalAuthenticationControllerBase {
  protected readonly surface = "part-time" as const;
  constructor(@Inject(API_COMPOSITION) composition: ApiComposition) { super(composition); }
  @Post("login") override login(@Req() request: Request, @Res() response: Response): Promise<void> { return super.login(request, response); }
  @Get("session") override session(@Req() request: Request, @Res() response: Response): Promise<void> { return super.session(request, response); }
  @Post("reauthentication") override reauthentication(@Req() request: Request, @Res() response: Response): Promise<void> { return super.reauthentication(request, response); }
  @Post("logout") override logout(@Req() request: Request, @Res() response: Response): Promise<void> { return super.logout(request, response); }
}

function unavailablePlatformResponse(code: string): PlatformHttpResponse {
  return Object.freeze({ body: Object.freeze({ code }), headers: Object.freeze({ "Cache-Control": "no-store" }), status: 503 });
}

@Controller("workbench")
class WorkbenchController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Get("bootstrap")
  async bootstrap(@Req() request: Request, @Res() response: Response): Promise<void> {
    const credential = pcCredentialFromRequest(request);
    if (credential === undefined) {
      sendPlatformResponse(response, { body: { code: "authentication_required" }, headers: { "Cache-Control": "no-store" }, status: 401 });
      return;
    }
    const binding = this.composition.workbenchHttp;
    const traceId = requestTraceContext(request).traceId;
    const result = binding === undefined
      ? unavailablePlatformResponse("workbench_unavailable")
      : await binding.bootstrap({ credential, traceId });
    logPlatformDiagnostic(this.composition.logger, "workbench.bootstrap", result, traceId);
    sendPlatformResponse(response, result);
  }
}

@Controller("workforce-administration")
class WorkforceAdministrationController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  @Get()
  async load(@Req() request: Request, @Res() response: Response): Promise<void> {
    const credential = pcCredentialFromRequest(request);
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
    const credential = pcCredentialFromRequest(request);
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
    const credential = pcCredentialFromRequest(request);
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
        surface: "pc",
      });
    } catch {
      sendPlatformResponse(response, { body: { code: "workforce_administration_csrf_rejected" }, headers: { "Cache-Control": "no-store" }, status: 403 });
      return;
    }
    const binding = this.composition.workforceAdministrationHttp;
    const traceId = requestTraceContext(request).traceId;
    const result = binding === undefined
      ? unavailablePlatformResponse("workforce_administration_unavailable")
      : await binding.execute({ body: request.body, credential, idempotencyKey: idempotencyKey.value, traceId });
    sendPlatformResponse(response, result);
  }
}

function platform(composition: ApiComposition): Readonly<ApiPlatformHttpComposition> {
  if (composition.platformHttp === undefined) throw new Error("api_platform_http_binding_missing");
  return composition.platformHttp;
}

@Controller("form-definitions")
class FormSchemaController {
  constructor(@Inject(API_COMPOSITION) private readonly composition: ApiComposition) {}

  private request(request: Request, operation: "read" | "validate"): Parameters<ApiPlatformHttpComposition["forms"]["handle"]>[0] {
    const rawBody = Reflect.get(request, "rawBody") as unknown;
    const contentType = platformHeader(request, "content-type", 128);
    const credential = pcCredentialFromRequest(request);
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
    const credential = pcCredentialFromRequest(request);
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
      const access = sessionCredentialFromRequest(request);
      if (access === undefined) throw new BrowserSessionFailure("authentication_required");
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
        at: new Date().toISOString(), credential: access.credential, surface: access.surface, traceId,
        permission: { action: "list", resource: "crm.task-center.task-projection" },
      });
      const list = platform(this.composition).tasks?.list;
      if (typeof list !== "function") throw new Error("task_list_binding_missing");
      const body = await list({
        actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map(({ assignmentId }) => assignmentId), ...(authorized.assignmentId === undefined ? {} : { selectedAssignmentId: authorized.assignmentId }) },
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
      const access = sessionCredentialFromRequest(request);
      const body = request.body as unknown;
      const bodyRecord = typeof body === "object" && body !== null && !Array.isArray(body) ? body as Readonly<Record<string, unknown>> : undefined;
      const bodyKeys = bodyRecord === undefined ? [] : Object.keys(bodyRecord);
      const sourceCommandReference = bodyRecord?.["sourceCommandReference"];
      const bodyValid = body === undefined || (bodyRecord !== undefined && bodyKeys.length === 1 && bodyKeys[0] === "sourceCommandReference" && typeof sourceCommandReference === "string" && TASK_REF.test(sourceCommandReference));
      if (access === undefined) throw new BrowserSessionFailure("authentication_required");
      if (!bodyValid || sourceType === undefined || sourceTaskId === undefined || !TASK_REF.test(sourceType) || !TASK_REF.test(sourceTaskId) || !idempotencyKey.valid || idempotencyKey.value === undefined || !TASK_IDEMPOTENCY.test(idempotencyKey.value) || !csrfToken.valid || !origin.valid || !referer.valid) {
        sendPlatformResponse(response, { body: { code: "task_invalid_input" }, headers: { "Cache-Control": "no-store" }, status: 400 });
        return;
      }
      await platform(this.composition).validateTaskMutation({
        credential: access.credential,
        ...(csrfToken.value === undefined ? {} : { csrfToken: csrfToken.value }),
        ...(origin.value === undefined ? {} : { origin: origin.value }),
        ...(referer.value === undefined ? {} : { referer: referer.value }),
        surface: access.surface,
      });
      const traceId = requestTraceContext(request).traceId;
      const authorized = await platform(this.composition).authorize({
        at: new Date().toISOString(), credential: access.credential, surface: access.surface, traceId,
        permission: { action: "complete", resource: "crm.task-center.task-projection" },
      });
      const command = {
        actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map((assignment) => assignment.assignmentId), ...(authorized.assignmentId === undefined ? {} : { selectedAssignmentId: authorized.assignmentId }) },
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
      const access = sessionCredentialFromRequest(request);
      if (access === undefined) throw new BrowserSessionFailure("authentication_required");
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
        at: new Date().toISOString(), credential: access.credential, surface: access.surface, traceId,
        permission: { action: "list", resource: "crm.notifications.in-app-notification" },
      });
      const list = platform(this.composition).notifications?.list;
      if (typeof list !== "function") throw new Error("notification_list_binding_missing");
      const body = await list({
        actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map(({ assignmentId }) => assignmentId), ...(authorized.assignmentId === undefined ? {} : { selectedAssignmentId: authorized.assignmentId }) },
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
      const { actor: notificationActor, traceId } = await this.authorizedActor(request, { action: "list", resource: "crm.notifications.in-app-notification" });
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
      const { actor: notificationActor, traceId } = await this.authorizedActor(request, { action: "read", resource: "crm.notifications.in-app-notification" });
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
      const access = sessionCredentialFromRequest(request);
      if (access === undefined) throw new BrowserSessionFailure("authentication_required");
      await platform(this.composition).validateNotificationMutation?.({ credential: access.credential, surface: access.surface, ...this.mutationHeaders(request) });
      const { actor: notificationActor, traceId } = await this.authorizedActor(request, { action, resource: "crm.notifications.in-app-notification" });
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
    const access = sessionCredentialFromRequest(request);
    if (access === undefined) throw new BrowserSessionFailure("authentication_required");
    const traceId = requestTraceContext(request).traceId;
    const authorized = await platform(this.composition).authorize({ at: new Date().toISOString(), credential: access.credential, surface: access.surface, traceId, permission });
    return { actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map(({ assignmentId }) => assignmentId), ...(authorized.assignmentId === undefined ? {} : { selectedAssignmentId: authorized.assignmentId }) }, traceId };
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
      const access = sessionCredentialFromRequest(request);
      if (access === undefined) throw new BrowserSessionFailure("authentication_required");
      const security = this.mutationHeaders(request);
      await platform(this.composition).validateNotificationMutation?.({ credential: access.credential, surface: access.surface, ...security });
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
    const credential = pcCredentialFromRequest(request); if (credential === undefined) throw new BrowserSessionFailure("authentication_required");
    const traceId = requestTraceContext(request).traceId;
    const authorized = await platform(this.composition).authorize({ at: new Date().toISOString(), credential, surface: "pc", traceId, permission: { action, resource: "crm.notifications.template" } });
    return { actor: { principalId: stableActorId(authorized), workforcePersonId: authorized.workforce.workforcePersonId, activeAssignmentIds: authorized.workforce.assignments.map(({ assignmentId }) => assignmentId), ...(authorized.assignmentId === undefined ? {} : { selectedAssignmentId: authorized.assignmentId }) }, traceId };
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
  controllers: [HealthController, PcAccountAccessController, InternalH5AccountAccessController, PartTimeAccountAccessController, WorkbenchController, WorkforceAdministrationController, FormSchemaController, WalkingSkeletonFormSubmissionController, FileCenterController, TaskController, NotificationController, NotificationTemplateController],
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
          const trustedProxyCidrs = composition.trustedProxyCidrs ?? [];
          created.set("trust proxy", trustedProxyCidrs.length === 0 ? false : [...trustedProxyCidrs]);
          const useMiddleware = Reflect.get(created, "use");
          if (typeof useMiddleware === "function") {
            useMiddleware.call(created, traceBoundary);
            useMiddleware.call(created, createApiHttpRequestLoggingMiddleware(composition.logger));
          }
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
