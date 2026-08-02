import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ZSJ_CRM_LOCAL_IDS, ZsjCrmBootstrapError, loadZsjCrmBootstrapSecrets, readRestrictedSecret, runZsjCrmBootstrapMain, runZsjCrmLocalBootstrap } from "./zsj-crm-local.mjs";

test("loads eight restricted Secret files and normalizes only the phone lookup value", async () => {
  const fixture = await secretsFixture();
  try {
    const secrets = await loadZsjCrmBootstrapSecrets(fixture.environment);
    assert.deepEqual(Object.keys(secrets), ["crm", "zsj"]);
    assert.equal(secrets.zsj.username, "zsj.admin");
    assert.equal(secrets.zsj.usernameNormalized, "zsj.admin");
    assert.equal(secrets.zsj.phone, "+8613800000001");
    assert.equal(secrets.crm.phone, "+8613800000002");
    assert.equal(secrets.crm.password, fixture.values.crmPassword);
  } finally { await fixture.cleanup(); }
});

test("rejects relative, broad, linked, multiline, duplicate, and invalid account Secrets", async () => {
  await assert.rejects(loadZsjCrmBootstrapSecrets({}, undefined, "linux"), hasCode("secret_path_invalid"));
  const fixture = await secretsFixture();
  try {
    const broadFileSystem = { lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false, mode: 0o100644, size: 12 }), realpath: async (path) => path, readFile: async () => "valid-secret\n" };
    await assert.rejects(readRestrictedSecret(fixture.paths.zsjPassword, broadFileSystem, "linux"), hasCode("secret_file_permissions_too_broad"));
    await writeFile(fixture.paths.zsjPassword, "line-one\nline-two\n", { mode: 0o600 });
    await assert.rejects(loadZsjCrmBootstrapSecrets(fixture.environment), hasCode("secret_file_content_invalid"));
    await writeFile(fixture.paths.zsjPassword, `${fixture.values.zsjPassword}\n`, { mode: 0o600 });
    await writeFile(fixture.paths.crmUsername, "zsj.admin\n", { mode: 0o600 });
    await assert.rejects(loadZsjCrmBootstrapSecrets(fixture.environment), hasCode("initial_account_identifier_conflict"));
    const linkedFileSystem = { lstat: async () => ({ isFile: () => true, isSymbolicLink: () => true, mode: 0o100600, size: 12 }), realpath: async (path) => path, readFile: async () => "valid-secret\n" };
    await assert.rejects(readRestrictedSecret(fixture.paths.zsjPassword, linkedFileSystem, "linux"), hasCode("secret_file_unsafe"));
  } finally { await fixture.cleanup(); }
});

test("coordinates stable organization, identity, and grant writes and reports replay", async () => {
  const calls = []; const state = new Set(); const ports = portsFixture(calls, state);
  const secrets = accountSecrets();
  const first = await runZsjCrmLocalBootstrap({ now: "2026-08-02T00:00:00.000Z", ports, secrets });
  assert.deepEqual(first, { completedAt: "2026-08-02T00:00:00.000Z", created: 12, existing: 0, status: "applied" });
  assert.equal(calls[0].input.organizationUnitId, ZSJ_CRM_LOCAL_IDS.rootOrganizationUnitId);
  assert.equal(calls[3].input.assignmentId, undefined);
  assert.equal(calls[7].input.assignmentId, ZSJ_CRM_LOCAL_IDS.crmAdministratorAssignmentId);
  assert.equal(calls[4].input.password, secrets.zsj.password);
  assert.equal(calls[8].input.password, secrets.crm.password);
  assert.equal(calls[5].kind, "super-grant");
  assert.equal(calls[6].kind, "activation");
  assert.equal("password" in calls[6].input, false);
  assert.equal(calls[9].kind, "crm-grant");
  assert.equal(calls[10].kind, "activation");
  assert.equal("password" in calls[10].input, false);
  assert.deepEqual(ports.accountStates.get(ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId), { keycloakEnabled: true, status: "active" });
  assert.deepEqual(ports.accountStates.get(ZSJ_CRM_LOCAL_IDS.crmAdministratorAccountId), { keycloakEnabled: true, status: "active" });
  calls.length = 0;
  const replay = await runZsjCrmLocalBootstrap({ now: "2026-08-02T00:01:00.000Z", ports, secrets });
  assert.deepEqual(replay, { completedAt: "2026-08-02T00:01:00.000Z", created: 0, existing: 12, status: "replayed" });
});

test("keeps an unfinished account disabled and safely completes activation on replay", async () => {
  const calls = []; const ports = portsFixture(calls, new Set());
  const activate = ports.identity.activateAccount; let failed = false;
  ports.identity.activateAccount = async (input) => {
    if (input.accountId === ZSJ_CRM_LOCAL_IDS.crmAdministratorAccountId && !failed) { failed = true; throw new Error("private-keycloak-failure"); }
    return activate(input);
  };
  await assert.rejects(runZsjCrmLocalBootstrap({ ports, secrets: accountSecrets() }), hasCode("identity_bootstrap_failed"));
  assert.deepEqual(ports.accountStates.get(ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId), { keycloakEnabled: true, status: "active" });
  assert.deepEqual(ports.accountStates.get(ZSJ_CRM_LOCAL_IDS.crmAdministratorAccountId), { keycloakEnabled: false, status: "credential_pending" });

  await runZsjCrmLocalBootstrap({ ports, secrets: accountSecrets() });
  assert.deepEqual(ports.accountStates.get(ZSJ_CRM_LOCAL_IDS.crmAdministratorAccountId), { keycloakEnabled: true, status: "active" });
});

test("fails closed on an unavailable port, invalid result, or adapter conflict without exposing its message", async () => {
  await assert.rejects(runZsjCrmLocalBootstrap({ ports: {}, secrets: accountSecrets() }), hasCode("bootstrap_ports_unavailable"));
  const invalid = portsFixture([], new Set()); invalid.organization.ensureOrganizationUnit = async () => ({ status: "changed" });
  await assert.rejects(runZsjCrmLocalBootstrap({ ports: invalid, secrets: accountSecrets() }), hasCode("bootstrap_port_result_invalid"));
  const conflict = portsFixture([], new Set()); conflict.identity.ensureAccount = async () => { throw new Error("secret-value-must-not-surface"); };
  await assert.rejects(runZsjCrmLocalBootstrap({ ports: conflict, secrets: accountSecrets() }), (error) => error instanceof ZsjCrmBootstrapError && error.code === "identity_bootstrap_failed" && error.message === "identity_bootstrap_failed");
});

test("main closes adapter ports after both success and coordinator failure", async () => {
  for (const shouldFail of [false, true]) {
    let closed = 0; const ports = portsFixture([], new Set());
    if (shouldFail) ports.registry.ensureWorkforceAdministration = async () => { throw new Error("failure"); };
    ports.close = async () => { closed += 1; };
    const run = runZsjCrmBootstrapMain({ adapterLoader: async () => ({ createZsjCrmLocalBootstrapPorts: async () => ports }), environment: { AI_CRM_ZSJ_BOOTSTRAP_ADAPTER_MODULE: join(tmpdir(), "synthetic-adapter.mjs") }, output: { log: () => undefined }, secretLoader: async () => accountSecrets() });
    if (shouldFail) await assert.rejects(run, hasCode("registry_bootstrap_failed")); else await run;
    assert.equal(closed, 1);
  }
});

function portsFixture(calls, state) {
  const ensure = (kind) => async (input) => { calls.push({ input, kind }); const key = `${kind}:${input.organizationUnitId ?? input.positionId ?? input.workforcePersonId ?? input.accountId ?? input.grantId}`; const status = state.has(key) ? "existing" : "created"; state.add(key); return { status }; };
  const accountStates = new Map();
  const ensureAccount = async (input) => {
    const result = await ensure("account")(input);
    accountStates.set(input.accountId, accountStates.get(input.accountId) ?? { keycloakEnabled: false, status: "credential_pending" });
    return result;
  };
  const activateAccount = async (input) => {
    const result = await ensure("activation")(input);
    const account = accountStates.get(input.accountId);
    if (!account) throw new Error("account missing");
    account.status = "active"; account.keycloakEnabled = true;
    return result;
  };
  return { accountStates, organization: { ensureOrganizationUnit: ensure("unit"), ensurePosition: ensure("position"), ensureWorkforcePerson: ensure("person") }, identity: { activateAccount, ensureAccount }, authorization: { ensureSuperAdministratorGrant: ensure("super-grant"), ensureCrmAdministratorGrant: ensure("crm-grant") }, registry: { ensureWorkforceAdministration: ensure("registry") } };
}

function accountSecrets() {
  return { zsj: { password: "zsj-password", phone: "+8613800000001", realName: "系统管理员", username: "zsj.admin", usernameNormalized: "zsj.admin" }, crm: { password: "crm-password", phone: "+8613800000002", realName: "CRM管理员", username: "crm.admin", usernameNormalized: "crm.admin" } };
}

async function secretsFixture() {
  const directory = await mkdtemp(join(tmpdir(), "zsj-crm-bootstrap-"));
  const values = { zsjUsername: "zsj.admin", zsjRealName: "系统管理员", zsjPhone: "+86 138-0000-0001", zsjPassword: "zsj-password", crmUsername: "crm.admin", crmRealName: "CRM管理员", crmPhone: "+86 138-0000-0002", crmPassword: "crm-password" };
  const variables = { zsjUsername: "AI_CRM_LOCAL_ZSJ_ADMIN_USERNAME_FILE", zsjRealName: "AI_CRM_LOCAL_ZSJ_ADMIN_REAL_NAME_FILE", zsjPhone: "AI_CRM_LOCAL_ZSJ_ADMIN_PHONE_FILE", zsjPassword: "AI_CRM_LOCAL_ZSJ_ADMIN_PASSWORD_FILE", crmUsername: "AI_CRM_LOCAL_CRM_ADMIN_USERNAME_FILE", crmRealName: "AI_CRM_LOCAL_CRM_ADMIN_REAL_NAME_FILE", crmPhone: "AI_CRM_LOCAL_CRM_ADMIN_PHONE_FILE", crmPassword: "AI_CRM_LOCAL_CRM_ADMIN_PASSWORD_FILE" };
  const environment = {}; const paths = {};
  for (const [key, variable] of Object.entries(variables)) { const path = join(directory, key); await writeFile(path, `${values[key]}\n`, { mode: 0o600 }); environment[variable] = path; paths[key] = path; }
  return { cleanup: () => rm(directory, { force: true, recursive: true }), directory, environment, paths, values };
}

function hasCode(code) { return (error) => error instanceof ZsjCrmBootstrapError && error.code === code; }
