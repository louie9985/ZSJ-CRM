import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { URL, URLSearchParams } from "node:url";
import { ZSJ_CRM_LOCAL_IDS, ZsjCrmBootstrapError, readRestrictedSecret } from "./zsj-crm-local.mjs";

const BOOTSTRAP_AT = "2026-08-02T00:00:00.000Z";
const SYSTEM_ACTOR = Object.freeze({ actorId: "zsj-crm-local-bootstrap", actorType: "system" });

export async function createZsjCrmLocalBootstrapPorts(options = {}) {
  if (options.environment !== "local") throw new ZsjCrmBootstrapError("bootstrap_environment_invalid");
  const modules = options.modules ?? await loadPlatformModules();
  const databaseUrl = await secret(options.env ?? process.env, "AI_CRM_LOCAL_BOOTSTRAP_DATABASE_URL_FILE");
  const runtime = modules.database.createLegacyPostgresRuntime({ applicationName: "zsj_crm_bootstrap", connectionString: databaseUrl, connectionTimeoutMs: 5000, idleTimeoutMs: 5000, maxConnections: 2, statementTimeoutMs: 15000 });
  const audit = createAudit(modules.audit, runtime);
  const eventing = modules.eventing.createEventingCore(modules.eventing.createPrismaEventingStore(runtime));
  const organizationRuntime = organizationPersistenceRuntime(runtime, audit, eventing);
  const allowOrganization = { authorize: () => Promise.resolve() };
  const organization = modules.organization.createPrismaOrganizationService(organizationRuntime, allowOrganization);
  const organizationDirectory = new modules.organization.OrganizationDirectoryService(modules.organization.createPrismaOrganizationDirectoryStore(runtime), allowOrganization);
  const workforce = new modules.workforce.WorkforceAccessService(modules.workforce.createPrismaWorkforceAccessStore(runtime), { authorize: () => Promise.resolve() });
  const authorization = modules.authorization.createPrismaAuthorizationPersistence(runtime).publisher;
  const registry = createRegistry(modules.registry, runtime, audit);
  const keycloak = await createKeycloakAdmin(options.env ?? process.env, options.fetchImpl ?? globalThis.fetch);

  return {
    authorization: authorizationPorts(authorization),
    close: async () => { keycloak.clear(); await runtime.close(); },
    identity: identityPorts(workforce, keycloak, organization),
    organization: organizationPorts(organization, organizationDirectory),
    registry: registryPorts(registry),
  };
}

function organizationPorts(service, directory) {
  return {
    ensureOrganizationUnit: async (input) => {
      const common = metadata(input.operationId);
      const before = containsDepartment(await directory.listDepartmentTree({ includeInactive: true }), input.organizationUnitId);
      await service.createOrganizationUnit({ ...common, effectiveFrom: BOOTSTRAP_AT, organizationUnitId: input.organizationUnitId, ...(input.parentOrganizationUnitId ? { parentOrganizationUnitId: input.parentOrganizationUnitId } : {}), placementId: stableUuid(input.operationId, "placement") });
      await directory.createDepartment({ ...common, name: input.name, organizationUnitId: input.organizationUnitId, ...(input.parentOrganizationUnitId ? { parentOrganizationUnitId: input.parentOrganizationUnitId } : {}), rootLocked: input.rootLocked, updatedAt: BOOTSTRAP_AT });
      return { status: before ? "existing" : "created" };
    },
    ensurePosition: async (input) => {
      const common = metadata(input.operationId);
      const before = (await directory.listPositions(input.organizationUnitId, { includeInactive: true })).find(({ positionId }) => positionId === input.positionId);
      await service.createPosition({ ...common, effectiveFrom: BOOTSTRAP_AT, organizationUnitId: input.organizationUnitId, positionId: input.positionId });
      await directory.createPosition({ ...common, name: input.name, organizationUnitId: input.organizationUnitId, positionId: input.positionId, updatedAt: BOOTSTRAP_AT });
      return { status: before ? "existing" : "created" };
    },
    ensureWorkforcePerson: async (input) => {
      const common = metadata(input.operationId);
      let profile; try { profile = await directory.getPersonProfile(input.workforcePersonId); } catch (error) { if (error?.code !== "entity_not_found") throw error; }
      if (profile && profile.realName !== input.realName) throw new ZsjCrmBootstrapError("organization_person_conflict");
      await service.createWorkforcePerson({ ...common, recordedAt: BOOTSTRAP_AT, workforcePersonId: input.workforcePersonId });
      if (!profile) await directory.upsertPersonProfile({ ...common, realName: input.realName, updatedAt: BOOTSTRAP_AT, workforcePersonId: input.workforcePersonId });
      await service.createEmployment({ ...common, effectiveFrom: BOOTSTRAP_AT, employmentId: input.employmentId, operationId: stableUuid(input.operationId, "employment"), workforcePersonId: input.workforcePersonId });
      if (input.assignmentId) await service.createAssignment({ ...common, assignmentId: input.assignmentId, effectiveFrom: BOOTSTRAP_AT, employmentId: input.employmentId, operationId: stableUuid(input.operationId, "assignment"), organizationUnitId: input.organizationUnitId, positionId: input.positionId, workforcePersonId: input.workforcePersonId });
      return { status: profile ? "existing" : "created" };
    },
  };
}

function identityPorts(workforce, keycloak, organization) {
  return {
    ensureAccount: async (input) => {
      const common = metadata(input.operationId);
      await keycloak.ensureRealmPasswordPolicy();
      await keycloak.ensureUserProfile();
      let account;
      try { account = await workforce.getAccount(input.accountId); }
      catch (error) {
        if (error?.code !== "entity_not_found") throw error;
        account = await workforce.createAccount({ ...common, accountId: input.accountId, createdAt: BOOTSTRAP_AT, phone: input.phone, username: input.username, workforcePersonId: input.workforcePersonId });
      }
      if (account.workforcePersonId !== input.workforcePersonId) throw new ZsjCrmBootstrapError("workforce_account_person_conflict");
      const user = await keycloak.ensureUser(input);
      await organization.createSubjectAssociation({ ...common, associationId: stableUuid(input.accountId, "subject-association"), effectiveFrom: BOOTSTRAP_AT, issuer: keycloak.issuer, operationId: stableUuid(input.operationId, "subject-association"), subject: user.userId, workforcePersonId: input.workforcePersonId });
      if (account.keycloakUserId === undefined) account = await workforce.linkKeycloakUser({ ...common, accountId: input.accountId, expectedRevision: account.revision, keycloakUserId: user.userId, operationId: stableUuid(input.operationId, "keycloak-link"), updatedAt: BOOTSTRAP_AT });
      else if (account.keycloakUserId !== user.userId) throw new ZsjCrmBootstrapError("keycloak_account_conflict");
      if (account.status === "provisioning") account = await workforce.setStatus({ ...common, accountId: input.accountId, expectedRevision: account.revision, operationId: stableUuid(input.operationId, "credential-pending"), status: "credential_pending", updatedAt: BOOTSTRAP_AT });
      if (!["credential_pending", "active"].includes(account.status)) throw new ZsjCrmBootstrapError("workforce_account_state_conflict");
      return { status: user.created ? "created" : "existing" };
    },
    activateAccount: async (input) => {
      const common = metadata(input.operationId);
      let account = await workforce.getAccount(input.accountId);
      if (account.keycloakUserId === undefined || !["credential_pending", "active"].includes(account.status)) throw new ZsjCrmBootstrapError("workforce_account_state_conflict");
      const user = await keycloak.findUser(input);
      if (!user || user.userId !== account.keycloakUserId) throw new ZsjCrmBootstrapError("keycloak_account_conflict");
      if (account.status === "credential_pending" && !user.requiredActions.includes("UPDATE_PASSWORD")) throw new ZsjCrmBootstrapError("keycloak_temporary_credential_missing");
      let changed = false;
      if (account.status === "credential_pending") {
        account = await workforce.setStatus({ ...common, accountId: input.accountId, expectedRevision: account.revision, operationId: stableUuid(input.operationId, "active"), status: "active", updatedAt: BOOTSTRAP_AT });
        changed = true;
      }
      if (await keycloak.enableUser(user)) changed = true;
      return { status: changed ? "created" : "existing" };
    },
  };
}

function authorizationPorts(publisher) {
  return {
    ensureSuperAdministratorGrant: async () => publicationStatus(await publisher.publish(policyCommand(false))),
    ensureCrmAdministratorGrant: async () => publicationStatus(await publisher.publish(policyCommand(true))),
  };
}

function policyCommand(includeCrmGrant) {
  const permissions = [
    { action: "access", applicationId: "crm", code: "crm.application:access", resource: "crm.application", scopeDimensions: [] },
    { action: "view", applicationId: "crm", code: "crm.workforce-administration:view", resource: "crm.workforce-administration", scopeDimensions: [] },
    { action: "read", applicationId: "platform", code: "platform.workbench.shell:read", resource: "platform.workbench.shell", scopeDimensions: [] },
    { action: "read", applicationId: "platform", code: "platform.app-registry.registry:read", resource: "platform.app-registry.registry", scopeDimensions: [] },
    { action: "read", applicationId: "platform", code: "platform.workforce-access.console:read", resource: "platform.workforce-access.console", scopeDimensions: [] },
    { action: "manage", applicationId: "platform", code: "platform.workforce-access.console:manage", resource: "platform.workforce-access.console", scopeDimensions: [] },
    { action: "read", applicationId: "crm", code: "platform.notifications.template:read", resource: "platform.notifications.template", scopeDimensions: [] },
    { action: "manage", applicationId: "crm", code: "platform.notifications.template:manage", resource: "platform.notifications.template", scopeDimensions: [] },
    { action: "publish", applicationId: "crm", code: "platform.notifications.template:publish", resource: "platform.notifications.template", scopeDimensions: [] },
    { action: "activate", applicationId: "crm", code: "platform.notifications.template:activate", resource: "platform.notifications.template", scopeDimensions: [] },
    { action: "read", applicationId: "platform", code: "platform.authentication.session-policy:read", resource: "platform.authentication.session-policy", scopeDimensions: [] },
    { action: "manage", applicationId: "platform", code: "platform.authentication.session-policy:manage", resource: "platform.authentication.session-policy", scopeDimensions: [] },
  ];
  const crmPermissionCodes = permissions.filter(({ code }) => !code.startsWith("platform.authentication.session-policy:")).map(({ code }) => ({ permissionCode: code, scope: { terms: [{ kind: "all" }], version: 1 } }));
  const applicationUserPermissions = ["crm.application:access", "platform.workbench.shell:read"].map((permissionCode) => ({ permissionCode, scope: { terms: [{ kind: "all" }], version: 1 } }));
  return {
    contractVersion: "authorization-policy.v2",
    publicationId: includeCrmGrant ? ZSJ_CRM_LOCAL_IDS.crmPolicyPublicationV4Id : ZSJ_CRM_LOCAL_IDS.superPolicyPublicationV4Id,
    publishedAt: BOOTSTRAP_AT,
    snapshot: {
      grants: includeCrmGrant ? [
        { grantId: ZSJ_CRM_LOCAL_IDS.crmAdministratorRoleGrantId, roleId: ZSJ_CRM_LOCAL_IDS.crmAdministratorRoleId, subject: { assignmentId: ZSJ_CRM_LOCAL_IDS.crmAdministratorAssignmentId, kind: "assignment" }, validFrom: BOOTSTRAP_AT },
        { grantId: ZSJ_CRM_LOCAL_IDS.crmApplicationUserGrantId, roleId: ZSJ_CRM_LOCAL_IDS.crmApplicationUserRoleId, subject: { assignmentId: ZSJ_CRM_LOCAL_IDS.crmAdministratorAssignmentId, kind: "assignment" }, validFrom: BOOTSTRAP_AT },
      ] : [],
      permissions,
      roles: [
        { displayName: "CRM系统管理员", permissions: crmPermissionCodes, roleId: ZSJ_CRM_LOCAL_IDS.crmAdministratorRoleId, roleKey: "crm.system-administrator" },
        { displayName: "CRM基础访问用户", permissions: applicationUserPermissions, roleId: ZSJ_CRM_LOCAL_IDS.crmApplicationUserRoleId, roleKey: "crm.application-user" },
      ],
      schemaVersion: 2,
      superAdministratorGrants: [{ grantId: ZSJ_CRM_LOCAL_IDS.zsjSuperAdministratorGrantId, validFrom: BOOTSTRAP_AT, workforcePersonId: ZSJ_CRM_LOCAL_IDS.zsjAdministratorPersonId }],
      version: includeCrmGrant ? "zsj-crm-local.v4" : "zsj-crm-local.super.v4",
    },
  };
}

function createRegistry(module, runtime, audit) {
  const authorizer = { authorize: async (request) => ({ allowed: request.actor.actorType === "system", decisionId: stableUuid(request.resourceId, request.action) }) };
  const registryAudit = { record: (input) => {
    const auditOperationId = stableUuid(input.operationId, `app-registry-audit:${input.result}`);
    return audit.record({ action: `app_registry.${input.action}`, actor: input.actor, auditId: auditOperationId, occurredAt: BOOTSTRAP_AT, reason: { code: "local_bootstrap", detail: input.operationId }, resource: { resourceId: input.resourceId, resourceType: input.resourceType }, result: input.result, trace: { ...(input.authorizationDecisionId ? { authorizationDecisionId: input.authorizationDecisionId } : {}), operationId: auditOperationId, traceId: input.traceId } });
  } };
  return module.createApplicationRegistryService(module.createPrismaApplicationRegistryStore(runtime), authorizer, registryAudit);
}

function registryPorts(registry) {
  return { ensureWorkforceAdministration: async (input) => {
    const common = registryMetadata(input.operationId); const results = [];
    results.push(await registry.mutate({ ...common, application: { applicationId: "crm", audience: "internal", enabled: true, permissionCode: "crm.application:access" }, kind: "register_application", operationId: stableUuid(input.operationId, "crm-application") }));
    const commonRoutes = [
      ["crm.workspace.unconfigured", "/crm/workspace"],
      ["crm.calendar.schedule", "/crm/calendar/schedule"],
      ["crm.calendar.interview-plan", "/crm/calendar/interview-plan"],
      ["crm.approvals.mine", "/crm/approvals/mine"],
      ["crm.approvals.todo", "/crm/approvals/todo"],
      ["crm.approvals.all", "/crm/approvals/all"],
      ["crm.notifications.all", "/crm/notifications/all"],
      ["crm.notifications.todo", "/crm/notifications/todo"],
      ["crm.notifications.system", "/crm/notifications/system"],
      ["crm.mail.inbox", "/crm/mail/inbox"],
      ["crm.mail.sent", "/crm/mail/sent"],
      ["crm.mail.draft", "/crm/mail/draft"],
      ["crm.settings.system", "/crm/settings/system"],
      ["crm.settings.profile", "/crm/settings/profile"],
    ];
    for (const [index, [navigationId, path]] of commonRoutes.entries()) {
      const routeId = `${navigationId}.route`;
      results.push(await registry.mutate({ ...common, kind: "register_route", operationId: stableUuid(input.operationId, `crm-route:${navigationId}`), route: { applicationId: "crm", deepLinkSources: [], enabled: true, path, permissionCode: "crm.application:access", routeId } }));
      results.push(await registry.mutate({ ...common, kind: "register_navigation", navigation: { applicationId: "crm", enabled: true, navigationId, order: 100 + index, routeId }, operationId: stableUuid(input.operationId, `crm-navigation:${navigationId}`) }));
    }
    results.push(await registry.mutate({ ...common, application: { applicationId: "crm.workforce-administration", audience: "internal", enabled: true, permissionCode: "crm.workforce-administration:view" }, kind: "register_application" }));
    results.push(await registry.mutate({ ...common, kind: "register_route", operationId: stableUuid(input.operationId, "route"), route: { applicationId: "crm.workforce-administration", deepLinkSources: [], enabled: true, path: "/workforce-administration", permissionCode: "crm.workforce-administration:view", routeId: "crm.workforce-administration.route" } }));
    results.push(await registry.mutate({ ...common, kind: "register_navigation", navigation: { applicationId: "crm.workforce-administration", enabled: true, navigationId: "crm.workforce-administration", order: 10, routeId: "crm.workforce-administration.route" }, operationId: stableUuid(input.operationId, "navigation") }));
    results.push(await registry.mutate({ ...common, application: { applicationId: "crm.notification-templates", audience: "internal", enabled: true, permissionCode: "platform.notifications.template:read" }, kind: "register_application", operationId: stableUuid(input.operationId, "notification-template-application") }));
    results.push(await registry.mutate({ ...common, kind: "register_route", operationId: stableUuid(input.operationId, "notification-template-route"), route: { applicationId: "crm.notification-templates", deepLinkSources: [], enabled: true, path: "/notification-templates", permissionCode: "platform.notifications.template:read", routeId: "crm.notification-templates.route" } }));
    results.push(await registry.mutate({ ...common, kind: "register_navigation", navigation: { applicationId: "crm.notification-templates", enabled: true, navigationId: "crm.notification-templates", order: 20, routeId: "crm.notification-templates.route" }, operationId: stableUuid(input.operationId, "notification-template-navigation") }));
    results.push(await registry.mutate({ ...common, application: { applicationId: "crm.session-policy", audience: "internal", enabled: true, permissionCode: "platform.authentication.session-policy:read" }, kind: "register_application", operationId: stableUuid(input.operationId, "session-policy-application") }));
    results.push(await registry.mutate({ ...common, kind: "register_route", operationId: stableUuid(input.operationId, "session-policy-route"), route: { applicationId: "crm.session-policy", deepLinkSources: [], enabled: true, path: "/settings/session-policy", permissionCode: "platform.authentication.session-policy:read", routeId: "crm.session-policy.route" } }));
    results.push(await registry.mutate({ ...common, kind: "register_navigation", navigation: { applicationId: "crm.session-policy", enabled: true, navigationId: "crm.session-policy", order: 30, routeId: "crm.session-policy.route" }, operationId: stableUuid(input.operationId, "session-policy-navigation") }));
    return { status: results.every(({ replayed }) => replayed) ? "existing" : "created" };
  } };
}

function createAudit(module, runtime) {
  return module.createAuditService(module.createPrismaAuditStore(runtime), { authorize: () => Promise.resolve({ allowed: false, decisionId: stableUuid("audit", "denied") }) }, { fieldPolicies: {} });
}

function organizationPersistenceRuntime(runtime, audit, eventing) {
  return {
    execute: (...args) => runtime.execute(...args),
    withTransaction: (work) => runtime.withTransaction(work),
    recordAuditIntent: (input) => audit.record({ action: input.action, actor: { actorId: input.actorId, actorType: input.actorType }, auditId: stableUuid(input.operationId, "organization-audit"), reason: { code: "local_bootstrap" }, resource: { resourceId: input.entityId, resourceType: input.entityType }, result: input.result, trace: { operationId: input.operationId, traceId: traceId(input.traceId) } }),
    recordEventIntent: (input) => eventing.appendEvent({ specversion: "1.0", id: input.operationId, source: "urn:ai-crm:organization", type: "organization.change.v1", time: input.effectiveAt, datacontenttype: "application/json", dataschema: "urn:ai-crm:events:organization-change:v1", correlationid: input.operationId, subject: input.entityId, traceparent: `00-${traceId(input.traceId)}-${createHash("sha256").update(`organization-change:${input.operationId}`).digest("hex").slice(0, 16)}-01`, data: input }),
  };
}

async function createKeycloakAdmin(env, fetchImpl) {
  const base = env.AI_CRM_LOCAL_KEYCLOAK_BASE_URL; const realm = env.AI_CRM_LOCAL_KEYCLOAK_REALM ?? "ai-crm-dev"; const adminRealm = env.AI_CRM_LOCAL_KEYCLOAK_ADMIN_REALM ?? "master";
  let url; try { url = new URL(base); } catch { throw new ZsjCrmBootstrapError("keycloak_base_url_invalid"); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || !["", "/"].includes(url.pathname) || url.username || url.password || url.search || url.hash) throw new ZsjCrmBootstrapError("keycloak_base_url_invalid");
  if (!/^[A-Za-z0-9._-]{1,64}$/u.test(realm) || !/^[A-Za-z0-9._-]{1,64}$/u.test(adminRealm)) throw new ZsjCrmBootstrapError("keycloak_realm_invalid");
  const username = await secret(env, "AI_CRM_LOCAL_KEYCLOAK_ADMIN_USERNAME_FILE"); const password = await secret(env, "AI_CRM_LOCAL_KEYCLOAK_ADMIN_PASSWORD_FILE"); let accessToken; let realmPasswordPolicyReady = false; let userProfileReady = false;
  const realmTemplate = JSON.parse(await readFile(new URL("../../deploy/keycloak/realm-dev.json", import.meta.url), "utf8"));
  const passwordPolicy = realmTemplate.passwordPolicy;
  if (typeof passwordPolicy !== "string" || passwordPolicy.length === 0 || passwordPolicy.length > 1024 || /[\0\r\n]/u.test(passwordPolicy)) throw new ZsjCrmBootstrapError("keycloak_password_policy_invalid");
  const request = async (path, init = {}) => {
    if (!accessToken) { const response = await fetchImpl(new URL(`realms/${adminRealm}/protocol/openid-connect/token`, url), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: "admin-cli", grant_type: "password", password, username }) }); if (!response.ok) throw new ZsjCrmBootstrapError("keycloak_admin_auth_failed"); const body = await response.json(); if (typeof body.access_token !== "string") throw new ZsjCrmBootstrapError("keycloak_admin_auth_failed"); accessToken = body.access_token; }
    const response = await fetchImpl(new URL(path, url), { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${accessToken}`, "content-type": "application/json" } });
    if (response.status === 401) accessToken = undefined;
    return response;
  };
  const find = async (account) => { const response = await request(`admin/realms/${realm}/users?exact=true&username=${encodeURIComponent(account.username)}`); if (!response.ok) throw new ZsjCrmBootstrapError("keycloak_admin_unavailable"); const users = await response.json(); if (!Array.isArray(users) || users.length > 1) throw new ZsjCrmBootstrapError("keycloak_account_conflict"); const user = users[0]; if (!user) return undefined; const attributes = user.attributes ?? {}; const requiredActions = user.requiredActions ?? []; if (attributes.ai_crm_account_id?.[0] !== account.accountId || attributes.phone_login_key?.[0] !== account.phone || typeof user.id !== "string" || !Array.isArray(requiredActions) || requiredActions.some((action) => typeof action !== "string")) throw new ZsjCrmBootstrapError("keycloak_account_conflict"); return { enabled: user.enabled === true, requiredActions, userId: user.id }; };
  const issuer = new URL(`realms/${realm}`, url).href.replace(/\/$/u, "");
  const ensureRealmPasswordPolicy = async () => { if (realmPasswordPolicyReady) return; const current = await request(`admin/realms/${realm}`); if (!current.ok) throw new ZsjCrmBootstrapError("keycloak_realm_read_failed"); const representation = await current.json(); if (representation?.passwordPolicy !== passwordPolicy) { const update = await request(`admin/realms/${realm}`, { method: "PUT", body: JSON.stringify({ passwordPolicy }) }); if (!update.ok) throw new ZsjCrmBootstrapError("keycloak_password_policy_update_failed"); } realmPasswordPolicyReady = true; };
  return { clear: () => { accessToken = undefined; }, issuer, ensureRealmPasswordPolicy, ensureUserProfile: async () => { if (userProfileReady) return; const profile = JSON.parse(await readFile(new URL("../../deploy/keycloak/user-profile-dev.json", import.meta.url), "utf8")); const response = await request(`admin/realms/${realm}/users/profile`, { method: "PUT", body: JSON.stringify(profile) }); if (!response.ok) throw new ZsjCrmBootstrapError("keycloak_user_profile_update_failed"); userProfileReady = true; }, findUser: find, enableUser: async (user) => { if (user.enabled === true) return false; const response = await request(`admin/realms/${realm}/users/${user.userId}`, { method: "PUT", body: JSON.stringify({ enabled: true }) }); if (!response.ok) throw new ZsjCrmBootstrapError("keycloak_user_enable_failed"); return true; }, ensureUser: async (account) => { const existing = await find(account); if (existing) return { ...existing, created: false }; const response = await request(`admin/realms/${realm}/users`, { method: "POST", body: JSON.stringify({ attributes: { ai_crm_account_id: [account.accountId], phone_login_key: [account.phone] }, credentials: [{ temporary: true, type: "password", value: account.password }], enabled: false, requiredActions: ["UPDATE_PASSWORD"], username: account.username }) }); if (response.status !== 201 && response.status !== 409) throw new ZsjCrmBootstrapError("keycloak_user_create_failed"); const user = await find(account); if (!user) throw new ZsjCrmBootstrapError("keycloak_user_create_failed"); return { ...user, created: response.status === 201 }; } };
}

async function secret(env, name) { const path = env[name]; if (!path || !isAbsolute(path)) throw new ZsjCrmBootstrapError("secret_path_invalid"); return readRestrictedSecret(path); }
function metadata(operationId) { return { actor: SYSTEM_ACTOR, operationId, reason: "zsj_crm_local_bootstrap", traceId: traceId(operationId) }; }
function registryMetadata(operationId) { return { actor: SYSTEM_ACTOR, operationId, reason: "zsj_crm_local_bootstrap", traceId: traceId(operationId) }; }
function publicationStatus(result) { return { status: result.replayed ? "existing" : "created" }; }
function containsDepartment(nodes, id) { return nodes.some((node) => node.organizationUnitId === id || containsDepartment(node.children, id)); }
function traceId(value) { return createHash("sha256").update(value).digest("hex").slice(0, 32); }
function stableUuid(value, purpose) { const hex = createHash("sha256").update(`${value}:${purpose}`).digest("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`; }
async function loadPlatformModules() { return { database: await import("../../packages/database/dist/index.js"), organization: await import("../../packages/platform-modules/organization/dist/index.js"), workforce: await import("../../packages/platform-modules/workforce-access/dist/index.js"), authorization: await import("../../packages/platform-modules/authorization/dist/index.js"), registry: await import("../../packages/platform-modules/app-registry/dist/index.js"), audit: await import("../../packages/platform-modules/audit/dist/index.js"), eventing: await import("../../packages/platform-modules/eventing-outbox/dist/index.js") }; }
