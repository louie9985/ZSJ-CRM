import { createHash, randomBytes } from "node:crypto";

import type { CredentialCeremonyPort, IdentityAdministrationPort } from "./types.js";

type FetchPort = (input: string, init?: RequestInit) => Promise<Response>;

export interface KeycloakAdministrationOptions {
  readonly adminBaseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch?: FetchPort;
  readonly publicRealmBasePath: string;
  readonly realm: string;
  readonly returnUri: string;
  readonly timeoutMs: number;
}

interface KeycloakUserRepresentation {
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
  readonly enabled?: boolean;
  readonly id?: string;
  readonly username?: string;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("keycloak_response_invalid");
  return value as Record<string, unknown>;
}

function normalizedBase(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) {
    throw new Error("keycloak_admin_url_invalid");
  }
  return url.href.replace(/\/$/u, "");
}

export function createKeycloakAdministrationPorts(options: KeycloakAdministrationOptions): Readonly<{
  credentialCeremonies: CredentialCeremonyPort;
  identity: IdentityAdministrationPort;
}> {
  const fetchPort = options.fetch ?? globalThis.fetch;
  const base = normalizedBase(options.adminBaseUrl);
  const realm = encodeURIComponent(options.realm);
  const admin = `${base}/admin/realms/${realm}`;
  const tokenEndpoint = `${base}/realms/${realm}/protocol/openid-connect/token`;
  if (!/^[A-Za-z0-9._-]{1,255}$/u.test(options.clientId) || options.clientSecret.length < 32 || options.clientSecret.length > 512 ||
    !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 60_000 ||
    !/^\/realms\/[A-Za-z0-9._-]+$/u.test(options.publicRealmBasePath)) throw new Error("keycloak_admin_configuration_invalid");
  const returnUri = new URL(options.returnUri);
  if (returnUri.username || returnUri.password || returnUri.hash ||
    (returnUri.protocol !== "https:" && !(returnUri.protocol === "http:" && ["127.0.0.1", "localhost"].includes(returnUri.hostname)))) {
    throw new Error("keycloak_credential_return_uri_invalid");
  }

  const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, options.timeoutMs);
    try { return await fetchPort(url, { ...init, signal: controller.signal }); }
    catch { throw new Error("keycloak_administration_unavailable"); }
    finally { clearTimeout(timeout); }
  };
  const accessToken = async (): Promise<string> => {
    const body = new URLSearchParams({ client_id: options.clientId, client_secret: options.clientSecret, grant_type: "client_credentials" });
    const response = await request(tokenEndpoint, { body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, method: "POST" });
    if (!response.ok) throw new Error("keycloak_administration_unavailable");
    const payload = record(await response.json());
    const token = payload["access_token"];
    if (typeof token !== "string" || token.length < 32 || token.length > 16_384) throw new Error("keycloak_response_invalid");
    return token;
  };
  const authorized = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = await accessToken();
    const requestHeaders = new Headers(init.headers);
    requestHeaders.set("Authorization", `Bearer ${token}`);
    return request(`${admin}${path}`, { ...init, headers: requestHeaders });
  };
  const user = async (keycloakUserId: string): Promise<KeycloakUserRepresentation> => {
    if (!ID.test(keycloakUserId)) throw new Error("keycloak_user_reference_invalid");
    const response = await authorized(`/users/${encodeURIComponent(keycloakUserId)}`);
    if (!response.ok) throw new Error(response.status === 404 ? "entity_not_found" : "keycloak_administration_unavailable");
    const payload = record(await response.json());
    const attributes = payload["attributes"];
    const id = typeof payload["id"] === "string" ? payload["id"] : undefined;
    const username = typeof payload["username"] === "string" ? payload["username"] : undefined;
    return {
      attributes: typeof attributes === "object" && attributes !== null && !Array.isArray(attributes)
        ? attributes as Record<string, readonly string[]>
        : {},
      enabled: payload["enabled"] === true,
      ...(id === undefined ? {} : { id }),
      ...(username === undefined ? {} : { username }),
    };
  };
  const findByAccountId = async (accountId: string): Promise<KeycloakUserRepresentation | undefined> => {
    if (!UUID.test(accountId)) throw new Error("keycloak_account_reference_invalid");
    const query = new URLSearchParams({ exact: "true", max: "2", q: `ai_crm_account_id:${accountId}` });
    const response = await authorized(`/users?${query.toString()}`);
    if (!response.ok) throw new Error("keycloak_administration_unavailable");
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.length > 1) throw new Error("entity_conflict");
    return payload[0] === undefined ? undefined : record(payload[0]) as KeycloakUserRepresentation;
  };
  const update = async (keycloakUserId: string, representation: KeycloakUserRepresentation): Promise<void> => {
    const response = await authorized(`/users/${encodeURIComponent(keycloakUserId)}`, { body: JSON.stringify(representation), headers: { "Content-Type": "application/json" }, method: "PUT" });
    if (!response.ok) throw new Error(response.status === 409 ? "entity_conflict" : "keycloak_administration_unavailable");
  };
  const identity: IdentityAdministrationPort = Object.freeze({
    async createDisabledAccount(input: Parameters<IdentityAdministrationPort["createDisabledAccount"]>[0]) {
      const matching = (candidate: KeycloakUserRepresentation | undefined): string | undefined => {
        if (candidate === undefined) return undefined;
        const accountReference = candidate.attributes?.["ai_crm_account_id"]?.[0];
        const phone = candidate.attributes?.["phone_login_key"]?.[0];
        if (candidate.id === undefined || !ID.test(candidate.id) || candidate.enabled === true || candidate.username !== input.username || accountReference !== input.accountId || phone !== input.phone) throw new Error("entity_conflict");
        return candidate.id;
      };
      const existingId = matching(await findByAccountId(input.accountId));
      if (existingId !== undefined) return Object.freeze({ keycloakUserId: existingId });
      const response = await authorized("/users", { body: JSON.stringify({ attributes: { ai_crm_account_id: [input.accountId], ...(input.phone === undefined ? {} : { phone_login_key: [input.phone] }) }, enabled: false, username: input.username }), headers: { "Content-Type": "application/json" }, method: "POST" });
      if (response.status === 409) {
        const racedId = matching(await findByAccountId(input.accountId));
        if (racedId !== undefined) return Object.freeze({ keycloakUserId: racedId });
        throw new Error("entity_conflict");
      }
      if (response.status !== 201) throw new Error("keycloak_administration_unavailable");
      const location = response.headers.get("location");
      const keycloakUserId = location?.split("/").at(-1);
      if (keycloakUserId === undefined || !ID.test(keycloakUserId)) throw new Error("keycloak_response_invalid");
      return Object.freeze({ keycloakUserId });
    },
    async disableAccount(input: Parameters<IdentityAdministrationPort["disableAccount"]>[0]) {
      const existing = await user(input.keycloakUserId);
      await update(input.keycloakUserId, { ...existing, enabled: false });
    },
    async revokeSessions(input: Parameters<IdentityAdministrationPort["revokeSessions"]>[0]) {
      const response = await authorized(`/users/${encodeURIComponent(input.keycloakUserId)}/logout`, { method: "POST" });
      if (!response.ok && response.status !== 204) throw new Error("keycloak_administration_unavailable");
    },
    async synchronizeLoginIdentifiers(input: Parameters<IdentityAdministrationPort["synchronizeLoginIdentifiers"]>[0]) {
      const existing = await user(input.keycloakUserId);
      const attributes = { ...existing.attributes, ai_crm_account_id: [input.accountId], ...(input.phone === undefined ? {} : { phone_login_key: [input.phone] }) };
      await update(input.keycloakUserId, { ...existing, attributes, username: input.username });
    },
  });
  const credentialCeremonies: CredentialCeremonyPort = Object.freeze({
    async complete(input: Parameters<CredentialCeremonyPort["complete"]>[0]) {
      const existing = await user(input.keycloakUserId);
      const completed = existing.attributes?.["ai_crm_credential_completed_operation_id"]?.[0];
      const completedOperator = existing.attributes?.["ai_crm_credential_completed_operator_subject"]?.[0];
      if (completed !== input.operationId || completedOperator !== input.operatorSubjectId || existing.enabled !== true) throw new Error("credential_ceremony_not_completed");
      const attributes = { ...existing.attributes };
      delete attributes["ai_crm_credential_completed_operation_id"];
      delete attributes["ai_crm_credential_completed_operator_subject"];
      await update(input.keycloakUserId, { ...existing, attributes });
    },
    async start(input: Parameters<CredentialCeremonyPort["start"]>[0]) {
      if (!UUID.test(input.operationId) || !ID.test(input.operatorSubjectId)) throw new Error("credential_ceremony_input_invalid");
      const existing = await user(input.keycloakUserId);
      const secret = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const attributes = {
        ...existing.attributes,
        ai_crm_credential_expires_at: [expiresAt],
        ai_crm_credential_operation_id: [input.operationId],
        ai_crm_credential_operator_subject: [input.operatorSubjectId],
        ai_crm_credential_return_uri: [`${options.returnUri}?accountId=${encodeURIComponent(input.accountId)}&operationId=${encodeURIComponent(input.operationId)}`],
        ai_crm_credential_secret_hash: [createHash("sha256").update(secret).digest("hex")],
      };
      await update(input.keycloakUserId, { ...existing, attributes });
      return Object.freeze({ redirectUrl: `${options.publicRealmBasePath}/ai-crm-credential-ceremony/${encodeURIComponent(input.keycloakUserId)}?operation=${encodeURIComponent(input.operationId)}&ceremony=${encodeURIComponent(secret)}` });
    },
  });
  return Object.freeze({ credentialCeremonies, identity });
}
