import type { WorkforceKeycloakSyncPort } from "./workforce-keycloak-sync.js";

type FetchPort = (input: string, init?: RequestInit) => Promise<Response>;

export class WorkforceKeycloakClientError extends Error {
  public constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
    this.name = "WorkforceKeycloakClientError";
  }
}

export interface WorkforceKeycloakClientOptions {
  readonly adminBaseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch?: FetchPort;
  readonly realm: string;
  readonly timeoutMs: number;
}

const KEYCLOAK_ID = /^[A-Za-z0-9_-]{1,128}$/u;

function object(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new WorkforceKeycloakClientError("keycloak_response_invalid", false);
  return value as Readonly<Record<string, unknown>>;
}

function baseUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("keycloak_admin_url_invalid");
  return url.href.replace(/\/$/u, "");
}

export function createWorkforceKeycloakClient(options: WorkforceKeycloakClientOptions): Readonly<WorkforceKeycloakSyncPort> {
  if (!/^[A-Za-z0-9._-]{1,255}$/u.test(options.clientId) || options.clientSecret.length < 32 || options.clientSecret.length > 512 || !/^[A-Za-z0-9._-]{1,255}$/u.test(options.realm) || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 60_000) throw new Error("keycloak_admin_configuration_invalid");
  const fetchPort = options.fetch ?? globalThis.fetch;
  const base = baseUrl(options.adminBaseUrl);
  const realm = encodeURIComponent(options.realm);
  const tokenUrl = `${base}/realms/${realm}/protocol/openid-connect/token`;
  const admin = `${base}/admin/realms/${realm}`;

  const request = async (url: string, init: RequestInit, signal: AbortSignal): Promise<Response> => {
    const timeout = AbortSignal.timeout(options.timeoutMs);
    try { return await fetchPort(url, { ...init, signal: AbortSignal.any([signal, timeout]) }); }
    catch { throw new WorkforceKeycloakClientError("keycloak_administration_unavailable", true); }
  };
  const token = async (signal: AbortSignal): Promise<string> => {
    const response = await request(tokenUrl, { body: new URLSearchParams({ client_id: options.clientId, client_secret: options.clientSecret, grant_type: "client_credentials" }), headers: { "Content-Type": "application/x-www-form-urlencoded" }, method: "POST" }, signal);
    if (!response.ok) throw new WorkforceKeycloakClientError("keycloak_administration_unavailable", response.status >= 500 || response.status === 429);
    const value = object(await response.json())["access_token"];
    if (typeof value !== "string" || value.length < 32 || value.length > 16_384) throw new WorkforceKeycloakClientError("keycloak_response_invalid", false);
    return value;
  };
  const authorized = async (path: string, init: RequestInit, signal: AbortSignal): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await token(signal)}`);
    return request(`${admin}${path}`, { ...init, headers }, signal);
  };
  const requireUserId = (value: string): string => KEYCLOAK_ID.test(value) ? encodeURIComponent(value) : (() => { throw new Error("keycloak_user_reference_invalid"); })();
  const current = async (userId: string, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> => {
    const response = await authorized(`/users/${requireUserId(userId)}`, {}, signal);
    if (!response.ok) throw new WorkforceKeycloakClientError(response.status === 404 ? "entity_not_found" : "keycloak_administration_unavailable", response.status >= 500 || response.status === 429);
    return object(await response.json());
  };
  const update = async (userId: string, value: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<void> => {
    const response = await authorized(`/users/${requireUserId(userId)}`, { body: JSON.stringify(value), headers: { "Content-Type": "application/json" }, method: "PUT" }, signal);
    if (!response.ok) throw new WorkforceKeycloakClientError(response.status === 409 ? "entity_conflict" : "keycloak_administration_unavailable", response.status >= 500 || response.status === 429);
  };

  return Object.freeze({
    async disable(input: Parameters<WorkforceKeycloakSyncPort["disable"]>[0], signal: AbortSignal) {
      await update(input.keycloakUserId, { enabled: false }, signal);
      const response = await authorized(`/users/${requireUserId(input.keycloakUserId)}/logout`, { method: "POST" }, signal);
      if (!response.ok && response.status !== 204) throw new WorkforceKeycloakClientError("keycloak_administration_unavailable", response.status >= 500 || response.status === 429);
    },
    async revokeSessions(input: Parameters<WorkforceKeycloakSyncPort["revokeSessions"]>[0], signal: AbortSignal) {
      const response = await authorized(`/users/${requireUserId(input.keycloakUserId)}/logout`, { method: "POST" }, signal);
      if (!response.ok && response.status !== 204) throw new WorkforceKeycloakClientError("keycloak_administration_unavailable", response.status >= 500 || response.status === 429);
    },
    async synchronizeLoginIdentifiers(input: Parameters<WorkforceKeycloakSyncPort["synchronizeLoginIdentifiers"]>[0], signal: AbortSignal) {
      const existing = await current(input.keycloakUserId, signal);
      const attributesValue = existing["attributes"];
      const attributes = typeof attributesValue === "object" && attributesValue !== null && !Array.isArray(attributesValue) ? attributesValue as Readonly<Record<string, unknown>> : {};
      await update(input.keycloakUserId, { attributes: { ...attributes, ai_crm_account_id: [input.accountId], ...(input.phone === undefined ? {} : { phone_login_key: [input.phone] }) }, username: input.username }, signal);
    },
  });
}
