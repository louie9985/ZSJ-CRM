import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { URL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { createZsjCrmLocalBootstrapPorts } from "./zsj-crm-local-adapter.mjs";
import { ZSJ_CRM_LOCAL_IDS } from "./zsj-crm-local.mjs";

test("adapter publishes the two-step v2 policy, registers the workforce entry, and closes its runtime", async () => {
  const fixture = await adapterFixture(); const calls = { policies: [], registry: [], closed: 0 };
  try {
    const modules = fakeModules(calls);
    const ports = await createZsjCrmLocalBootstrapPorts({ env: fixture.environment, environment: "local", fetchImpl: async () => { throw new Error("not expected"); }, modules });
    assert.deepEqual(await ports.authorization.ensureSuperAdministratorGrant({}), { status: "created" });
    assert.deepEqual(await ports.authorization.ensureCrmAdministratorGrant({}), { status: "created" });
    assert.equal(calls.policies.length, 2);
    const final = calls.policies[1].snapshot;
    assert.equal(final.schemaVersion, 2);
    assert.equal(final.superAdministratorGrants[0].workforcePersonId, ZSJ_CRM_LOCAL_IDS.zsjAdministratorPersonId);
    assert.equal(final.grants[0].subject.assignmentId, ZSJ_CRM_LOCAL_IDS.crmAdministratorAssignmentId);
    assert.equal(final.roles[0].roleKey, "crm.system-administrator");
    assert.ok(final.permissions.some(({ code }) => code === "crm.workforce-administration:view"));
    const policySchema = JSON.parse(await readFile(new URL("../../contracts/permissions/authorization-policy.v2.schema.json", import.meta.url), "utf8"));
    const validatePolicy = new Ajv2020({ allErrors: true, strict: true }).compile(policySchema);
    for (const policy of calls.policies) assert.equal(validatePolicy(policy.snapshot), true, JSON.stringify(validatePolicy.errors));
    assert.deepEqual(await ports.registry.ensureWorkforceAdministration({ operationId: ZSJ_CRM_LOCAL_IDS.operations.workforceAdministrationRegistry }), { status: "created" });
    assert.deepEqual(calls.registry.map(({ kind }) => kind), ["register_application", "register_route", "register_navigation"]);
    assert.equal(calls.registry[0].application.applicationId, "crm.workforce-administration");
    assert.deepEqual(await ports.registry.ensureWorkforceAdministration({ operationId: ZSJ_CRM_LOCAL_IDS.operations.workforceAdministrationRegistry }), { status: "existing" });
    await ports.close(); assert.equal(calls.closed, 1);
  } finally { await fixture.cleanup(); }
});

test("adapter creates a minimal temporary-password Keycloak user and replays by stable account attribute", async () => {
  const fixture = await adapterFixture(); const calls = { policies: [], registry: [], closed: 0, workforceStatuses: [] }; const requests = []; let searches = 0;
  const fetchImpl = async (url, init) => {
    requests.push({ init, url: String(url) });
    if (String(url).includes("openid-connect/token")) return response(200, { access_token: "synthetic-access-token" });
    if (init?.method === "PUT" && String(url).endsWith("/users/profile")) return response(200, {});
    if (init?.method === "POST" && String(url).endsWith("/users")) return response(201, undefined);
    searches += 1;
    if (searches === 1) return response(200, []);
    return response(200, [{ attributes: { ai_crm_account_id: [ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId], phone_login_key: ["+861380000001"] }, enabled: false, id: "00000000-0000-4000-8000-000000000099", requiredActions: ["UPDATE_PASSWORD"], username: "zsj.admin" }]);
  };
  try {
    const ports = await createZsjCrmLocalBootstrapPorts({ env: fixture.environment, environment: "local", fetchImpl, modules: fakeModules(calls) });
    const result = await ports.identity.ensureAccount({ accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorAccount, password: "temporary-password", phone: "+861380000001", username: "zsj.admin", workforcePersonId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorPersonId });
    assert.deepEqual(result, { status: "created" });
    const create = requests.find(({ init, url }) => init?.method === "POST" && url.endsWith("/users"));
    const payload = JSON.parse(create.init.body);
    assert.deepEqual(Object.keys(payload).sort(), ["attributes", "credentials", "enabled", "requiredActions", "username"]);
    assert.equal(payload.credentials[0].temporary, true); assert.equal(payload.enabled, false);
    assert.equal(payload.email, undefined); assert.equal(payload.firstName, undefined); assert.equal(payload.lastName, undefined);
    const profileUpdate = requests.find(({ init, url }) => init?.method === "PUT" && url.endsWith("/users/profile"));
    assert.ok(profileUpdate); assert.ok(JSON.parse(profileUpdate.init.body).attributes.some(({ name }) => name === "phone_login_key"));
    assert.deepEqual(calls.workforceStatuses, ["credential_pending"]);
    assert.deepEqual(await ports.identity.activateAccount({ accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorActivation, phone: "+861380000001", username: "zsj.admin" }), { status: "created" });
    assert.deepEqual(calls.workforceStatuses, ["credential_pending", "active"]);
    const enable = requests.find(({ init, url }) => init?.method === "PUT" && !url.endsWith("/users/profile"));
    assert.deepEqual(JSON.parse(enable.init.body), { enabled: true });
    assert.ok(enable.url.endsWith("/admin/realms/ai-crm-dev/users/00000000-0000-4000-8000-000000000099"));
    assert.ok(requests.every(({ url }) => !url.includes("temporary-password") && !url.includes("synthetic-access-token")));
    await ports.close();
  } finally { await fixture.cleanup(); }
});

test("adapter leaves Keycloak disabled when enablement fails and completes without repeating local activation", async () => {
  const fixture = await adapterFixture(); const calls = { policies: [], registry: [], closed: 0, workforceStatuses: [] }; let putAttempts = 0;
  const user = { attributes: { ai_crm_account_id: [ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId], phone_login_key: ["+861380000001"] }, enabled: false, id: "00000000-0000-4000-8000-000000000099", requiredActions: ["UPDATE_PASSWORD"], username: "zsj.admin" };
  const fetchImpl = async (url, init) => {
    if (String(url).includes("openid-connect/token")) return response(200, { access_token: "synthetic-access-token" });
    if (init?.method === "PUT" && String(url).endsWith("/users/profile")) return response(200, {});
    if (init?.method === "PUT") { putAttempts += 1; return response(putAttempts === 1 ? 503 : 204, undefined); }
    return response(200, [user]);
  };
  try {
    const ports = await createZsjCrmLocalBootstrapPorts({ env: fixture.environment, environment: "local", fetchImpl, modules: fakeModules(calls) });
    await ports.identity.ensureAccount({ accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorAccount, password: "temporary-password", phone: "+861380000001", username: "zsj.admin", workforcePersonId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorPersonId });
    const activation = { accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorActivation, phone: "+861380000001", username: "zsj.admin" };
    await assert.rejects(ports.identity.activateAccount(activation), /keycloak_user_enable_failed/u);
    assert.deepEqual(calls.workforceStatuses, ["credential_pending", "active"]);
    assert.deepEqual(await ports.identity.activateAccount(activation), { status: "created" });
    assert.deepEqual(calls.workforceStatuses, ["credential_pending", "active"]);
    assert.equal(putAttempts, 2);
    await ports.close();
  } finally { await fixture.cleanup(); }
});

test("adapter refuses activation before Keycloak confirms the first-login password action", async () => {
  const fixture = await adapterFixture(); const calls = { policies: [], registry: [], closed: 0, workforceStatuses: [] }; let putAttempts = 0;
  const user = { attributes: { ai_crm_account_id: [ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId], phone_login_key: ["+861380000001"] }, enabled: false, id: "00000000-0000-4000-8000-000000000099", requiredActions: [], username: "zsj.admin" };
  const fetchImpl = async (url, init) => {
    if (String(url).includes("openid-connect/token")) return response(200, { access_token: "synthetic-access-token" });
    if (init?.method === "PUT" && String(url).endsWith("/users/profile")) return response(200, {});
    if (init?.method === "PUT") { putAttempts += 1; return response(204, undefined); }
    return response(200, [user]);
  };
  try {
    const ports = await createZsjCrmLocalBootstrapPorts({ env: fixture.environment, environment: "local", fetchImpl, modules: fakeModules(calls) });
    await ports.identity.ensureAccount({ accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorAccount, password: "temporary-password", phone: "+861380000001", username: "zsj.admin", workforcePersonId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorPersonId });
    await assert.rejects(ports.identity.activateAccount({ accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorActivation, phone: "+861380000001", username: "zsj.admin" }), /keycloak_temporary_credential_missing/u);
    assert.deepEqual(calls.workforceStatuses, ["credential_pending"]);
    assert.equal(putAttempts, 0);
    await ports.close();
  } finally { await fixture.cleanup(); }
});

function fakeModules(calls) {
  const runtime = { close: async () => { calls.closed += 1; }, execute: async () => ({ rowCount: 0, rows: [] }), withTransaction: async (work) => work() };
  const profiles = new Map(); const departments = []; const positions = [];
  class Directory {
    async createDepartment(command) { departments.push({ ...command, children: [] }); return command; }
    async createPosition(command) { positions.push(command); return command; }
    async getPersonProfile(id) { const value = profiles.get(id); if (!value) throw Object.assign(new Error("not found"), { code: "entity_not_found" }); return value; }
    async listDepartmentTree() { return departments; }
    async listPositions(id) { return positions.filter(({ organizationUnitId }) => organizationUnitId === id); }
    async upsertPersonProfile(command) { profiles.set(command.workforcePersonId, command); return command; }
  }
  class Workforce {
    constructor() { this.account = undefined; }
    async createAccount(command) { this.account ??= { ...command, revision: 0, status: "provisioning" }; return this.account; }
    async getAccount(accountId) { if (!this.account || this.account.accountId !== accountId) throw new Error("not found"); return this.account; }
    async linkKeycloakUser(command) { this.account = { ...this.account, keycloakUserId: command.keycloakUserId, revision: this.account.revision + 1 }; return this.account; }
    async setStatus(command) { calls.workforceStatuses?.push(command.status); this.account = { ...this.account, revision: this.account.revision + 1, status: command.status }; return this.account; }
  }
  const registrySeen = new Set();
  return {
    database: { createLegacyPostgresRuntime: () => runtime },
    audit: { createAuditService: () => ({ record: async () => ({ auditId: "00000000-0000-4000-8000-000000000001", replayed: false }) }), createPrismaAuditStore: () => ({}) },
    eventing: { createEventingCore: () => ({ appendEvent: async () => ({ status: "pending" }) }), createPrismaEventingStore: () => ({}) },
    organization: { createPrismaOrganizationService: () => ({ createAssignment: async () => undefined, createEmployment: async () => undefined, createOrganizationUnit: async () => undefined, createPosition: async () => undefined, createSubjectAssociation: async () => undefined, createWorkforcePerson: async () => undefined }), createPrismaOrganizationDirectoryStore: () => ({}), OrganizationDirectoryService: Directory },
    workforce: { createPrismaWorkforceAccessStore: () => ({}), WorkforceAccessService: Workforce },
    authorization: { createPrismaAuthorizationPersistence: () => ({ publisher: { publish: async (command) => { calls.policies.push(command); return { replayed: false }; } } }) },
    registry: { createPrismaApplicationRegistryStore: () => ({}), createApplicationRegistryService: () => ({ mutate: async (command) => { calls.registry.push(command); const key = `${command.kind}:${command.operationId}`; const replayed = registrySeen.has(key); registrySeen.add(key); return { replayed }; } }) },
  };
}

async function adapterFixture() {
  const directory = await mkdtemp(join(tmpdir(), "zsj-crm-adapter-")); const environment = { AI_CRM_LOCAL_KEYCLOAK_BASE_URL: "http://127.0.0.1:18080/" };
  for (const [name, value] of [["AI_CRM_LOCAL_BOOTSTRAP_DATABASE_URL_FILE", "postgresql://local:local@127.0.0.1:5432/local"], ["AI_CRM_LOCAL_KEYCLOAK_ADMIN_USERNAME_FILE", "local-admin"], ["AI_CRM_LOCAL_KEYCLOAK_ADMIN_PASSWORD_FILE", "local-password"]]) { const path = join(directory, name.toLowerCase()); await writeFile(path, `${value}\n`, { mode: 0o600 }); environment[name] = path; }
  return { cleanup: () => rm(directory, { force: true, recursive: true }), environment };
}
function response(status, body) { return { json: async () => body, ok: status >= 200 && status < 300, status }; }
