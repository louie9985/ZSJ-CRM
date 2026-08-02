import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createWorkforceAdministrationHttpAdapter,
  WorkforceAdministrationFacadeError,
  type WorkforceAdministrationCommand,
  type WorkforceAdministrationFacade,
} from "./workforce-administration-http.js";

const ids = Object.freeze({
  account: "10000000-0000-4000-8000-000000000001",
  department: "10000000-0000-4000-8000-000000000002",
  parent: "10000000-0000-4000-8000-000000000003",
  position: "10000000-0000-4000-8000-000000000004",
});
const credential = "c".repeat(43);
const traceId = "1234567890abcdef1234567890abcdef";
const operationId = "10000000-0000-4000-8000-000000000005";

const snapshot = Object.freeze({
  accounts: Object.freeze([Object.freeze({
    accountId: ids.account,
    allowedActions: Object.freeze(["edit", "deactivate", "reset_password"]),
    crmAdministrator: false,
    departmentId: ids.department,
    departmentName: "AI应用部",
    legalName: "测试员工",
    latestIdentitySync: Object.freeze({ action: "synchronize_login_identifiers" as const, completedAt: "2026-08-02T00:00:02.000Z", errorCode: "keycloak_administration_unavailable" as const, operationId, requestedAt: "2026-08-02T00:00:00.000Z", status: "failed" as const }),
    phone: "+8613800000000",
    positionId: ids.position,
    positionName: "系统管理岗",
    releasablePhones: Object.freeze(["+8613700000000"]),
    revision: 2,
    status: "active" as const,
    username: "crm.admin",
  })]),
  departments: Object.freeze([Object.freeze({ allowedActions: Object.freeze(["edit"]), departmentId: ids.department, name: "AI应用部", parentDepartmentId: ids.parent, revision: 1, status: "active" as const })]),
  positions: Object.freeze([Object.freeze({ allowedActions: Object.freeze(["edit"]), departmentId: ids.department, name: "系统管理岗", positionId: ids.position, revision: 1, status: "active" as const })]),
});

function fixture() {
  const facade = {
    execute: vi.fn<WorkforceAdministrationFacade["execute"]>(() => Promise.resolve({})),
    listAccounts: vi.fn<WorkforceAdministrationFacade["listAccounts"]>((input) => Promise.resolve({ items: snapshot.accounts, page: input.query.page, pageSize: input.query.pageSize, total: 1 })),
    load: vi.fn<WorkforceAdministrationFacade["load"]>(() => Promise.resolve(snapshot)),
  };
  return { adapter: createWorkforceAdministrationHttpAdapter(facade), facade };
}

const executeInput = (body: unknown, extra: Record<string, unknown> = {}) => ({ body, credential, idempotencyKey: operationId, traceId, ...extra });

const commands: readonly WorkforceAdministrationCommand[] = [
  { departmentId: ids.department, kind: "create_account", legalName: "测试员工", phone: "+86 138-0000-0000", positionId: ids.position, username: "Test.User" },
  { accountId: ids.account, departmentId: ids.department, expectedRevision: 2, kind: "update_account", legalName: "测试员工", phone: "138 0000-0000", positionId: ids.position, username: "Test.User" },
  { accountId: ids.account, expectedRevision: 2, kind: "update_system_account", phone: "138 0000-0000", username: "Test.User" },
  { accountId: ids.account, expectedRevision: 2, kind: "deactivate_account" },
  { accountId: ids.account, departmentId: ids.department, expectedRevision: 2, kind: "reactivate_account", positionId: ids.position },
  { accountId: ids.account, expectedRevision: 2, kind: "reset_password" },
  { accountId: ids.account, expectedRevision: 2, kind: "release_phone", phone: "+86 137-0000-0000" },
  { accountId: ids.account, ceremonyOperationId: operationId, expectedRevision: 2, kind: "complete_credential_ceremony" },
  { accountId: ids.account, enabled: true, expectedRevision: 2, kind: "set_crm_administrator" },
  { departmentId: ids.department, kind: "create_department", name: "AI应用部", parentDepartmentId: ids.parent },
  { departmentId: ids.department, expectedRevision: 1, kind: "update_department", name: "AI应用部", parentDepartmentId: ids.parent },
  { departmentId: ids.department, expectedRevision: 1, kind: "deactivate_department" },
  { departmentId: ids.department, expectedRevision: 1, kind: "reactivate_department" },
  { departmentId: ids.department, kind: "create_position", name: "系统管理岗", positionId: ids.position },
  { expectedRevision: 1, kind: "update_position", name: "系统管理岗", positionId: ids.position },
  { expectedRevision: 1, kind: "deactivate_position", positionId: ids.position },
  { expectedRevision: 1, kind: "reactivate_position", positionId: ids.position },
  { accountId: ids.account, expectedRevision: 2, failedOperationId: operationId, kind: "retry_identity_sync" },
];

describe("workforce administration HTTP adapter", () => {
  it.each(commands)("strictly parses $kind and preserves trusted correlation", async (body) => {
    const { adapter, facade } = fixture();
    const response = await adapter.execute(executeInput(body));

    expect(response).toEqual({ body: { replayed: false }, headers: { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'", "X-Trace-Id": traceId }, status: 200 });
    const expectedCommand = "phone" in body ? { ...body, phone: String(body.phone).replace(/[ -]/gu, "") } : body;
    expect(facade.execute.mock.calls[0]?.[0]).toEqual({
      command: expectedCommand,
      credential,
      operationId,
      traceId,
    });
  });

  it("loads and serializes only the reviewed browser view", async () => {
    const { adapter, facade } = fixture();
    await expect(adapter.load({ credential, traceId })).resolves.toEqual({
      body: snapshot,
      headers: { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'", "X-Trace-Id": traceId },
      status: 200,
    });
    expect(facade.load).toHaveBeenCalledWith({ credential, traceId });
  });

  it("normalizes and forwards the bounded account page query", async () => {
    const { adapter, facade } = fixture();
    await expect(adapter.listAccounts({ credential, query: { departmentId: ids.department, legalName: "测试", page: "2", pageSize: "20", phone: "+86 138-0000", positionId: ids.position, status: "active", username: "CRM" }, traceId })).resolves.toMatchObject({
      body: { items: snapshot.accounts, page: 2, pageSize: 20, total: 1 }, status: 200,
    });
    expect(facade.listAccounts).toHaveBeenCalledWith({ credential, query: { departmentId: ids.department, legalName: "测试", page: 2, pageSize: 20, phone: "+861380000", positionId: ids.position, status: "active", username: "CRM" }, traceId });
  });

  it.each([
    { ...commands[0], password: "must-not-cross" },
    { ...commands[0], token: "must-not-cross" },
    { ...commands[0], email: "not-in-contract@example.invalid" },
    { ...commands[0], username: "x" },
    { ...commands[0], phone: "123" },
    { ...commands[1], expectedRevision: -1 },
    { ...commands[5], phone: "123" },
    { accountId: ids.account, expectedRevision: 2, kind: "release_phone" },
    { ...commands[6], enabled: "yes" },
    { ...commands[7], parentDepartmentId: null },
    { ...commands[0], kind: "delete_account" },
  ])("rejects forbidden, widened, or malformed commands before the facade", async (body) => {
    const { adapter, facade } = fixture();
    await expect(adapter.execute(executeInput(body))).resolves.toMatchObject({ body: { code: "workforce_administration_request_invalid" }, status: 400 });
    expect(facade.execute).not.toHaveBeenCalled();
  });

  it.each([
    { body: commands[0], credential: "short", idempotencyKey: operationId, traceId },
    { body: commands[0], credential, idempotencyKey: "retry", traceId },
    { body: commands[0], credential, idempotencyKey: operationId, traceId: "0".repeat(32) },
    { body: commands[0], credential, idempotencyKey: operationId, traceId, password: "extra" },
  ])("fails malformed transport metadata closed", async (input) => {
    const { adapter, facade } = fixture();
    await expect(adapter.execute(input)).resolves.toMatchObject({ body: { code: "workforce_administration_request_invalid" }, status: 400 });
    expect(facade.execute).not.toHaveBeenCalled();
  });

  it("does not invoke accessor-backed command fields", async () => {
    const { adapter, facade } = fixture();
    let reads = 0;
    const body = { ...commands[0] };
    Object.defineProperty(body, "username", { enumerable: true, get: () => { reads += 1; return "Test.User"; } });
    await expect(adapter.execute(executeInput(body))).resolves.toMatchObject({ status: 400 });
    expect(reads).toBe(0);
    expect(facade.execute).not.toHaveBeenCalled();
  });

  it.each([
    [new WorkforceAdministrationFacadeError("invalid"), 400, "workforce_administration_request_invalid"],
    [new WorkforceAdministrationFacadeError("forbidden"), 403, "workforce_administration_forbidden"],
    [new WorkforceAdministrationFacadeError("conflict"), 409, "workforce_administration_conflict"],
    [new WorkforceAdministrationFacadeError("unavailable"), 503, "workforce_administration_unavailable"],
    [Object.assign(new Error("occupied"), { code: "login_identifier_occupied" }), 409, "workforce_administration_conflict"],
    [new Error("database password and SQL"), 503, "workforce_administration_unavailable"],
  ] as const)("maps facade failures to a sanitized stable response", async (error, status, code) => {
    const { adapter, facade } = fixture();
    facade.execute.mockRejectedValueOnce(error);
    const response = await adapter.execute(executeInput(commands[0]));
    expect(response).toMatchObject({ body: { code }, headers: { "X-Trace-Id": traceId }, status });
    expect(JSON.stringify(response)).not.toMatch(/database password|SQL|occupied/iu);
  });

  it("rejects secret-bearing or widened facade results as unavailable", async () => {
    const resultCases = [
      { credentialRedirectUrl: "/credential/setup", token: "secret" },
      { credentialRedirectUrl: "https://outside.invalid/setup" },
      { credentialRedirectUrl: "/credential/setup?token=secret" },
    ];
    for (const result of resultCases) {
      const { adapter, facade } = fixture();
      facade.execute.mockResolvedValueOnce(result);
      await expect(adapter.execute(executeInput(commands[0]))).resolves.toMatchObject({ body: { code: "workforce_administration_unavailable" }, status: 503 });
    }
  });

  it("rejects extra or secret-bearing snapshot fields instead of reflecting them", async () => {
    const { adapter, facade } = fixture();
    facade.load.mockResolvedValueOnce({ ...snapshot, token: "secret" } as never);
    const response = await adapter.load({ credential, traceId });
    expect(response).toMatchObject({ body: { code: "workforce_administration_unavailable" }, status: 503 });
    expect(JSON.stringify(response)).not.toContain("secret");
  });

  it("does not invoke accessor-backed facade arrays", async () => {
    const { adapter, facade } = fixture();
    let reads = 0;
    const accounts = [...snapshot.accounts];
    Object.defineProperty(accounts, "0", { enumerable: true, get: () => { reads += 1; return snapshot.accounts[0]; } });
    facade.load.mockResolvedValueOnce({ ...snapshot, accounts });
    await expect(adapter.load({ credential, traceId })).resolves.toMatchObject({ body: { code: "workforce_administration_unavailable" }, status: 503 });
    expect(reads).toBe(0);
  });

  it("accepts a local credential ceremony redirect without returning credential material", async () => {
    const { adapter, facade } = fixture();
    facade.execute.mockResolvedValueOnce({ credentialRedirectUrl: "/auth/pc/credential-ceremony" });
    await expect(adapter.execute(executeInput(commands[4]))).resolves.toMatchObject({
      body: { credentialRedirectUrl: "/auth/pc/credential-ceremony" }, status: 200,
    });
  });

  it("does not expose malformed facade error accessors", async () => {
    const { adapter, facade } = fixture();
    const error = new Error("private");
    Object.defineProperty(error, "code", { get: () => { throw new Error("getter executed"); } });
    facade.execute.mockRejectedValueOnce(error);
    await expect(adapter.execute(executeInput(commands[0]))).resolves.toMatchObject({ body: { code: "workforce_administration_unavailable" }, status: 503 });
  });

  it("normalizes UUID casing without changing idempotency identity", async () => {
    const { adapter, facade } = fixture();
    const upperOperation = randomUUID().toUpperCase();
    await adapter.execute({ body: commands[2], credential, idempotencyKey: upperOperation, traceId });
    expect(facade.execute).toHaveBeenCalledWith(expect.objectContaining({ operationId: upperOperation.toLowerCase(), traceId }));
  });
});
