export type WorkforceAccountStatus = "active" | "credential_pending" | "disabled" | "failed" | "provisioning";

export type WorkforceAdministrationCommand =
  | { readonly departmentId: string; readonly kind: "create_account"; readonly legalName: string; readonly phone?: string; readonly positionId: string; readonly username: string }
  | { readonly accountId: string; readonly departmentId: string; readonly expectedRevision: number; readonly kind: "update_account"; readonly legalName: string; readonly phone?: string; readonly positionId: string; readonly username: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "update_system_account"; readonly phone?: string; readonly username: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "deactivate_account" | "reset_password" }
  | { readonly accountId: string; readonly expectedRevision: number; readonly kind: "release_phone"; readonly phone: string }
  | { readonly accountId: string; readonly expectedRevision: number; readonly failedOperationId: string; readonly kind: "retry_identity_sync" }
  | { readonly accountId: string; readonly ceremonyOperationId: string; readonly expectedRevision: number; readonly kind: "complete_credential_ceremony" }
  | { readonly accountId: string; readonly departmentId: string; readonly expectedRevision: number; readonly kind: "reactivate_account"; readonly positionId: string }
  | { readonly accountId: string; readonly enabled: boolean; readonly expectedRevision: number; readonly kind: "set_crm_administrator" }
  | { readonly departmentId: string; readonly kind: "create_department"; readonly name: string; readonly parentDepartmentId?: string }
  | { readonly departmentId: string; readonly expectedRevision: number; readonly kind: "update_department"; readonly name: string; readonly parentDepartmentId?: string | null }
  | { readonly departmentId: string; readonly expectedRevision: number; readonly kind: "deactivate_department" | "reactivate_department" }
  | { readonly departmentId: string; readonly kind: "create_position"; readonly name: string; readonly positionId: string }
  | { readonly expectedRevision: number; readonly kind: "update_position"; readonly name: string; readonly positionId: string }
  | { readonly expectedRevision: number; readonly kind: "deactivate_position" | "reactivate_position"; readonly positionId: string };

export interface WorkforceAdministrationFacadeCommand {
  readonly command: WorkforceAdministrationCommand;
  readonly credential: string;
  readonly operationId: string;
  readonly traceId: string;
}

export interface WorkforceAccountView {
  readonly accountId: string;
  readonly allowedActions: readonly string[];
  readonly crmAdministrator: boolean;
  readonly departmentId?: string;
  readonly departmentName?: string;
  readonly legalName: string;
  readonly latestIdentitySync?: WorkforceIdentitySyncOperationView;
  readonly phone?: string;
  readonly positionId?: string;
  readonly positionName?: string;
  readonly releasablePhones: readonly string[];
  readonly revision: number;
  readonly status: WorkforceAccountStatus;
  readonly username: string;
}

export interface WorkforceIdentitySyncOperationView {
  readonly action: "disable" | "revoke_sessions" | "synchronize_login_identifiers";
  readonly completedAt?: string;
  readonly errorCode?: "eventing_handler_timeout" | "identity_sync_failed" | "keycloak_administration_unavailable" | "keycloak_entity_conflict";
  readonly operationId: string;
  readonly requestedAt: string;
  readonly retryOfOperationId?: string;
  readonly status: "failed" | "pending" | "succeeded" | "superseded";
}

export interface WorkforceDepartmentView {
  readonly allowedActions: readonly string[];
  readonly departmentId: string;
  readonly name: string;
  readonly parentDepartmentId?: string;
  readonly revision: number;
  readonly status: "active" | "disabled";
}

export interface WorkforcePositionView {
  readonly allowedActions: readonly string[];
  readonly departmentId: string;
  readonly name: string;
  readonly positionId: string;
  readonly revision: number;
  readonly status: "active" | "disabled";
}

export interface WorkforceAdministrationSnapshot {
  readonly accounts: readonly WorkforceAccountView[];
  readonly departments: readonly WorkforceDepartmentView[];
  readonly positions: readonly WorkforcePositionView[];
  readonly systemAccount?: WorkforceAccountView;
}

export interface WorkforceAccountQuery {
  readonly departmentId?: string;
  readonly legalName?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly phone?: string;
  readonly positionId?: string;
  readonly status?: WorkforceAccountStatus;
  readonly username?: string;
}

export interface WorkforceAccountPage {
  readonly items: readonly WorkforceAccountView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface WorkforceAdministrationFacade {
  execute(input: Readonly<WorkforceAdministrationFacadeCommand>): Promise<Readonly<{ credentialRedirectUrl?: string }>>;
  listAccounts(input: Readonly<{ credential: string; query: WorkforceAccountQuery; traceId: string }>): Promise<Readonly<WorkforceAccountPage>>;
  load(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<WorkforceAdministrationSnapshot>>;
}

export type WorkforceAdministrationFacadeErrorCode = "conflict" | "forbidden" | "invalid" | "unavailable";

export class WorkforceAdministrationFacadeError extends Error {
  public constructor(public readonly code: WorkforceAdministrationFacadeErrorCode) {
    super(code);
    this.name = "WorkforceAdministrationFacadeError";
  }
}

export interface WorkforceAdministrationHttpResponse {
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: 200 | 400 | 403 | 409 | 503;
}

export interface WorkforceAdministrationHttpAdapter {
  execute(input: unknown): Promise<Readonly<WorkforceAdministrationHttpResponse>>;
  listAccounts(input: unknown): Promise<Readonly<WorkforceAdministrationHttpResponse>>;
  load(input: unknown): Promise<Readonly<WorkforceAdministrationHttpResponse>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TRACE_ID = /^(?!0{32})[0-9a-f]{32}$/u;
const CREDENTIAL = /^[A-Za-z0-9_-]{32,512}$/u;
const USERNAME = /^[A-Za-z0-9._-]{4,32}$/u;
const PHONE = /^\+?[0-9]{6,20}$/u;
const ACCOUNT_ACTIONS = new Set(["deactivate", "edit", "grant_crm_administrator", "reactivate", "release_phone", "reset_password", "retry_identity_sync", "revoke_crm_administrator", "transfer"]);
const DIRECTORY_ACTIONS = new Set(["deactivate", "edit", "reactivate"]);
const STATUSES = new Set<WorkforceAccountStatus>(["active", "credential_pending", "disabled", "failed", "provisioning"]);

class InvalidRequest extends Error {}
class InvalidFacadeResult extends Error {}

function invalid(): never { throw new InvalidRequest(); }
function invalidResult(): never { throw new InvalidFacadeResult(); }

function object(value: unknown, result = false): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return result ? invalidResult() : invalid();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return result ? invalidResult() : invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable)) {
    return result ? invalidResult() : invalid();
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value as unknown]));
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = [], result = false): Record<string, unknown> {
  const parsed = object(value, result);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    return result ? invalidResult() : invalid();
  }
  return parsed;
}

function uuid(value: unknown): string { return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : invalid(); }
function revision(value: unknown): number { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : invalid(); }

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value || containsControl(value)) return invalid();
  return value;
}

function resultText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value || containsControl(value)) return invalidResult();
  return value;
}

function containsControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

function username(value: unknown): string { return typeof value === "string" && USERNAME.test(value) ? value : invalid(); }
function phone(value: unknown): string {
  if (typeof value !== "string" || value.length > 64) return invalid();
  const normalized = value.replace(/[ -]/gu, "");
  return PHONE.test(normalized) ? normalized : invalid();
}

function optionalUuid(parsed: Record<string, unknown>, key: string): string | undefined {
  return Object.hasOwn(parsed, key) ? uuid(parsed[key]) : undefined;
}

function optionalPhone(parsed: Record<string, unknown>): string | undefined {
  return Object.hasOwn(parsed, "phone") ? phone(parsed["phone"]) : undefined;
}

function command(value: unknown): WorkforceAdministrationCommand {
  const candidate = object(value);
  const kind = candidate["kind"];
  if (typeof kind !== "string") return invalid();
  switch (kind) {
    case "create_account": {
      const parsed = exact(candidate, ["departmentId", "kind", "legalName", "positionId", "username"], ["phone"]);
      const parsedPhone = optionalPhone(parsed);
      return Object.freeze({ departmentId: uuid(parsed["departmentId"]), kind, legalName: text(parsed["legalName"], 64), ...(parsedPhone === undefined ? {} : { phone: parsedPhone }), positionId: uuid(parsed["positionId"]), username: username(parsed["username"]) });
    }
    case "update_account": {
      const parsed = exact(candidate, ["accountId", "departmentId", "expectedRevision", "kind", "legalName", "positionId", "username"], ["phone"]);
      const parsedPhone = optionalPhone(parsed);
      return Object.freeze({ accountId: uuid(parsed["accountId"]), departmentId: uuid(parsed["departmentId"]), expectedRevision: revision(parsed["expectedRevision"]), kind, legalName: text(parsed["legalName"], 64), ...(parsedPhone === undefined ? {} : { phone: parsedPhone }), positionId: uuid(parsed["positionId"]), username: username(parsed["username"]) });
    }
    case "update_system_account": {
      const parsed = exact(candidate, ["accountId", "expectedRevision", "kind", "username"], ["phone"]);
      const parsedPhone = optionalPhone(parsed);
      return Object.freeze({ accountId: uuid(parsed["accountId"]), expectedRevision: revision(parsed["expectedRevision"]), kind, ...(parsedPhone === undefined ? {} : { phone: parsedPhone }), username: username(parsed["username"]) });
    }
    case "deactivate_account": case "reset_password": {
      const parsed = exact(candidate, ["accountId", "expectedRevision", "kind"]);
      return Object.freeze({ accountId: uuid(parsed["accountId"]), expectedRevision: revision(parsed["expectedRevision"]), kind });
    }
    case "release_phone": {
      const parsed = exact(candidate, ["accountId", "expectedRevision", "kind", "phone"]);
      return Object.freeze({ accountId: uuid(parsed["accountId"]), expectedRevision: revision(parsed["expectedRevision"]), kind, phone: phone(parsed["phone"]) });
    }
    case "retry_identity_sync": {
      const parsed = exact(candidate, ["accountId", "expectedRevision", "failedOperationId", "kind"]);
      return Object.freeze({ accountId: uuid(parsed["accountId"]), expectedRevision: revision(parsed["expectedRevision"]), failedOperationId: uuid(parsed["failedOperationId"]), kind });
    }
    case "complete_credential_ceremony": {
      const parsed = exact(candidate, ["accountId", "ceremonyOperationId", "expectedRevision", "kind"]);
      return Object.freeze({ accountId: uuid(parsed["accountId"]), ceremonyOperationId: uuid(parsed["ceremonyOperationId"]), expectedRevision: revision(parsed["expectedRevision"]), kind });
    }
    case "reactivate_account": {
      const parsed = exact(candidate, ["accountId", "departmentId", "expectedRevision", "kind", "positionId"]);
      return Object.freeze({ accountId: uuid(parsed["accountId"]), departmentId: uuid(parsed["departmentId"]), expectedRevision: revision(parsed["expectedRevision"]), kind, positionId: uuid(parsed["positionId"]) });
    }
    case "set_crm_administrator": {
      const parsed = exact(candidate, ["accountId", "enabled", "expectedRevision", "kind"]);
      if (typeof parsed["enabled"] !== "boolean") return invalid();
      return Object.freeze({ accountId: uuid(parsed["accountId"]), enabled: parsed["enabled"], expectedRevision: revision(parsed["expectedRevision"]), kind });
    }
    case "create_department": {
      const parsed = exact(candidate, ["departmentId", "kind", "name"], ["parentDepartmentId"]);
      const parentDepartmentId = optionalUuid(parsed, "parentDepartmentId");
      return Object.freeze({ departmentId: uuid(parsed["departmentId"]), kind, name: text(parsed["name"], 64), ...(parentDepartmentId === undefined ? {} : { parentDepartmentId }) });
    }
    case "update_department": {
      const parsed = exact(candidate, ["departmentId", "expectedRevision", "kind", "name"], ["parentDepartmentId"]);
      const parentDepartmentId = !Object.hasOwn(parsed, "parentDepartmentId") ? undefined : parsed["parentDepartmentId"] === null ? null : uuid(parsed["parentDepartmentId"]);
      return Object.freeze({ departmentId: uuid(parsed["departmentId"]), expectedRevision: revision(parsed["expectedRevision"]), kind, name: text(parsed["name"], 64), ...(parentDepartmentId === undefined ? {} : { parentDepartmentId }) });
    }
    case "deactivate_department": case "reactivate_department": {
      const parsed = exact(candidate, ["departmentId", "expectedRevision", "kind"]);
      return Object.freeze({ departmentId: uuid(parsed["departmentId"]), expectedRevision: revision(parsed["expectedRevision"]), kind });
    }
    case "create_position": {
      const parsed = exact(candidate, ["departmentId", "kind", "name", "positionId"]);
      return Object.freeze({ departmentId: uuid(parsed["departmentId"]), kind, name: text(parsed["name"], 64), positionId: uuid(parsed["positionId"]) });
    }
    case "update_position": {
      const parsed = exact(candidate, ["expectedRevision", "kind", "name", "positionId"]);
      return Object.freeze({ expectedRevision: revision(parsed["expectedRevision"]), kind, name: text(parsed["name"], 64), positionId: uuid(parsed["positionId"]) });
    }
    case "deactivate_position": case "reactivate_position": {
      const parsed = exact(candidate, ["expectedRevision", "kind", "positionId"]);
      return Object.freeze({ expectedRevision: revision(parsed["expectedRevision"]), kind, positionId: uuid(parsed["positionId"]) });
    }
    default: return invalid();
  }
}

function metadata(value: unknown, mutation: boolean): { readonly credential: string; readonly operationId?: string; readonly traceId: string; readonly body?: unknown } {
  const parsed = exact(value, mutation ? ["body", "credential", "idempotencyKey", "traceId"] : ["credential", "traceId"]);
  if (typeof parsed["credential"] !== "string" || !CREDENTIAL.test(parsed["credential"]) || typeof parsed["traceId"] !== "string" || !TRACE_ID.test(parsed["traceId"])) return invalid();
  if (!mutation) return Object.freeze({ credential: parsed["credential"], traceId: parsed["traceId"] });
  return Object.freeze({ body: parsed["body"], credential: parsed["credential"], operationId: uuid(parsed["idempotencyKey"]), traceId: parsed["traceId"] });
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : invalid();
}

function accountQuery(value: unknown): WorkforceAccountQuery {
  const parsed = exact(value, [], ["departmentId", "legalName", "page", "pageSize", "phone", "positionId", "status", "username"]);
  const optionalText = (key: string, maximum: number): string | undefined => Object.hasOwn(parsed, key) ? text(parsed[key], maximum) : undefined;
  const departmentId = Object.hasOwn(parsed, "departmentId") ? uuid(parsed["departmentId"]) : undefined;
  const legalName = optionalText("legalName", 64);
  const parsedPhone = Object.hasOwn(parsed, "phone") ? phone(parsed["phone"]) : undefined;
  const positionId = Object.hasOwn(parsed, "positionId") ? uuid(parsed["positionId"]) : undefined;
  const status = parsed["status"];
  if (status !== undefined && (typeof status !== "string" || !STATUSES.has(status as WorkforceAccountStatus))) return invalid();
  const parsedUsername = Object.hasOwn(parsed, "username") ? text(parsed["username"], 32) : undefined;
  return Object.freeze({
    ...(departmentId === undefined ? {} : { departmentId }), ...(legalName === undefined ? {} : { legalName }),
    page: positiveInteger(parsed["page"], 1, 1_000_000), pageSize: positiveInteger(parsed["pageSize"], 20, 100),
    ...(parsedPhone === undefined ? {} : { phone: parsedPhone }), ...(positionId === undefined ? {} : { positionId }),
    ...(status === undefined ? {} : { status: status as WorkforceAccountStatus }), ...(parsedUsername === undefined ? {} : { username: parsedUsername }),
  });
}

function actions(value: unknown, allowed: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(value) || value.length > allowed.size) return invalidResult();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).some((key) => key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) return invalidResult();
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable || typeof descriptor.value !== "string" || !allowed.has(descriptor.value)) return invalidResult();
    result.push(descriptor.value);
  }
  if (new Set(result).size !== result.length) return invalidResult();
  return Object.freeze(result);
}

function identitySync(value: unknown): WorkforceIdentitySyncOperationView {
  const parsed = exact(value, ["action", "operationId", "requestedAt", "status"], ["completedAt", "errorCode", "retryOfOperationId"], true);
  const action = parsed["action"]; const status = parsed["status"];
  if (typeof action !== "string" || !["disable", "revoke_sessions", "synchronize_login_identifiers"].includes(action) || typeof status !== "string" || !["failed", "pending", "succeeded", "superseded"].includes(status)) return invalidResult();
  const completedAt = Object.hasOwn(parsed, "completedAt") ? resultText(parsed["completedAt"], 40) : undefined;
  const errorCode = parsed["errorCode"];
  if (errorCode !== undefined && (typeof errorCode !== "string" || !["eventing_handler_timeout", "identity_sync_failed", "keycloak_administration_unavailable", "keycloak_entity_conflict"].includes(errorCode))) return invalidResult();
  const retryOfOperationId = Object.hasOwn(parsed, "retryOfOperationId") ? resultUuid(parsed["retryOfOperationId"]) : undefined;
  return Object.freeze({ action: action as WorkforceIdentitySyncOperationView["action"], ...(completedAt === undefined ? {} : { completedAt }), ...(errorCode === undefined ? {} : { errorCode: errorCode as NonNullable<WorkforceIdentitySyncOperationView["errorCode"]> }), operationId: resultUuid(parsed["operationId"]), requestedAt: resultText(parsed["requestedAt"], 40), ...(retryOfOperationId === undefined ? {} : { retryOfOperationId }), status: status as WorkforceIdentitySyncOperationView["status"] });
}

function account(value: unknown): WorkforceAccountView {
  const parsed = exact(value, ["accountId", "allowedActions", "crmAdministrator", "legalName", "releasablePhones", "revision", "status", "username"], ["departmentId", "departmentName", "latestIdentitySync", "phone", "positionId", "positionName"], true);
  if (typeof parsed["accountId"] !== "string" || !UUID.test(parsed["accountId"]) || typeof parsed["crmAdministrator"] !== "boolean" || typeof parsed["revision"] !== "number" || !Number.isSafeInteger(parsed["revision"]) || parsed["revision"] < 0 || typeof parsed["status"] !== "string" || !STATUSES.has(parsed["status"] as WorkforceAccountStatus) || typeof parsed["username"] !== "string" || !USERNAME.test(parsed["username"])) return invalidResult();
  const optional = (key: string, maximum: number): string | undefined => Object.hasOwn(parsed, key) ? resultText(parsed[key], maximum) : undefined;
  const departmentId = Object.hasOwn(parsed, "departmentId") ? resultUuid(parsed["departmentId"]) : undefined;
  const departmentName = optional("departmentName", 64);
  const latestIdentitySync = Object.hasOwn(parsed, "latestIdentitySync") ? identitySync(parsed["latestIdentitySync"]) : undefined;
  const positionId = Object.hasOwn(parsed, "positionId") ? resultUuid(parsed["positionId"]) : undefined;
  const positionName = optional("positionName", 64);
  const parsedPhone = Object.hasOwn(parsed, "phone") ? resultPhone(parsed["phone"]) : undefined;
  return Object.freeze({
    accountId: parsed["accountId"].toLowerCase(), allowedActions: actions(parsed["allowedActions"], ACCOUNT_ACTIONS), crmAdministrator: parsed["crmAdministrator"],
    ...(departmentId === undefined ? {} : { departmentId }), ...(departmentName === undefined ? {} : { departmentName }),
    legalName: resultText(parsed["legalName"], 64), ...(latestIdentitySync === undefined ? {} : { latestIdentitySync }), ...(parsedPhone === undefined ? {} : { phone: parsedPhone }),
    ...(positionId === undefined ? {} : { positionId }), ...(positionName === undefined ? {} : { positionName }), releasablePhones: resultPhones(parsed["releasablePhones"]),
    revision: parsed["revision"], status: parsed["status"] as WorkforceAccountStatus, username: parsed["username"],
  });
}

function resultUuid(value: unknown): string { return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : invalidResult(); }
function resultPhone(value: unknown): string { return typeof value === "string" && PHONE.test(value) ? value : invalidResult(); }
function resultPhones(value: unknown): readonly string[] {
  const parsed = array(value, resultPhone);
  if (parsed.length > 100 || new Set(parsed).size !== parsed.length) return invalidResult();
  return parsed;
}

function department(value: unknown): WorkforceDepartmentView {
  const parsed = exact(value, ["allowedActions", "departmentId", "name", "revision", "status"], ["parentDepartmentId"], true);
  if ((parsed["status"] !== "active" && parsed["status"] !== "disabled") || typeof parsed["revision"] !== "number" || !Number.isSafeInteger(parsed["revision"]) || parsed["revision"] < 0) return invalidResult();
  const parentDepartmentId = Object.hasOwn(parsed, "parentDepartmentId") ? resultUuid(parsed["parentDepartmentId"]) : undefined;
  return Object.freeze({ allowedActions: actions(parsed["allowedActions"], DIRECTORY_ACTIONS), departmentId: resultUuid(parsed["departmentId"]), name: resultText(parsed["name"], 64), ...(parentDepartmentId === undefined ? {} : { parentDepartmentId }), revision: parsed["revision"], status: parsed["status"] });
}

function position(value: unknown): WorkforcePositionView {
  const parsed = exact(value, ["allowedActions", "departmentId", "name", "positionId", "revision", "status"], [], true);
  if ((parsed["status"] !== "active" && parsed["status"] !== "disabled") || typeof parsed["revision"] !== "number" || !Number.isSafeInteger(parsed["revision"]) || parsed["revision"] < 0) return invalidResult();
  return Object.freeze({ allowedActions: actions(parsed["allowedActions"], DIRECTORY_ACTIONS), departmentId: resultUuid(parsed["departmentId"]), name: resultText(parsed["name"], 64), positionId: resultUuid(parsed["positionId"]), revision: parsed["revision"], status: parsed["status"] });
}

function array<T>(value: unknown, mapper: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || value.length > 10_000) return invalidResult();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).some((key) => key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) return invalidResult();
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) return invalidResult();
    result.push(mapper(descriptor.value as unknown));
  }
  return Object.freeze(result);
}

function snapshot(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = exact(value, ["accounts", "departments", "positions"], ["systemAccount"], true);
  return Object.freeze({ accounts: array(parsed["accounts"], account), departments: array(parsed["departments"], department), positions: array(parsed["positions"], position), ...(Object.hasOwn(parsed, "systemAccount") ? { systemAccount: account(parsed["systemAccount"]) } : {}) });
}

function accountPage(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = exact(value, ["items", "page", "pageSize", "total"], [], true);
  const page = parsed["page"]; const pageSize = parsed["pageSize"]; const total = parsed["total"];
  if (![page, pageSize, total].every((item) => Number.isSafeInteger(item) && Number(item) >= 0) || Number(page) < 1 || Number(pageSize) < 1 || Number(pageSize) > 100) return invalidResult();
  return Object.freeze({ items: array(parsed["items"], account), page, pageSize, total });
}

function commandResult(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = exact(value, [], ["credentialRedirectUrl", "replayed"], true);
  const replayed = parsed["replayed"] === true;
  if (!Object.hasOwn(parsed, "credentialRedirectUrl")) return Object.freeze({ replayed });
  const url = resultText(parsed["credentialRedirectUrl"], 2048);
  if (!url.startsWith("/") || url.startsWith("//") || /(?:password|token|secret)=/iu.test(url)) return invalidResult();
  return Object.freeze({ credentialRedirectUrl: url, replayed });
}

function headers(traceId?: string): Readonly<Record<string, string>> {
  return Object.freeze({ "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'", ...(traceId === undefined ? {} : { "X-Trace-Id": traceId }) });
}

function errorCode(error: unknown): string | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "string" ? descriptor.value : undefined;
}

function failure(error: unknown, traceId?: string): Readonly<WorkforceAdministrationHttpResponse> {
  const code = errorCode(error);
  const forbidden = code === "forbidden" || ["authorization_denied", "subject_not_associated", "employment_not_active", "assignment_not_active", "AUTHORIZATION_DENIED"].includes(code ?? "");
  const invalidInput = error instanceof InvalidRequest || code === "invalid" || code === "input_invalid";
  const conflict = code === "conflict" || ["entity_conflict", "entity_not_found", "idempotency_conflict", "login_identifier_occupied", "revision_conflict", "state_transition_invalid", "organization_hierarchy_cycle", "organization_path_invalid"].includes(code ?? "");
  const bodyCode = invalidInput ? "workforce_administration_request_invalid" : forbidden ? "workforce_administration_forbidden" : conflict ? "workforce_administration_conflict" : "workforce_administration_unavailable";
  const status = invalidInput ? 400 : forbidden ? 403 : conflict ? 409 : 503;
  return Object.freeze({ body: Object.freeze({ code: bodyCode }), headers: headers(traceId), status });
}

export function createWorkforceAdministrationHttpAdapter(facade: WorkforceAdministrationFacade): Readonly<WorkforceAdministrationHttpAdapter> {
  return Object.freeze({
    async execute(input: unknown): Promise<Readonly<WorkforceAdministrationHttpResponse>> {
      let traceId: string | undefined;
      try {
        const parsed = metadata(input, true);
        traceId = parsed.traceId;
        if (parsed.operationId === undefined) return invalid();
        const result = await facade.execute(Object.freeze({ command: command(parsed.body), credential: parsed.credential, operationId: parsed.operationId, traceId }));
        return Object.freeze({ body: commandResult(result), headers: headers(traceId), status: 200 });
      } catch (error) { return failure(error, traceId); }
    },
    async load(input: unknown): Promise<Readonly<WorkforceAdministrationHttpResponse>> {
      let traceId: string | undefined;
      try {
        const parsed = metadata(input, false);
        traceId = parsed.traceId;
        const result = await facade.load(Object.freeze({ credential: parsed.credential, traceId }));
        return Object.freeze({ body: snapshot(result), headers: headers(traceId), status: 200 });
      } catch (error) { return failure(error, traceId); }
    },
    async listAccounts(input: unknown): Promise<Readonly<WorkforceAdministrationHttpResponse>> {
      let traceId: string | undefined;
      try {
        const parsed = exact(input, ["credential", "query", "traceId"]);
        const common = metadata({ credential: parsed["credential"], traceId: parsed["traceId"] }, false);
        traceId = common.traceId;
        const result = await facade.listAccounts({ credential: common.credential, query: accountQuery(parsed["query"]), traceId });
        return Object.freeze({ body: accountPage(result), headers: headers(traceId), status: 200 });
      } catch (error) { return failure(error, traceId); }
    },
  });
}
