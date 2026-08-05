import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import YAML from "yaml";

import { mergeComposeModels, validateEffectiveComposeSafety } from "./compose-safety.mjs";

const root = resolve(import.meta.dirname, "../..");
const parseCompose = async (path) => YAML.parse(await readFile(resolve(root, path), "utf8"), { merge: true });
const [base, dev, test, e2e, rabbitmqIntegration, productionA, productionB] = await Promise.all([
  parseCompose("deploy/compose/compose.base.yml"),
  parseCompose("deploy/compose/compose.dev.yml"),
  parseCompose("deploy/compose/compose.test.yml"),
  parseCompose("deploy/compose/compose.e2e.yml"),
  parseCompose("deploy/compose/compose.rabbitmq-integration.yml"),
  parseCompose("deploy/compose/production/compose.host-a.yml"),
  parseCompose("deploy/compose/production/compose.host-b.yml"),
]);
const [secretBootstrap, rabbitmqFixtureBootstrap, productionNginx, productionRedisEntrypoint, productionRabbitEntrypoint] = await Promise.all([
  readFile(resolve(root, "scripts/bootstrap/compose-secrets.mjs"), "utf8"),
  readFile(resolve(root, "scripts/bootstrap/rabbitmq-integration-fixture.mjs"), "utf8"),
  readFile(resolve(root, "deploy/nginx/nginx.production.conf.template"), "utf8"),
  readFile(resolve(root, "deploy/compose/production/redis-entrypoint.sh"), "utf8"),
  readFile(resolve(root, "deploy/compose/production/rabbitmq-entrypoint.sh"), "utf8"),
]);
const errors = [];
const secretMounts = (service) => new Map((service?.secrets ?? []).map((secret) => {
  const source = typeof secret === "string" ? secret : secret?.source;
  const target = typeof secret === "string" ? secret : secret?.target ?? source;
  return [source, target];
}));

for (const [label, model, options] of [
  ["development", mergeComposeModels(base, dev), {}],
  ["test", mergeComposeModels(base, test), {}],
  ["e2e", mergeComposeModels(mergeComposeModels(base, test), e2e), {}],
  ["rabbitmq-integration", mergeComposeModels(base, rabbitmqIntegration), {}],
  ["host-a", productionA, { production: true }],
  ["host-b", productionB, { production: true }],
]) errors.push(...validateEffectiveComposeSafety(model, label, options));

if (!base.services?.postgres?.secrets?.includes("postgres_migration_password")) errors.push("PostgreSQL must receive a distinct migration credential file.");
for (const name of ["postgres", "redis", "rabbitmq", "flowable", "clamav", "nginx"]) {
  const service = base.services?.[name];
  if (!service) { errors.push(`Missing service ${name}.`); continue; }
  if (!service.image || service.image.endsWith(":latest") || !service.image.includes(":")) errors.push(`${name} must use a fixed image tag.`);
  if (!service.healthcheck) errors.push(`${name} must define a healthcheck.`);
  if (!service.logging?.options?.["max-size"] || !service.logging?.options?.["max-file"]) errors.push(`${name} must rotate logs.`);
  if (!service.deploy?.resources?.limits?.memory || !service.deploy?.resources?.limits?.cpus) errors.push(`${name} must define resource limits.`);
  if (!service.stop_grace_period) errors.push(`${name} must define graceful stop behavior.`);
  if (service.ports) errors.push(`${name} must not publish ports in the base definition.`);
}
if (!secretBootstrap.includes('"session_index_key"') || !secretBootstrap.includes('"system_admin_password"')) errors.push("Development/test Secret bootstrap must create the Session index and system administrator password files.");
if (/keycloak|oidc/iu.test(JSON.stringify(base))) errors.push("Base Compose must not contain an external identity provider.");
for (const [name, service] of Object.entries(dev.services ?? {})) for (const port of service.ports ?? []) if (!String(port).startsWith("127.0.0.1:")) errors.push(`${name} publishes a non-loopback development port.`);
if (base.networks?.backend?.external) errors.push("The backend network must remain project-scoped.");
for (const [name, service] of Object.entries(test.services ?? {})) if (service?.ports) errors.push(`${name} must not publish test ports.`);

const effectiveE2e = mergeComposeModels(mergeComposeModels(base, test), e2e);
const expectedE2eServices = ["api-e2e", "clamav", "flowable", "nginx", "postgres", "rabbitmq", "redis", "workbench-e2e", "worker-e2e"];
const actualE2eServices = Object.keys(effectiveE2e.services ?? {}).sort();
if (actualE2eServices.length !== expectedE2eServices.length || actualE2eServices.some((name, index) => name !== expectedE2eServices[index])) errors.push("E2E Compose must contain the six dependencies plus API, Worker, and Workbench test processes.");
for (const [name, service] of Object.entries(effectiveE2e.services ?? {})) for (const port of service?.ports ?? []) if (name !== "postgres" || !String(port).startsWith("127.0.0.1:")) errors.push(`${name} publishes a non-loopback or unreviewed E2E port.`);
if (effectiveE2e.services?.["api-e2e"]?.environment?.AI_CRM_E2E_PROCESS_ENTRYPOINT !== "api" || effectiveE2e.services?.["worker-e2e"]?.environment?.AI_CRM_E2E_PROCESS_ENTRYPOINT !== "worker" || effectiveE2e.services?.["worker-e2e"]?.environment?.AI_CRM_E2E_WORKER_REAL_INFRA !== "true" || effectiveE2e.services?.["worker-e2e"]?.environment?.AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED !== "true") errors.push("E2E process entry points must be explicit and the isolated Worker must activate the real Task consumer.");

const rabbitmqIntegrationService = rabbitmqIntegration.services?.rabbitmq;
if (rabbitmqIntegrationService?.image !== "rabbitmq:4.2.9-management" || rabbitmqIntegrationService?.ports?.length !== 1 || !String(rabbitmqIntegrationService.ports[0]).startsWith("127.0.0.1:${AI_CRM_TEST_RABBITMQ_TLS_PORT:?") || !rabbitmqIntegrationService?.healthcheck || !rabbitmqIntegrationService?.stop_grace_period || !rabbitmqIntegrationService?.deploy?.resources?.limits?.memory || !rabbitmqIntegrationService?.logging?.options?.["max-size"]) errors.push("RabbitMQ integration Compose must pin 4.2.9, publish only an explicit loopback TLS port, and retain lifecycle limits.");
const rabbitmqIntegrationMounts = rabbitmqIntegrationService?.volumes?.map(String) ?? [];
if (rabbitmqIntegrationMounts.length !== 5 || rabbitmqIntegrationMounts.some((mount) => !mount.endsWith(":ro")) || rabbitmqIntegrationMounts.some((mount) => /(?:ca\.key|untrusted|_password|_username|\/vhost)(?::|$)/u.test(mount))) errors.push("RabbitMQ integration container must receive only its five required read-only TLS/configuration files.");
for (const requiredText of [
  '"listeners.tcp = none"',
  '"listeners.ssl.default = 5671"',
  '"ssl_options.verify = verify_peer"',
  'publisher: { name: "ai_crm_integration_publisher"',
  'consumer: { name: "ai_crm_integration_consumer"',
  'configure: "^$", write: "^ai\\\\.crm\\\\.events$", read: "^$"',
  'configure: "^$", write: "^$", read: "^ai\\\\.crm\\\\.integration$"',
]) if (!rabbitmqFixtureBootstrap.includes(requiredText)) errors.push(`RabbitMQ integration fixture is missing required fail-closed boundary: ${requiredText}`);

const productionDefinitions = [
  ["host-a", productionA, "ai-crm-prod-a", ["api", "clamav", "edge", "flowable", "postgres", "rabbitmq", "redis"]],
  ["host-b", productionB, "ai-crm-prod-b", ["api", "edge", "worker"]],
];
for (const [host, definition, project, expectedServices] of productionDefinitions) {
  if (definition.name !== project) errors.push(`${host} must use the independent Compose project ${project}.`);
  const actualServices = Object.keys(definition.services ?? {}).sort();
  if (actualServices.length !== expectedServices.length || actualServices.some((name, index) => name !== expectedServices[index])) errors.push(`${host} has an unexpected production service placement.`);
  for (const [name, service] of Object.entries(definition.services ?? {})) {
    if (typeof service.image !== "string" || !/^\$\{AI_CRM_[A-Z0-9_]+_IMAGE:\?[^}]+\}$/u.test(service.image)) errors.push(`${host}/${name} must receive its reviewed immutable image reference explicitly.`);
    if (!service.healthcheck) errors.push(`${host}/${name} must define a healthcheck.`);
    if (!service.logging?.options?.["max-size"] || !service.logging?.options?.["max-file"]) errors.push(`${host}/${name} must rotate logs.`);
    if (!service.deploy?.resources?.limits?.memory || !service.deploy?.resources?.limits?.cpus) errors.push(`${host}/${name} must require resource limits.`);
    if (!service.stop_grace_period) errors.push(`${host}/${name} must define graceful stop behavior.`);
    if (service.privileged === true || service.volumes?.some((volume) => String(volume).includes("/var/run/docker.sock"))) errors.push(`${host}/${name} must not be privileged or mount the Docker Socket.`);
    if (!service.security_opt?.includes("no-new-privileges:true") || !service.cap_drop?.includes("ALL")) errors.push(`${host}/${name} must drop capabilities and prevent privilege escalation.`);
    for (const port of service.ports ?? []) {
      const value = String(port);
      if (name === "edge") {
        if (value !== "80:8080" && value !== "443:8443") errors.push(`${host}/edge has an unexpected public port.`);
      } else if (!value.startsWith("${AI_CRM_PRIVATE_BIND_ADDRESS:?")) {
        errors.push(`${host}/${name} must bind published ports to the reviewed private address.`);
      }
    }
    if ((service.secrets?.length ?? 0) > 0 && !service.group_add?.includes("${AI_CRM_SECRET_GID:?secret reader gid is required}")) errors.push(`${host}/${name} must receive only the approved supplementary Secret-reader group.`);
  }
  for (const [name, secret] of Object.entries(definition.secrets ?? {})) if (typeof secret?.file !== "string" || !secret.file.startsWith("${AI_CRM_SECRET_ROOT:?")) errors.push(`${host} Secret ${name} must be a target-host file reference.`);
  if (/\blatest\b/iu.test(JSON.stringify(definition)) || /(?:^|[/\\])\.env(?:$|["'])/iu.test(JSON.stringify(definition))) errors.push(`${host} must not use latest images or a production .env file.`);
}

for (const [host, definition] of [["host-a", productionA], ["host-b", productionB]]) {
  for (const name of ["api", "edge", ...(host === "host-b" ? ["worker"] : [])]) if (definition.services?.[name]?.read_only !== true || typeof definition.services?.[name]?.user !== "string") errors.push(`${host}/${name} application container must be read-only and non-root.`);
  const api = definition.services?.api;
  const mounts = secretMounts(api);
  for (const name of ["api_postgres_url", "api_cos_secret_id", "api_cos_secret_key", "redis_password", "session_index_key", "realtime_rabbit_url"]) {
    if (mounts.get(name) !== name) errors.push(`${host}/api must mount ${name} at /run/secrets/${name}.`);
  }
  const appSubnet = definition.networks?.app?.ipam?.config?.[0]?.subnet;
  if (api?.environment?.AI_CRM_SESSION_INDEX_KEY_FILE !== "/run/secrets/session_index_key" ||
    api?.environment?.AI_CRM_REDIS_PASSWORD_FILE !== "/run/secrets/redis_password" ||
    api?.environment?.AI_CRM_POSTGRES_URL_FILE !== "/run/secrets/api_postgres_url" ||
    api?.environment?.AI_CRM_REALTIME_RABBIT_URL_FILE !== "/run/secrets/realtime_rabbit_url" ||
    api?.environment?.AI_CRM_COS_SECRET_ID_FILE !== "/run/secrets/api_cos_secret_id" ||
    api?.environment?.AI_CRM_COS_SECRET_KEY_FILE !== "/run/secrets/api_cos_secret_key" ||
    typeof api?.environment?.AI_CRM_COS_BUCKET !== "string" ||
    typeof api?.environment?.AI_CRM_COS_REGION !== "string" ||
    api?.environment?.AI_CRM_MIGRATIONS_ROOT !== "/app" ||
    typeof api?.environment?.AI_CRM_API_SCHEMA_VERSION !== "string" ||
    typeof api?.environment?.AI_CRM_API_STARTUP_TIMEOUT_MS !== "string" ||
    typeof api?.environment?.AI_CRM_API_SHUTDOWN_TIMEOUT_MS !== "string" ||
    typeof appSubnet !== "string" ||
    api?.environment?.AI_CRM_API_TRUSTED_PROXY_CIDRS !== appSubnet ||
    api?.environment?.AI_CRM_PC_ALLOWED_ORIGIN !== "https://${AI_CRM_PUBLIC_HOST:?public host is required}" ||
    api?.environment?.AI_CRM_INTERNAL_H5_ALLOWED_ORIGIN !== "https://${AI_CRM_PUBLIC_HOST:?public host is required}") errors.push(`${host}/api must receive the reviewed database, migration, storage, Session, Origin, lifecycle, and trusted-proxy configuration.`);
  if (/keycloak|oidc|session.*encryption/iu.test(JSON.stringify(api))) errors.push(`${host}/api must not receive obsolete identity-provider or encrypted-cookie configuration.`);
  const edgeTmpfs = definition.services?.edge?.tmpfs?.map(String) ?? [];
  for (const directory of ["/etc/nginx/conf.d", "/var/cache/nginx", "/var/run", "/tmp"]) if (!edgeTmpfs.some((value) => value.startsWith(`${directory}:`) && value.includes("uid=${AI_CRM_EDGE_UID:?") && value.includes("gid=${AI_CRM_EDGE_GID:?") && value.includes("mode=0750"))) errors.push(`${host}/edge must provide a UID/GID-scoped writable tmpfs for ${directory}.`);
}

const worker = productionB.services?.worker;
const workerMounts = secretMounts(worker);
for (const name of ["worker_postgres_url", "rabbitmq_ca_certificate", "rabbitmq_publisher_username", "rabbitmq_publisher_password", "rabbitmq_consumer_username", "rabbitmq_consumer_password"]) {
  if (workerMounts.get(name) !== name) errors.push(`host-b/worker must mount ${name} at /run/secrets/${name}.`);
}
if (/keycloak|oidc/iu.test(JSON.stringify(worker))) errors.push("host-b/worker must not receive identity-provider configuration.");
if (worker?.environment?.AI_CRM_WORKER_DRAIN_TIMEOUT_SECONDS !== "${AI_CRM_WORKER_DRAIN_TIMEOUT_SECONDS:?required}" || worker?.stop_grace_period !== "${AI_CRM_WORKER_STOP_GRACE_PERIOD:?required}") errors.push("host-b/worker must require explicit drain seconds and stop grace duration for rendered numeric verification.");
if (worker?.environment?.AI_CRM_POSTGRES_URL_FILE !== "/run/secrets/worker_postgres_url" ||
  worker?.environment?.AI_CRM_RABBIT_CA_FILE !== "/run/secrets/rabbitmq_ca_certificate" ||
  worker?.environment?.AI_CRM_RABBIT_PUBLISHER_USERNAME_FILE !== "/run/secrets/rabbitmq_publisher_username" ||
  worker?.environment?.AI_CRM_RABBIT_PUBLISHER_PASSWORD_FILE !== "/run/secrets/rabbitmq_publisher_password" ||
  worker?.environment?.AI_CRM_RABBIT_CONSUMER_USERNAME_FILE !== "/run/secrets/rabbitmq_consumer_username" ||
  worker?.environment?.AI_CRM_RABBIT_CONSUMER_PASSWORD_FILE !== "/run/secrets/rabbitmq_consumer_password" ||
  worker?.environment?.AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED !== "${AI_CRM_WORKER_TASK_PROJECTION_CONSUMER_ENABLED:?explicit reviewed activation is required}" ||
  worker?.environment?.AI_CRM_RABBIT_TLS !== "true" || worker?.environment?.AI_CRM_RABBIT_PORT !== "5671") errors.push("host-b/worker must receive exact Secret paths, explicit Task projection activation, and AMQPS configuration.");
for (const name of ["AI_CRM_WORKER_OUTBOX_BATCH_SIZE", "AI_CRM_WORKER_OUTBOX_CLAIM_LEASE_SECONDS", "AI_CRM_WORKER_OUTBOX_MAX_ATTEMPTS", "AI_CRM_WORKER_OUTBOX_BACKOFF_SECONDS", "AI_CRM_WORKER_OUTBOX_INTERVAL_MS"]) {
  if (typeof worker?.environment?.[name] !== "string" || !worker.environment[name].startsWith(`\${${name}:?`)) errors.push(`host-b/worker must require reviewed release input ${name}.`);
}

const activeErrorLogs = [...productionNginx.matchAll(/^\s*error_log\s+([^;]+);\s*$/gmu)].map((match) => match[1]?.trim());
if (!productionNginx.includes("access_log /dev/stdout safe_technical") || activeErrorLogs.length !== 1 || activeErrorLogs[0] !== "/dev/stderr crit" || /log_format[^;]*\$(?:request(?:\s|['"])|request_uri|args|remote_addr)/u.test(productionNginx)) errors.push("Production Nginx logs must exclude URL/query/IP/referrer content and use bounded technical fields.");
for (const path of ["pc", "internal-h5"]) {
  const location = productionNginx.match(new RegExp(`location \/auth\/${path}\/ \\{([^}]*)\\}`, "u"))?.[1];
  if (!location || !/^\s*proxy_pass http:\/\/ai_crm_api;\s*$/mu.test(location) || /^\s*(?:rewrite|try_files)\b/mu.test(location)) errors.push(`Production Nginx must proxy /auth/${path}/ to the API without rewriting its path.`);
}
for (const prefix of ["realms", "resources", "external"]) {
  const location = productionNginx.match(new RegExp(`location \\^~ \/${prefix}\/ \\{([^}]*)\\}`, "u"))?.[1];
  if (!location || !/^\s*return 404;\s*$/mu.test(location)) errors.push(`Production Nginx must explicitly return 404 for removed /${prefix}/ routes.`);
}
for (const prefix of ["realms", "external"]) {
  if (!new RegExp(`location = \/${prefix} \\{\\s*return 404;\\s*\\}`, "u").test(productionNginx)) errors.push(`Production Nginx must explicitly return 404 for the removed /${prefix} root.`);
}
if (!productionRedisEntrypoint.includes('${#password}') || !productionRedisEntrypoint.includes("*[!A-Za-z0-9_-]*") || productionRedisEntrypoint.includes("console.log")) errors.push("Redis production entrypoint must validate its Secret without emitting it.");
for (const requiredText of ["listeners.tcp = none", "listeners.ssl.default = 5671", "ssl_options.verify = verify_peer", "rabbitmq_publisher_username", "rabbitmq_consumer_username"]) if (!productionRabbitEntrypoint.includes(requiredText)) errors.push(`RabbitMQ production entrypoint is missing the reviewed TLS/least-privilege boundary: ${requiredText}`);
const publisherPermissions = '{"user":"$publisher_username","vhost":"$vhost","configure":"^ai-crm\\\\.platform\\\\.events\\\\.v1$","write":"^ai-crm\\\\.platform\\\\.events\\\\.v1$","read":"^$"}';
const consumerPattern = '^(ai-crm\\\\.platform\\\\.(events|retry|dead-letter)\\\\.v1|ai-crm\\\\.platform\\\\.task-center\\\\.projection(\\\\.retry\\\\.(30s|300s)|\\\\.dead)?\\\\.v1)$';
const consumerPermissions = `{"user":"$consumer_username","vhost":"$vhost","configure":"${consumerPattern}","write":"${consumerPattern}","read":"${consumerPattern}"}`;
if (!productionRabbitEntrypoint.includes(publisherPermissions) || !productionRabbitEntrypoint.includes(consumerPermissions)) {
  errors.push("RabbitMQ production permissions must cover only the reviewed topology and every queue used by the sealed consumer.");
}

if (/"[^"\n]*(?:PASSWORD|SECRET|TOKEN)"\s*:\s*"(?!\/run\/secrets\/)[^"$]/i.test(JSON.stringify(base))) errors.push("Compose contains a literal credential-like environment value.");
if (errors.length > 0) { for (const error of errors) console.error(error); process.exit(1); }
console.log("Compose definitions satisfy the INF-01 static safety baseline.");
