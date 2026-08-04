import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ZSJ_CRM_LOCAL_IDS = Object.freeze({
  rootOrganizationUnitId: "5a100000-0000-4000-8000-000000000001",
  aiApplicationDepartmentId: "5a100000-0000-4000-8000-000000000002",
  systemAdministrationPositionId: "5a100000-0000-4000-8000-000000000003",
  zsjAdministratorPersonId: "5a100000-0000-4000-8000-000000000004",
  zsjAdministratorEmploymentId: "5a100000-0000-4000-8000-000000000005",
  zsjAdministratorAccountId: "5a100000-0000-4000-8000-000000000006",
  zsjSuperAdministratorGrantId: "5a100000-0000-4000-8000-000000000007",
  crmAdministratorPersonId: "5a100000-0000-4000-8000-000000000008",
  crmAdministratorEmploymentId: "5a100000-0000-4000-8000-000000000009",
  crmAdministratorAssignmentId: "5a100000-0000-4000-8000-00000000000a",
  crmAdministratorAccountId: "5a100000-0000-4000-8000-00000000000b",
  crmAdministratorRoleGrantId: "5a100000-0000-4000-8000-00000000000c",
  crmAdministratorRoleId: "5a100000-0000-4000-8000-00000000000d",
  superPolicyPublicationId: "5a100000-0000-4000-8000-00000000000e",
  crmPolicyPublicationId: "5a100000-0000-4000-8000-00000000000f",
  superPolicyPublicationV3Id: "5a100000-0000-4000-8000-000000000010",
  crmPolicyPublicationV3Id: "5a100000-0000-4000-8000-000000000011",
  crmApplicationUserRoleId: "5a100000-0000-4000-8000-000000000012",
  crmApplicationUserGrantId: "5a100000-0000-4000-8000-000000000013",
  superPolicyPublicationV4Id: "5a100000-0000-4000-8000-000000000014",
  crmPolicyPublicationV4Id: "5a100000-0000-4000-8000-000000000015",
  operations: Object.freeze({
    rootOrganization: "5a110000-0000-4000-8000-000000000001",
    aiApplicationDepartment: "5a110000-0000-4000-8000-000000000002",
    systemAdministrationPosition: "5a110000-0000-4000-8000-000000000003",
    zsjAdministratorPerson: "5a110000-0000-4000-8000-000000000004",
    zsjAdministratorAccount: "5a110000-0000-4000-8000-000000000005",
    zsjSuperAdministratorGrant: "5a110000-0000-4000-8000-000000000006",
    crmAdministratorPerson: "5a110000-0000-4000-8000-000000000007",
    crmAdministratorAccount: "5a110000-0000-4000-8000-000000000008",
    crmAdministratorRoleGrant: "5a110000-0000-4000-8000-000000000009",
    workforceAdministrationRegistry: "5a110000-0000-4000-8000-00000000000a",
    zsjAdministratorActivation: "5a110000-0000-4000-8000-00000000000b",
    crmAdministratorActivation: "5a110000-0000-4000-8000-00000000000c",
  }),
});

const secretVariables = Object.freeze({
  crmRealName: "AI_CRM_LOCAL_CRM_ADMIN_REAL_NAME_FILE",
  crmPassword: "AI_CRM_LOCAL_CRM_ADMIN_PASSWORD_FILE",
  crmPhone: "AI_CRM_LOCAL_CRM_ADMIN_PHONE_FILE",
  crmUsername: "AI_CRM_LOCAL_CRM_ADMIN_USERNAME_FILE",
  zsjRealName: "AI_CRM_LOCAL_ZSJ_ADMIN_REAL_NAME_FILE",
  zsjPassword: "AI_CRM_LOCAL_ZSJ_ADMIN_PASSWORD_FILE",
  zsjPhone: "AI_CRM_LOCAL_ZSJ_ADMIN_PHONE_FILE",
  zsjUsername: "AI_CRM_LOCAL_ZSJ_ADMIN_USERNAME_FILE",
});

export class ZsjCrmBootstrapError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = "ZsjCrmBootstrapError";
    this.code = code;
  }
}

export async function loadZsjCrmBootstrapSecrets(environment, fileSystem = { lstat, readFile, realpath }, platform = process.platform) {
  const values = {};
  for (const [key, variable] of Object.entries(secretVariables)) {
    const path = environment[variable];
    if (!path || !isAbsolute(path)) throw new ZsjCrmBootstrapError("secret_path_invalid");
    values[key] = await readRestrictedSecret(path, fileSystem, platform);
  }
  const normalized = {
    crm: validateAccountSecrets(values.crmUsername, values.crmRealName, values.crmPhone, values.crmPassword),
    zsj: validateAccountSecrets(values.zsjUsername, values.zsjRealName, values.zsjPhone, values.zsjPassword),
  };
  if (normalized.crm.usernameNormalized === normalized.zsj.usernameNormalized || normalized.crm.phone === normalized.zsj.phone) {
    throw new ZsjCrmBootstrapError("initial_account_identifier_conflict");
  }
  return normalized;
}

export async function readRestrictedSecret(path, fileSystem = { lstat, readFile, realpath }, platform = process.platform) {
  const status = await fileSystem.lstat(path).catch(() => { throw new ZsjCrmBootstrapError("secret_file_unavailable"); });
  if (!status.isFile() || status.isSymbolicLink()) throw new ZsjCrmBootstrapError("secret_file_unsafe");
  const canonical = await fileSystem.realpath(path).catch(() => { throw new ZsjCrmBootstrapError("secret_file_unavailable"); });
  const canonicalPath = resolve(canonical); const requestedPath = resolve(path);
  if ((platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath) !== (platform === "win32" ? requestedPath.toLowerCase() : requestedPath)) throw new ZsjCrmBootstrapError("secret_file_unsafe");
  if (platform !== "win32" && (status.mode & 0o077) !== 0) throw new ZsjCrmBootstrapError("secret_file_permissions_too_broad");
  if (status.size < 2 || status.size > 4096) throw new ZsjCrmBootstrapError("secret_file_size_invalid");
  const content = await fileSystem.readFile(path, "utf8").catch(() => { throw new ZsjCrmBootstrapError("secret_file_unavailable"); });
  const value = content.endsWith("\n") ? content.slice(0, -1) : content;
  if (value.endsWith("\r") || value.includes("\n") || value.includes("\r") || value.length === 0) throw new ZsjCrmBootstrapError("secret_file_content_invalid");
  return value;
}

export async function runZsjCrmLocalBootstrap({ ports, secrets, now = new Date().toISOString() }) {
  assertPorts(ports);
  if (!Number.isFinite(Date.parse(now))) throw new ZsjCrmBootstrapError("bootstrap_timestamp_invalid");
  const steps = [
    ["organization", () => ports.organization.ensureOrganizationUnit({ active: true, name: "ZSJ", operationId: ZSJ_CRM_LOCAL_IDS.operations.rootOrganization, organizationUnitId: ZSJ_CRM_LOCAL_IDS.rootOrganizationUnitId, rootLocked: true })],
    ["organization", () => ports.organization.ensureOrganizationUnit({ active: true, name: "AI应用部", operationId: ZSJ_CRM_LOCAL_IDS.operations.aiApplicationDepartment, organizationUnitId: ZSJ_CRM_LOCAL_IDS.aiApplicationDepartmentId, parentOrganizationUnitId: ZSJ_CRM_LOCAL_IDS.rootOrganizationUnitId, rootLocked: false })],
    ["organization", () => ports.organization.ensurePosition({ active: true, name: "系统管理岗", operationId: ZSJ_CRM_LOCAL_IDS.operations.systemAdministrationPosition, organizationUnitId: ZSJ_CRM_LOCAL_IDS.aiApplicationDepartmentId, positionId: ZSJ_CRM_LOCAL_IDS.systemAdministrationPositionId })],
    ["organization", () => ports.organization.ensureWorkforcePerson({ employmentId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorEmploymentId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorPerson, realName: secrets.zsj.realName, workforcePersonId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorPersonId })],
    ["identity", () => ports.identity.ensureAccount({ accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorAccount, password: secrets.zsj.password, phone: secrets.zsj.phone, username: secrets.zsj.username, workforcePersonId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorPersonId })],
    ["authorization", () => ports.authorization.ensureSuperAdministratorGrant({ accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, grantId: ZSJ_CRM_LOCAL_IDS.zsjSuperAdministratorGrantId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjSuperAdministratorGrant })],
    ["identity", () => ports.identity.activateAccount({ accountId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.zsjAdministratorActivation, phone: secrets.zsj.phone, username: secrets.zsj.username })],
    ["organization", () => ports.organization.ensureWorkforcePerson({ assignmentId: ZSJ_CRM_LOCAL_IDS.crmAdministratorAssignmentId, employmentId: ZSJ_CRM_LOCAL_IDS.crmAdministratorEmploymentId, operationId: ZSJ_CRM_LOCAL_IDS.operations.crmAdministratorPerson, organizationUnitId: ZSJ_CRM_LOCAL_IDS.aiApplicationDepartmentId, positionId: ZSJ_CRM_LOCAL_IDS.systemAdministrationPositionId, realName: secrets.crm.realName, workforcePersonId: ZSJ_CRM_LOCAL_IDS.crmAdministratorPersonId })],
    ["identity", () => ports.identity.ensureAccount({ accountId: ZSJ_CRM_LOCAL_IDS.crmAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.crmAdministratorAccount, password: secrets.crm.password, phone: secrets.crm.phone, username: secrets.crm.username, workforcePersonId: ZSJ_CRM_LOCAL_IDS.crmAdministratorPersonId })],
    ["authorization", () => ports.authorization.ensureCrmAdministratorGrant({ accountId: ZSJ_CRM_LOCAL_IDS.crmAdministratorAccountId, assignmentId: ZSJ_CRM_LOCAL_IDS.crmAdministratorAssignmentId, grantId: ZSJ_CRM_LOCAL_IDS.crmAdministratorRoleGrantId, operationId: ZSJ_CRM_LOCAL_IDS.operations.crmAdministratorRoleGrant })],
    ["identity", () => ports.identity.activateAccount({ accountId: ZSJ_CRM_LOCAL_IDS.crmAdministratorAccountId, operationId: ZSJ_CRM_LOCAL_IDS.operations.crmAdministratorActivation, phone: secrets.crm.phone, username: secrets.crm.username })],
    ["registry", () => ports.registry.ensureWorkforceAdministration({ operationId: ZSJ_CRM_LOCAL_IDS.operations.workforceAdministrationRegistry })],
  ];
  let created = 0; let existing = 0;
  for (const [owner, execute] of steps) {
    let result;
    try { result = await execute(); }
    catch (error) { throw new ZsjCrmBootstrapError(`${owner}_bootstrap_failed`, { cause: error }); }
    if (result?.status === "created") created += 1;
    else if (result?.status === "existing") existing += 1;
    else throw new ZsjCrmBootstrapError("bootstrap_port_result_invalid");
  }
  return Object.freeze({ completedAt: now, created, existing, status: created === 0 ? "replayed" : "applied" });
}

function validateAccountSecrets(username, realName, phone, password) {
  if (!/^[A-Za-z0-9._-]{4,32}$/u.test(username)) throw new ZsjCrmBootstrapError("initial_username_invalid");
  const normalizedPhone = phone.replace(/[ -]/gu, "");
  if (!/^\+?\d{6,20}$/u.test(normalizedPhone)) throw new ZsjCrmBootstrapError("initial_phone_invalid");
  if (realName.trim().length === 0 || realName.length > 100) throw new ZsjCrmBootstrapError("initial_real_name_invalid");
  if (password.length < 8 || password.length > 64 || !/^[\x20-\x7e]+$/u.test(password)) throw new ZsjCrmBootstrapError("initial_password_invalid");
  return Object.freeze({ password, phone: normalizedPhone, realName: realName.trim(), username, usernameNormalized: username.toLowerCase() });
}

function assertPorts(ports) {
  const methods = [[ports?.organization, "ensureOrganizationUnit"], [ports?.organization, "ensurePosition"], [ports?.organization, "ensureWorkforcePerson"], [ports?.identity, "ensureAccount"], [ports?.identity, "activateAccount"], [ports?.authorization, "ensureSuperAdministratorGrant"], [ports?.authorization, "ensureCrmAdministratorGrant"], [ports?.registry, "ensureWorkforceAdministration"]];
  if (methods.some(([owner, method]) => typeof owner?.[method] !== "function")) throw new ZsjCrmBootstrapError("bootstrap_ports_unavailable");
}

export async function runZsjCrmBootstrapMain({ adapterLoader = (url) => import(url), environment = process.env, output = console, secretLoader = loadZsjCrmBootstrapSecrets } = {}) {
    const adapterPath = environment.AI_CRM_ZSJ_BOOTSTRAP_ADAPTER_MODULE;
    if (!adapterPath || !isAbsolute(adapterPath)) throw new ZsjCrmBootstrapError("bootstrap_adapter_unavailable");
    const adapter = await adapterLoader(pathToFileURL(adapterPath).href);
    if (typeof adapter.createZsjCrmLocalBootstrapPorts !== "function") throw new ZsjCrmBootstrapError("bootstrap_adapter_invalid");
    const secrets = await secretLoader(environment);
    const ports = await adapter.createZsjCrmLocalBootstrapPorts({ environment: "local" });
    try {
      const result = await runZsjCrmLocalBootstrap({ ports, secrets });
      output.log(`ZSJ CRM local bootstrap ${result.status}; created=${result.created}; existing=${result.existing}.`);
      return result;
    } finally {
      if (typeof ports?.close === "function") await ports.close();
    }
}

async function main() {
  try {
    await runZsjCrmBootstrapMain();
  } catch (error) {
    const code = error instanceof ZsjCrmBootstrapError ? error.code : "bootstrap_unexpected_failure";
    const candidateCauseCode = error instanceof ZsjCrmBootstrapError && typeof error.cause === "object" && error.cause !== null ? error.cause.code : undefined;
    const causeCode = typeof candidateCauseCode === "string" && /^[a-z_]{1,80}$/u.test(candidateCauseCode) ? candidateCauseCode : undefined;
    console.error(`ZSJ CRM local bootstrap failed: ${code}${causeCode === undefined ? "" : ` (${causeCode})`}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const liveness = setInterval(() => undefined, 60_000);
  // Complete this module's evaluation before the dynamically loaded adapter imports its exports.
  void main().finally(() => { clearInterval(liveness); });
}
