import type {
  OrganizationUnitView,
  PositionView,
  WorkforceAccountAction,
  WorkforceAccountPage,
  WorkforceAccountQuery,
  WorkforceAccountView,
  WorkforceIdentitySyncOperationView,
  WorkforceAdministrationCommand,
  WorkforceAdministrationPort,
  WorkforceAdministrationSnapshot,
} from "./workbench-port";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type NavigatePort = (url: string) => void;

const accountActions = new Set<WorkforceAccountAction>(["deactivate", "edit", "grant_crm_administrator", "reactivate", "release_phone", "reset_password", "retry_identity_sync", "revoke_crm_administrator", "transfer"]);
const identitySyncActions = new Set<WorkforceIdentitySyncOperationView["action"]>(["disable", "revoke_sessions", "synchronize_login_identifiers"]);
const identitySyncStatuses = new Set<WorkforceIdentitySyncOperationView["status"]>(["failed", "pending", "succeeded", "superseded"]);
const identitySyncErrors = new Set<NonNullable<WorkforceIdentitySyncOperationView["errorCode"]>>(["eventing_handler_timeout", "identity_sync_failed", "keycloak_administration_unavailable", "keycloak_entity_conflict"]);

function record(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(code);
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, code: string, maximum = 255): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\0\r\n]/u.test(value)) throw new Error(code);
  return value;
}

function optionalText(value: unknown, code: string): string | undefined {
  return value === undefined ? undefined : text(value, code);
}

function revision(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(code);
  return value as number;
}

function actions(value: unknown): readonly WorkforceAccountAction[] {
  if (!Array.isArray(value) || value.length > 16 || value.some((item) => typeof item !== "string" || !accountActions.has(item as WorkforceAccountAction)) || new Set(value).size !== value.length) throw new Error("workforce_actions_invalid");
  return value as WorkforceAccountAction[];
}

function phones(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("workforce_releasable_phones_invalid");
  const parsed: string[] = [];
  for (const item of value as readonly unknown[]) {
    if (typeof item !== "string" || !/^\+?[0-9]{6,20}$/u.test(item) || parsed.includes(item)) throw new Error("workforce_releasable_phones_invalid");
    parsed.push(item);
  }
  return Object.freeze(parsed);
}

function identitySync(value: unknown): WorkforceIdentitySyncOperationView {
  const item = record(value, "workforce_identity_sync_invalid");
  const action = text(item["action"], "workforce_identity_sync_invalid", 64) as WorkforceIdentitySyncOperationView["action"];
  const status = text(item["status"], "workforce_identity_sync_invalid", 32) as WorkforceIdentitySyncOperationView["status"];
  const errorCode = optionalText(item["errorCode"], "workforce_identity_sync_invalid") as WorkforceIdentitySyncOperationView["errorCode"];
  if (!identitySyncActions.has(action) || !identitySyncStatuses.has(status) || (errorCode !== undefined && !identitySyncErrors.has(errorCode)) || (status === "failed") !== (errorCode !== undefined)) throw new Error("workforce_identity_sync_invalid");
  const completedAt = optionalText(item["completedAt"], "workforce_identity_sync_invalid");
  const retryOfOperationId = optionalText(item["retryOfOperationId"], "workforce_identity_sync_invalid");
  return Object.freeze({ action, ...(completedAt === undefined ? {} : { completedAt }), ...(errorCode === undefined ? {} : { errorCode }), operationId: text(item["operationId"], "workforce_identity_sync_invalid"), requestedAt: text(item["requestedAt"], "workforce_identity_sync_invalid", 40), ...(retryOfOperationId === undefined ? {} : { retryOfOperationId }), status });
}

function account(value: unknown): WorkforceAccountView {
  const item = record(value, "workforce_account_invalid");
  const status = text(item["status"], "workforce_account_status_invalid", 32);
  if (!["active", "credential_pending", "disabled", "failed", "provisioning"].includes(status)) throw new Error("workforce_account_status_invalid");
  const departmentId = optionalText(item["departmentId"], "workforce_department_id_invalid");
  const departmentName = optionalText(item["departmentName"], "workforce_department_name_invalid");
  const phone = optionalText(item["phone"], "workforce_phone_invalid");
  const latestIdentitySync = item["latestIdentitySync"] === undefined ? undefined : identitySync(item["latestIdentitySync"]);
  const positionId = optionalText(item["positionId"], "workforce_position_id_invalid");
  const positionName = optionalText(item["positionName"], "workforce_position_name_invalid");
  return Object.freeze({
    accountId: text(item["accountId"], "workforce_account_id_invalid"),
    allowedActions: actions(item["allowedActions"]),
    crmAdministrator: item["crmAdministrator"] === true,
    ...(departmentId === undefined ? {} : { departmentId }),
    ...(departmentName === undefined ? {} : { departmentName }),
    legalName: text(item["legalName"], "workforce_legal_name_invalid", 64),
    ...(latestIdentitySync === undefined ? {} : { latestIdentitySync }),
    ...(phone === undefined ? {} : { phone }),
    ...(positionId === undefined ? {} : { positionId }),
    ...(positionName === undefined ? {} : { positionName }),
    releasablePhones: phones(item["releasablePhones"]),
    revision: revision(item["revision"], "workforce_account_revision_invalid"),
    status: status as WorkforceAccountView["status"],
    username: text(item["username"], "workforce_username_invalid", 32),
  });
}

function department(value: unknown): OrganizationUnitView {
  const item = record(value, "workforce_department_invalid");
  const status = text(item["status"], "workforce_department_status_invalid", 16);
  if (status !== "active" && status !== "disabled") throw new Error("workforce_department_status_invalid");
  const allowedActions = actions(item["allowedActions"]).filter((action): action is "deactivate" | "edit" | "reactivate" => action === "deactivate" || action === "edit" || action === "reactivate");
  const parentDepartmentId = optionalText(item["parentDepartmentId"], "workforce_parent_id_invalid");
  return Object.freeze({ departmentId: text(item["departmentId"], "workforce_department_id_invalid"), name: text(item["name"], "workforce_department_name_invalid", 64), ...(parentDepartmentId === undefined ? {} : { parentDepartmentId }), revision: revision(item["revision"], "workforce_department_revision_invalid"), status, allowedActions });
}

function position(value: unknown): PositionView {
  const item = record(value, "workforce_position_invalid");
  const status = text(item["status"], "workforce_position_status_invalid", 16);
  if (status !== "active" && status !== "disabled") throw new Error("workforce_position_status_invalid");
  const allowedActions = actions(item["allowedActions"]).filter((action): action is "deactivate" | "edit" | "reactivate" => action === "deactivate" || action === "edit" || action === "reactivate");
  return Object.freeze({ departmentId: text(item["departmentId"], "workforce_department_id_invalid"), name: text(item["name"], "workforce_position_name_invalid", 64), positionId: text(item["positionId"], "workforce_position_id_invalid"), revision: revision(item["revision"], "workforce_position_revision_invalid"), status, allowedActions });
}

async function json(response: Response, code: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${code}_${String(response.status)}`);
  return response.json();
}

export function createSameSiteWorkforceAdministrationPort(
  fetchPort: FetchPort = globalThis.fetch,
  navigate: NavigatePort = (url) => { globalThis.location.assign(url); },
): WorkforceAdministrationPort {
  return Object.freeze({
    async beginSystemAccountReauthentication(): Promise<void> {
      const session = record(await json(await fetchPort("/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" } }), "workforce_session_unavailable"), "workforce_session_invalid");
      const csrfToken = text(session["csrfToken"], "workforce_session_invalid", 512);
      const body = record(await json(await fetchPort("/auth/pc/reauthentication?returnTo=%2Fcrm%2Fworkforce-administration", {
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRF-Token": csrfToken },
        method: "POST",
      }), "workforce_reauthentication_failed"), "workforce_reauthentication_invalid");
      const location = text(body["redirectUrl"], "workforce_reauthentication_location_invalid", 4096);
      if (/[\0\r\n]/u.test(location)) throw new Error("workforce_reauthentication_location_invalid");
      const parsed = new URL(location, globalThis.location.origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("workforce_reauthentication_location_invalid");
      navigate(parsed.href);
    },
    async load(): Promise<WorkforceAdministrationSnapshot> {
      const body = record(await json(await fetchPort("/workforce-administration", { credentials: "same-origin", headers: { Accept: "application/json" } }), "workforce_administration_unavailable"), "workforce_snapshot_invalid");
      if (!Array.isArray(body["accounts"]) || !Array.isArray(body["departments"]) || !Array.isArray(body["positions"])) throw new Error("workforce_snapshot_invalid");
      return Object.freeze({
        accounts: Object.freeze(body["accounts"].map(account)),
        departments: Object.freeze(body["departments"].map(department)),
        positions: Object.freeze(body["positions"].map(position)),
        ...(body["systemAccount"] === undefined ? {} : { systemAccount: account(body["systemAccount"]) }),
      });
    },
    async listAccounts(query: WorkforceAccountQuery): Promise<WorkforceAccountPage> {
      const parameters = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
      for (const key of ["departmentId", "legalName", "phone", "positionId", "status", "username"] as const) {
        const value = query[key];
        if (value !== undefined) parameters.set(key, value);
      }
      const body = record(await json(await fetchPort(`/workforce-administration/accounts?${parameters.toString()}`, { credentials: "same-origin", headers: { Accept: "application/json" } }), "workforce_accounts_unavailable"), "workforce_account_page_invalid");
      if (!Array.isArray(body["items"])) throw new Error("workforce_account_page_invalid");
      const page = revision(body["page"], "workforce_account_page_invalid");
      const pageSize = revision(body["pageSize"], "workforce_account_page_invalid");
      const total = revision(body["total"], "workforce_account_page_invalid");
      if (page < 1 || pageSize < 1 || pageSize > 100) throw new Error("workforce_account_page_invalid");
      return Object.freeze({ items: Object.freeze(body["items"].map(account)), page, pageSize, total });
    },
    async execute(command: WorkforceAdministrationCommand): Promise<{ readonly credentialRedirectUrl?: string }> {
      const session = record(await json(await fetchPort("/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" } }), "workforce_session_unavailable"), "workforce_session_invalid");
      const csrfToken = text(session["csrfToken"], "workforce_session_invalid", 512);
      const response = record(await json(await fetchPort("/workforce-administration/commands", {
        body: JSON.stringify(command),
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-CSRF-Token": csrfToken },
        method: "POST",
      }), "workforce_command_failed"), "workforce_command_result_invalid");
      const credentialRedirectUrl = optionalText(response["credentialRedirectUrl"], "workforce_credential_url_invalid");
      if (credentialRedirectUrl !== undefined && (!credentialRedirectUrl.startsWith("/") || credentialRedirectUrl.startsWith("//"))) throw new Error("workforce_credential_url_invalid");
      return Object.freeze(credentialRedirectUrl === undefined ? {} : { credentialRedirectUrl });
    },
  });
}
