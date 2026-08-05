import type {
  OrganizationUnitView,
  PositionView,
  WorkforceAccountAction,
  WorkforceAccountPage,
  WorkforceAccountQuery,
  WorkforceAccountView,
  WorkforceAdministrationCommand,
  WorkforceAdministrationPort,
  WorkforceAdministrationSnapshot,
} from "./workbench-port";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const accountActions = new Set<WorkforceAccountAction>(["deactivate", "edit", "grant_crm_administrator", "reactivate", "release_phone", "reset_password", "revoke_crm_administrator", "transfer"]);

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

function account(value: unknown): WorkforceAccountView {
  const item = record(value, "workforce_account_invalid");
  const status = text(item["status"], "workforce_account_status_invalid", 32);
  if (status !== "active" && status !== "disabled") throw new Error("workforce_account_status_invalid");
  const departmentId = optionalText(item["departmentId"], "workforce_department_id_invalid");
  const departmentName = optionalText(item["departmentName"], "workforce_department_name_invalid");
  const phone = optionalText(item["phone"], "workforce_phone_invalid");
  const positionId = optionalText(item["positionId"], "workforce_position_id_invalid");
  const positionName = optionalText(item["positionName"], "workforce_position_name_invalid");
  return Object.freeze({
    accountId: text(item["accountId"], "workforce_account_id_invalid"),
    allowedActions: actions(item["allowedActions"]),
    crmAdministrator: item["crmAdministrator"] === true,
    ...(departmentId === undefined ? {} : { departmentId }),
    ...(departmentName === undefined ? {} : { departmentName }),
    legalName: text(item["legalName"], "workforce_legal_name_invalid", 64),
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
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 400 && typeof body === "object" && body !== null && !Array.isArray(body) && (body as Record<string, unknown>)["code"] === "workforce_password_policy_violation") {
      throw new Error("workforce_password_policy_violation");
    }
    throw new Error(`${code}_${String(response.status)}`);
  }
  return body;
}

async function request(fetchPort: FetchPort, input: RequestInfo | URL, init: RequestInit, code: string): Promise<Response> {
  try { return await fetchPort(input, init); }
  catch { throw new Error(code); }
}

export function createSameSiteWorkforceAdministrationPort(
  fetchPort: FetchPort = globalThis.fetch,
): WorkforceAdministrationPort {
  return Object.freeze({
    async reauthenticate(password: string): Promise<void> {
      const session = record(await json(await request(fetchPort, "/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" } }, "workforce_session_unavailable"), "workforce_session_unavailable"), "workforce_session_invalid");
      const accountId = text(session["accountId"], "workforce_session_invalid", 255);
      const csrfToken = text(session["csrfToken"], "workforce_session_invalid", 512);
      const reauthenticated = record(await json(await request(fetchPort, "/auth/pc/reauthentication", {
        body: JSON.stringify({ password }),
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        method: "POST",
      }, "workforce_reauthentication_failed"), "workforce_reauthentication_failed"), "workforce_reauthentication_invalid");
      const reauthenticatedUntil = text(reauthenticated["reauthenticatedUntil"], "workforce_reauthentication_invalid", 64);
      if (text(reauthenticated["accountId"], "workforce_reauthentication_invalid", 255) !== accountId || !Number.isFinite(Date.parse(reauthenticatedUntil)) || Date.parse(reauthenticatedUntil) <= Date.now()) throw new Error("workforce_reauthentication_invalid");
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
    async execute(command: WorkforceAdministrationCommand): Promise<{ readonly replayed: boolean }> {
      const session = record(await json(await fetchPort("/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" } }), "workforce_session_unavailable"), "workforce_session_invalid");
      const csrfToken = text(session["csrfToken"], "workforce_session_invalid", 512);
      const response = record(await json(await fetchPort("/workforce-administration/commands", {
        body: JSON.stringify(command),
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-CSRF-Token": csrfToken },
        method: "POST",
      }), "workforce_command_failed"), "workforce_command_result_invalid");
      if (typeof response["replayed"] !== "boolean") throw new Error("workforce_command_result_invalid");
      return Object.freeze({ replayed: response["replayed"] });
    },
  });
}
