import { timingSafeEqual } from "node:crypto";

import { AccountAccessApplicationService, type AccountSessionResult, type AccountSessionView } from "./account-access-service.js";
import { BrowserSessionFailure, type BrowserSessionFailureCode } from "./errors.js";
import type { AuthenticationSurface } from "./local-session-store.js";

export interface LocalAuthenticationHttpResponse {
  readonly body?: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

export interface LocalBrowserMutationContext {
  readonly cookie?: string;
  readonly csrfToken?: string;
  readonly origin?: string;
  readonly referer?: string;
  readonly sourceAddress?: string;
  readonly traceId?: string;
}

export interface LocalAuthenticationHttpAdapter {
  assignment(surface: AuthenticationSurface, context: LocalBrowserMutationContext, assignmentId: string): Promise<Readonly<LocalAuthenticationHttpResponse>>;
  login(surface: AuthenticationSurface, input: Readonly<{ identifier: string; origin?: string; password: string; referer?: string; sourceAddress: string; traceId?: string }>): Promise<Readonly<LocalAuthenticationHttpResponse>>;
  logout(surface: AuthenticationSurface, context: LocalBrowserMutationContext): Promise<Readonly<LocalAuthenticationHttpResponse>>;
  reauthentication(surface: AuthenticationSurface, context: LocalBrowserMutationContext, password: string): Promise<Readonly<LocalAuthenticationHttpResponse>>;
  session(surface: AuthenticationSurface, cookie: string | undefined): Promise<Readonly<LocalAuthenticationHttpResponse>>;
}

export type SurfaceAllowedOrigins = Readonly<Record<AuthenticationSurface, string>>;

const cookieName = (surface: AuthenticationSurface): string => surface === "pc" ? "__Host-ai_crm_pc_session" : surface === "part-time" ? "__Host-ai_crm_part_time_session" : "__Host-ai_crm_internal_h5_session";
const noStore = (headers: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> => Object.freeze({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers });
const cookie = (surface: AuthenticationSurface, value: string, absoluteExpiresAt: string, nowMs: number): string => {
  const expiryMs = Date.parse(absoluteExpiresAt);
  if (!Number.isFinite(expiryMs)) throw new BrowserSessionFailure("authentication_dependency_unavailable");
  const maximumAge = Math.max(0, Math.ceil((expiryMs - nowMs) / 1_000));
  return `${cookieName(surface)}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${String(maximumAge)}`;
};
const clearCookie = (surface: AuthenticationSurface): string => `${cookieName(surface)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

const status: Readonly<Record<BrowserSessionFailureCode, number>> = Object.freeze({
  authentication_csrf_rejected: 403,
  authentication_dependency_unavailable: 503,
  authentication_invalid_credentials: 401,
  authentication_rate_limited: 429,
  authentication_required: 401,
});

const message: Readonly<Record<"authentication_csrf_rejected" | "authentication_dependency_unavailable" | "authentication_invalid_credentials" | "authentication_rate_limited" | "authentication_required", string>> = Object.freeze({
  authentication_csrf_rejected: "The browser request failed security validation.",
  authentication_dependency_unavailable: "Authentication is temporarily unavailable.",
  authentication_invalid_credentials: "The login identifier or password is invalid.",
  authentication_rate_limited: "Too many authentication attempts were rejected.",
  authentication_required: "Authentication is required.",
});

function failure(error: unknown): Readonly<LocalAuthenticationHttpResponse> {
  const rawCode = error instanceof BrowserSessionFailure ? error.code : "authentication_dependency_unavailable";
  const code = rawCode === "authentication_csrf_rejected" || rawCode === "authentication_dependency_unavailable" || rawCode === "authentication_invalid_credentials" || rawCode === "authentication_rate_limited" ? rawCode : "authentication_required";
  return Object.freeze({ body: Object.freeze({ code, message: message[code] }), headers: noStore(), status: status[rawCode] });
}

export function parseSurfaceSessionCookie(surface: AuthenticationSurface, header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  if (header.length > 4096 || /[\0\r\n]/u.test(header)) throw new BrowserSessionFailure("authentication_required");
  const name = cookieName(surface);
  const matches = header.split(";").map((part) => part.trim()).flatMap((part) => {
    const separator = part.indexOf("=");
    return separator > 0 && part.slice(0, separator) === name ? [part.slice(separator + 1)] : [];
  });
  if (matches.length === 0) return undefined;
  if (matches.length !== 1 || !/^[A-Za-z0-9_-]{43}$/u.test(matches[0] ?? "")) throw new BrowserSessionFailure("authentication_required");
  return matches[0];
}

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateRequestOrigin(allowedOrigin: string | readonly string[], context: Pick<LocalBrowserMutationContext, "origin" | "referer">): void {
  const allowed = typeof allowedOrigin === "string" ? [allowedOrigin] : allowedOrigin;
  const origin = requestOrigin(context);
  if (origin === undefined || !allowed.includes(origin)) throw new BrowserSessionFailure("authentication_csrf_rejected");
}

export function validateLocalBrowserMutation(input: Readonly<{ allowedOrigin: string | readonly string[]; csrfToken?: string; origin?: string; referer?: string; sessionCsrfToken: string }>): void {
  validateRequestOrigin(input.allowedOrigin, input);
  const origin = requestOrigin(input);
  if (origin === undefined || input.csrfToken === undefined || !sameText(input.csrfToken, input.sessionCsrfToken)) {
    throw new BrowserSessionFailure("authentication_csrf_rejected");
  }
}

function requestOrigin(context: LocalBrowserMutationContext): string | undefined {
  if (context.origin !== undefined) { try { return new URL(context.origin).origin; } catch { return undefined; } }
  if (context.referer !== undefined) { try { return new URL(context.referer).origin; } catch { return undefined; } }
  return undefined;
}

export function createLocalAuthenticationHttpAdapter(options: Readonly<{ allowedOrigins: SurfaceAllowedOrigins; clock?: () => number; service: AccountAccessApplicationService }>): Readonly<LocalAuthenticationHttpAdapter> {
  const validate = async (surface: AuthenticationSurface, context: LocalBrowserMutationContext): Promise<string> => {
    const credential = parseSurfaceSessionCookie(surface, context.cookie);
    if (credential === undefined) throw new BrowserSessionFailure("authentication_required");
    const session = await options.service.current(surface, credential);
    validateLocalBrowserMutation({ allowedOrigin: options.allowedOrigins[surface], ...(context.csrfToken === undefined ? {} : { csrfToken: context.csrfToken }), ...(context.origin === undefined ? {} : { origin: context.origin }), ...(context.referer === undefined ? {} : { referer: context.referer }), sessionCsrfToken: session.csrfToken });
    return credential;
  };
  const succeeded = (surface: AuthenticationSurface, result: Readonly<AccountSessionResult>): Readonly<LocalAuthenticationHttpResponse> => Object.freeze({ body: result.view, headers: noStore({ "Set-Cookie": cookie(surface, result.credential, result.view.absoluteExpiresAt, options.clock?.() ?? Date.now()) }), status: 200 });
  return Object.freeze({
    async assignment(surface: AuthenticationSurface, context: LocalBrowserMutationContext, assignmentId: string) {
      try { return succeeded(surface, await options.service.selectAssignment({ assignmentId, credential: await validate(surface, context), surface, ...(context.traceId === undefined ? {} : { traceId: context.traceId }) })); }
      catch (error) { return failure(error); }
    },
    async login(surface: AuthenticationSurface, input: Parameters<LocalAuthenticationHttpAdapter["login"]>[1]) {
      try {
        const origin = requestOrigin(input);
        if (origin === undefined || origin !== options.allowedOrigins[surface]) throw new BrowserSessionFailure("authentication_csrf_rejected");
        return succeeded(surface, await options.service.login({
          identifier: input.identifier,
          password: input.password,
          sourceAddress: input.sourceAddress,
          surface,
          ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
        }));
      }
      catch (error) { return failure(error); }
    },
    async logout(surface: AuthenticationSurface, context: LocalBrowserMutationContext) {
      let credential: string | undefined;
      try {
        validateRequestOrigin(options.allowedOrigins[surface], context);
        credential = parseSurfaceSessionCookie(surface, context.cookie);
        if (credential !== undefined) await validate(surface, context);
        await options.service.logout(surface, credential, context.traceId);
        return Object.freeze({ headers: noStore({ "Set-Cookie": clearCookie(surface) }), status: 204 });
      } catch (error) {
        if (error instanceof BrowserSessionFailure && error.code === "authentication_required") {
          if (credential !== undefined) await options.service.logout(surface, credential, context.traceId).catch(() => undefined);
          return Object.freeze({ headers: noStore({ "Set-Cookie": clearCookie(surface) }), status: 204 });
        }
        return failure(error);
      }
    },
    async reauthentication(surface: AuthenticationSurface, context: LocalBrowserMutationContext, password: string) {
      try { return succeeded(surface, await options.service.reauthenticate({ credential: await validate(surface, context), password, sourceAddress: context.sourceAddress ?? "unavailable", surface, ...(context.traceId === undefined ? {} : { traceId: context.traceId }) })); }
      catch (error) { return failure(error); }
    },
    async session(surface: AuthenticationSurface, header: string | undefined) {
      try {
        const credential = parseSurfaceSessionCookie(surface, header);
        if (credential === undefined) throw new BrowserSessionFailure("authentication_required");
        const view: Readonly<AccountSessionView> = await options.service.current(surface, credential);
        return Object.freeze({ body: view, headers: noStore(), status: 200 });
      } catch (error) { return failure(error); }
    },
  });
}
