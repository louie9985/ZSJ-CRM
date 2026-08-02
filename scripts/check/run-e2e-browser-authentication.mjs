/* global URL, URLSearchParams, WebSocket, clearTimeout, fetch, setTimeout */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const failures = [];
let adminAccessToken = "";
let bff;
let browser;
let bffPort;
let chromePort;
let chromeProfile;
let compose;
let edgePort;
let environment;
let harnessBuildDirectory;
let issuer;
let keycloakPort;
let project;
let publicOrigin;
let redisPort;
let secretDirectory;
let syntheticUserId = "";
let taskCompletionAccepted = false;
let taskAuthorizationDenied = false;
let taskCompletionReplayed = false;
let applicationRegistryLoaded = false;
let deepLinkResolved = false;
let deepLinkNavigated = false;
let formRendered = false;
let formServerValidated = false;
let formFileReferenceMatched = false;
let browserTraceId;
let browserTraceparent;
let durableTaskObserved = false;
let durableNotificationObserved = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { env: environment, shell: false, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed.`);
}

async function runAsync(command, args, options = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { env: environment, shell: false, stdio: "inherit", ...options });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args[0] ?? ""} failed.`));
    });
  });
}

async function availablePorts(count) {
  const servers = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const server = createServer();
      await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, "127.0.0.1", resolveListen);
      });
      servers.push(server);
    }
    return servers.map((server) => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("e2e_browser_auth_port_unavailable");
      return address.port;
    });
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolveClose) => { server.close(resolveClose); })));
  }
}

async function assertPortAvailable(port, name) {
  await new Promise((resolveAvailable, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`${name}_port_unavailable`)));
    server.listen(port, "127.0.0.1", () => server.close(resolveAvailable));
  });
}

async function waitFor(check, code, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(code, { cause: lastError });
}

async function keycloakAdminToken(password) {
  const response = await fetch(`http://localhost:${String(keycloakPort)}/realms/master/protocol/openid-connect/token`, {
    body: new URLSearchParams({ client_id: "admin-cli", grant_type: "password", password, username: "dev_admin" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) throw new Error("e2e_browser_auth_keycloak_admin_failed");
  const body = await response.json();
  if (!body || typeof body.access_token !== "string") throw new Error("e2e_browser_auth_keycloak_admin_invalid");
  return body.access_token;
}

async function createSyntheticUser(username, password) {
  const restoredFixture = process.env.AI_CRM_E2E_IDENTITY_FIXTURE_FILE === undefined ? undefined : JSON.parse(await readFile(process.env.AI_CRM_E2E_IDENTITY_FIXTURE_FILE, "utf8"));
  const adminPassword = restoredFixture?.adminPassword ?? (await readFile(resolve(secretDirectory, "keycloak_bootstrap_password"), "utf8")).trim();
  if (typeof adminPassword !== "string" || adminPassword.length < 16) throw new Error("e2e_browser_auth_identity_fixture_invalid");
  adminAccessToken = await keycloakAdminToken(adminPassword);
  const clientsResponse = await fetch(`http://localhost:${String(keycloakPort)}/admin/realms/ai-crm-dev/clients?clientId=ai-crm-pc-bff`, {
    headers: { authorization: `Bearer ${adminAccessToken}` },
  });
  const clients = await clientsResponse.json();
  const client = clientsResponse.ok && Array.isArray(clients) && clients.length === 1 ? clients[0] : undefined;
  if (!client || typeof client.id !== "string") throw new Error("e2e_browser_auth_client_lookup_failed");
  const clientUpdate = await fetch(`http://localhost:${String(keycloakPort)}/admin/realms/ai-crm-dev/clients/${client.id}`, {
    body: JSON.stringify({
      ...(process.env.AI_CRM_E2E_SYNTHETIC_USER_ID === undefined ? {} : { id: process.env.AI_CRM_E2E_SYNTHETIC_USER_ID }),
      ...client,
      redirectUris: [...new Set([...(Array.isArray(client.redirectUris) ? client.redirectUris : []), `${publicOrigin}/auth/pc/callback`])],
      webOrigins: [...new Set([...(Array.isArray(client.webOrigins) ? client.webOrigins : []), publicOrigin])],
    }),
    headers: { authorization: `Bearer ${adminAccessToken}`, "content-type": "application/json" },
    method: "PUT",
  });
  if (clientUpdate.status !== 204) throw new Error("e2e_browser_auth_client_update_failed");
  if (process.env.AI_CRM_E2E_IDENTITY_FIXTURE_FILE !== undefined) {
    const fixture = restoredFixture;
    if (typeof fixture?.username !== "string" || typeof fixture?.password !== "string" || typeof fixture?.userId !== "string") throw new Error("e2e_browser_auth_identity_fixture_invalid");
    syntheticUserId = fixture.userId;
    return;
  }
  const response = await fetch(`http://localhost:${String(keycloakPort)}/admin/realms/ai-crm-dev/users`, {
    body: JSON.stringify({
      credentials: [{ temporary: false, type: "password", value: password }],
      email: `${username}@example.test`,
      emailVerified: true,
      enabled: true,
      firstName: "Synthetic",
      lastName: "BrowserAuth",
      username,
    }),
    headers: { authorization: `Bearer ${adminAccessToken}`, "content-type": "application/json" },
    method: "POST",
  });
  const location = response.headers.get("location");
  if (response.status !== 201 || !location) throw new Error("e2e_browser_auth_user_create_failed");
  syntheticUserId = new URL(location).pathname.split("/").at(-1) ?? "";
  if (!syntheticUserId) throw new Error("e2e_browser_auth_user_id_missing");
  if (process.env.AI_CRM_E2E_IDENTITY_FIXTURE_OUTPUT !== undefined) {
    const clientSecret = (await readFile(resolve(secretDirectory, "pc_oidc_client_secret"), "utf8")).trim();
    await writeFile(process.env.AI_CRM_E2E_IDENTITY_FIXTURE_OUTPUT, `${JSON.stringify({ adminPassword, clientSecret, password, userId: syntheticUserId, username })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
}

function restoreKeycloakDatabase(path) {
  const dump = readFile(path);
  return dump.then((input) => {
    const result = spawnSync("docker", [...compose, "exec", "-T", "postgres", "pg_restore", "-U", "ai_crm_admin", "-d", "keycloak", "--clean", "--if-exists"], { env: environment, input, shell: false, stdio: ["pipe", "inherit", "inherit"] });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("e2e_browser_auth_keycloak_restore_failed");
  });
}

function dumpKeycloakDatabase(path) {
  const result = spawnSync("docker", [...compose, "exec", "-T", "postgres", "pg_dump", "-U", "ai_crm_admin", "-d", "keycloak", "--format=custom"], { env: environment, encoding: "buffer", maxBuffer: 128 * 1024 * 1024, shell: false, stdio: ["ignore", "pipe", "inherit"] });
  if (result.error) throw result.error;
  if (result.status !== 0 || !(result.stdout instanceof Buffer)) throw new Error("e2e_browser_auth_keycloak_dump_failed");
  return writeFile(path, result.stdout, { flag: "wx", mode: 0o600 });
}

function chromeExecutable() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const selected = candidates.find((candidate) => existsSync(candidate));
  if (!selected) throw new Error("e2e_browser_auth_chromium_missing");
  return selected;
}

class CdpBrowser {
  constructor(processHandle, socket) {
    this.processHandle = processHandle;
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
    this.resourceEvents = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") {
        if (message.method === "Runtime.exceptionThrown") {
          const detail = message.params?.exceptionDetails;
          this.exceptions.push(String(detail?.exception?.description ?? detail?.text ?? "browser_exception"));
        }
        if (message.method === "Network.loadingFailed" && ["Document", "Fetch", "Script", "XHR"].includes(message.params?.type)) {
          this.resourceEvents.push({ error: String(message.params?.errorText ?? "loading_failed"), type: message.params.type });
        }
        if (message.method === "Network.responseReceived" && ["Document", "Fetch", "Script", "XHR"].includes(message.params?.type)) {
          const response = message.params?.response;
          let path = "invalid";
          try { path = new URL(String(response?.url)).pathname; } catch { /* Safe diagnostic remains bounded. */ }
          this.resourceEvents.push({ path, status: response?.status, type: message.params.type });
        }
        if (this.resourceEvents.length > 30) this.resourceEvents.splice(0, this.resourceEvents.length - 30);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "cdp_command_failed"));
      else pending.resolve(message.result);
    });
  }

  async command(method, params = {}) {
    const id = this.nextId++;
    const result = new Promise((resolveCommand, rejectCommand) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectCommand(new Error(`e2e_browser_auth_cdp_timeout_${method.replaceAll(".", "_")}`));
      }, 5_000);
      this.pending.set(id, {
        reject: (error) => { clearTimeout(timer); rejectCommand(error); },
        resolve: (value) => { clearTimeout(timer); resolveCommand(value); },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  async evaluate(expression) {
    const result = await this.command("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error("e2e_browser_auth_evaluation_failed");
    return result.result?.value;
  }

  async close() {
    try { await this.command("Browser.close"); } catch { /* Process termination below is authoritative. */ }
    try { this.socket.close(); } finally { await terminateProcess(this.processHandle); }
  }
}

async function terminateProcess(processHandle) {
  if (processHandle.exitCode !== null) return;
  const exited = new Promise((resolveExit) => processHandle.once("exit", resolveExit));
  processHandle.kill();
  await Promise.race([
    exited,
    new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
  ]);
  if (processHandle.exitCode === null) processHandle.kill("SIGKILL");
}

async function launchBrowser(initialUrl) {
  const processHandle = spawn(chromeExecutable(), [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${String(chromePort)}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let socket;
  try {
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${String(chromePort)}/json/version`);
      return response.ok;
    }, "e2e_browser_auth_chrome_start_failed");
    const targetResponse = await fetch(
      `http://127.0.0.1:${String(chromePort)}/json/new?${encodeURIComponent(initialUrl)}`,
      { method: "PUT" },
    );
    const target = await targetResponse.json();
    if (!target.webSocketDebuggerUrl) throw new Error("e2e_browser_auth_cdp_missing");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", rejectOpen, { once: true });
    });
    const cdp = new CdpBrowser(processHandle, socket);
    await cdp.command("Page.enable");
    await cdp.command("Runtime.enable");
    await cdp.command("Network.enable");
    return cdp;
  } catch (error) {
    try { socket?.close(); } finally { await terminateProcess(processHandle); }
    throw error;
  }
}

async function browserLogin(cdp, username, password) {
  await waitFor(async () => cdp.evaluate(
    `location.port === "${String(keycloakPort)}" && Boolean(document.querySelector("#username"))`,
  ), "e2e_browser_auth_keycloak_form_missing");
  await cdp.evaluate(`(() => {
    document.querySelector("#username").value = ${JSON.stringify(username)};
    document.querySelector("#password").value = ${JSON.stringify(password)};
    document.querySelector("#kc-login").click();
  })()`);
  await waitFor(async () => cdp.evaluate(
    `location.origin === ${JSON.stringify(publicOrigin)} && location.pathname === "/settings" && document.readyState === "complete"`,
  ), "e2e_browser_auth_return_path_failed");
}

try {
  [edgePort, keycloakPort, redisPort, bffPort, chromePort] = await availablePorts(5);
  if (process.env.AI_CRM_E2E_KEYCLOAK_PORT !== undefined) {
    const requestedKeycloakPort = Number(process.env.AI_CRM_E2E_KEYCLOAK_PORT);
    if (!Number.isSafeInteger(requestedKeycloakPort) || requestedKeycloakPort < 1024 || requestedKeycloakPort > 65_535) throw new Error("e2e_browser_auth_keycloak_port_invalid");
    keycloakPort = requestedKeycloakPort;
  }
  if (new Set([edgePort, keycloakPort, redisPort, bffPort, chromePort]).size !== 5) throw new Error("e2e_browser_auth_ports_not_distinct");
  publicOrigin = `http://localhost:${String(edgePort)}`;
  issuer = `http://localhost:${String(keycloakPort)}/realms/ai-crm-dev`;
  project = `ai-crm-test-e2e-browser-auth-${randomUUID().slice(0, 8)}`;
  secretDirectory = await mkdtemp(resolve("tests/e2e/.ai-crm-e2e-browser-auth-secrets-"));
  chromeProfile = await mkdtemp(resolve("tests/e2e/.ai-crm-e2e-browser-auth-chrome-"));
  harnessBuildDirectory = await mkdtemp(resolve("tests/e2e/.ai-crm-e2e-browser-auth-harness-"));
  browserTraceId = process.env.AI_CRM_E2E_BROWSER_TRACE_ID ?? randomBytes(16).toString("hex");
  browserTraceparent = process.env.AI_CRM_E2E_BROWSER_TRACEPARENT ?? `00-${browserTraceId}-${randomBytes(8).toString("hex")}-01`;
  if (!/^(?!0{32})[0-9a-f]{32}$/u.test(browserTraceId) || !new RegExp(`^00-${browserTraceId}-(?!0{16})[0-9a-f]{16}-0[01]$`, "u").test(browserTraceparent)) throw new Error("e2e_browser_trace_configuration_invalid");

  environment = {
    ...process.env,
    AI_CRM_COMPOSE_SECRET_DIR: secretDirectory,
    AI_CRM_E2E_BROWSER_EDGE_PORT: String(edgePort),
    AI_CRM_E2E_BROWSER_NGINX_CONFIG: resolve(secretDirectory, "nginx.conf"),
    AI_CRM_TEST_KEYCLOAK_PORT: String(keycloakPort),
    AI_CRM_TEST_REDIS_PORT: String(redisPort),
    VITE_AI_CRM_E2E: "true",
    VITE_AI_CRM_E2E_TRACEPARENT: browserTraceparent,
    ...(process.env.AI_CRM_E2E_FILE_REFERENCE_JSON === undefined ? {} : {
      VITE_AI_CRM_E2E_FILE_REFERENCE_JSON: process.env.AI_CRM_E2E_FILE_REFERENCE_JSON,
    }),
  };
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("pnpm CLI path is unavailable.");
  compose = [
    "compose", "-p", project,
    "-f", "deploy/compose/compose.base.yml",
    "-f", "deploy/compose/compose.auth-test.yml",
    "-f", "deploy/compose/compose.e2e-browser-auth.yml",
  ];

  await Promise.all([
    assertPortAvailable(edgePort, "edge"),
    assertPortAvailable(keycloakPort, "keycloak"),
    assertPortAvailable(redisPort, "redis"),
    assertPortAvailable(bffPort, "bff"),
  ]);
  run(process.execPath, ["scripts/bootstrap/compose-secrets.mjs", "test"]);
  const nginxTemplate = await readFile("deploy/nginx/nginx.e2e-browser-auth.conf", "utf8");
  await writeFile(resolve(secretDirectory, "nginx.conf"), nginxTemplate.replace("host.docker.internal:13001", `host.docker.internal:${String(bffPort)}`), "utf8");
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/workbench-web", "build"]);
  run("docker", [...compose, "up", "-d", "--wait", "postgres", "redis"]);
  if (process.env.AI_CRM_E2E_KEYCLOAK_DUMP_FILE !== undefined) await restoreKeycloakDatabase(process.env.AI_CRM_E2E_KEYCLOAK_DUMP_FILE);
  run("docker", [...compose, "up", "-d", "--wait", "keycloak"]);
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/api", "build"]);
  run(process.execPath, [pnpmCli, "exec", "tsc", "tests/e2e/src/browser-authentication-bff.ts",
    "--outDir", harnessBuildDirectory, "--target", "ES2022", "--module", "NodeNext",
    "--moduleResolution", "NodeNext", "--strict", "--skipLibCheck"]);
  const harnessModule = resolve(harnessBuildDirectory, "browser-authentication-bff.js");
  const { startBrowserAuthenticationBff } = await import(pathToFileURL(harnessModule).href);
  const identityFixture = process.env.AI_CRM_E2E_IDENTITY_FIXTURE_FILE === undefined ? undefined : JSON.parse(await readFile(process.env.AI_CRM_E2E_IDENTITY_FIXTURE_FILE, "utf8"));
  const username = identityFixture?.username ?? `browser-auth-${randomBytes(8).toString("hex")}`;
  const password = identityFixture?.password ?? randomBytes(24).toString("base64url");
  await createSyntheticUser(username, password);
  const restoredClientSecretFile = resolve(secretDirectory, "restored_pc_oidc_client_secret");
  if (identityFixture !== undefined) {
    if (typeof identityFixture.clientSecret !== "string" || identityFixture.clientSecret.length < 16) throw new Error("e2e_browser_auth_identity_fixture_invalid");
    await writeFile(restoredClientSecretFile, `${identityFixture.clientSecret}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
  let bffStartFailure;
  for (let attempt = 0; attempt < 3 && bff === undefined; attempt += 1) {
    try {
      await assertPortAvailable(bffPort, "bff");
      await writeFile(resolve(secretDirectory, "nginx.conf"), nginxTemplate.replace("host.docker.internal:13001", `host.docker.internal:${String(bffPort)}`), "utf8");
      bff = await startBrowserAuthenticationBff({
        clientSecretFile: identityFixture === undefined ? resolve(secretDirectory, "pc_oidc_client_secret") : restoredClientSecretFile,
        encryptionKeyFile: resolve(secretDirectory, "pc_session_encryption_key"),
        indexingKeyFile: resolve(secretDirectory, "pc_session_index_key"),
        issuer,
        port: bffPort,
        publicOrigin,
        redisPasswordFile: resolve(secretDirectory, "redis_password"),
        redisUrl: `redis://127.0.0.1:${String(redisPort)}`,
        taskAuthorizationSubject: syntheticUserId,
        ...(process.env.AI_CRM_E2E_DURABLE_DATABASE_URL_FILE === undefined ? {} : { durableDatabaseUrlFile: process.env.AI_CRM_E2E_DURABLE_DATABASE_URL_FILE }),
        ...(process.env.AI_CRM_E2E_TASK_COMMAND_FILE === undefined ? {} : { taskCompletionCommandFile: process.env.AI_CRM_E2E_TASK_COMMAND_FILE }),
      });
    } catch (error) {
      bffStartFailure = error;
      if (typeof error !== "object" || error === null || Reflect.get(error, "code") !== "EADDRINUSE" || attempt === 2) throw error;
      [bffPort] = await availablePorts(1);
    }
  }
  if (bff === undefined) throw new Error("e2e_browser_auth_bff_start_failed", { cause: bffStartFailure });
  const localBff = await fetch(`http://127.0.0.1:${String(bffPort)}/health/ready`);
  if (localBff.status !== 200) throw new Error("e2e_browser_auth_local_bff_not_ready");
  await runAsync("docker", ["run", "--rm", "--add-host", "host.docker.internal:host-gateway", "busybox:1.37",
    "wget", "-T", "5", "-t", "1", "-qO-", `http://host.docker.internal:${String(bffPort)}/health/ready`], { stdio: "ignore" });
  run("docker", [...compose, "up", "-d", "--wait", "nginx"]);

  const malformedCallback = await fetch(`${publicOrigin}/auth/pc/callback?code=forged&state=short`, { redirect: "manual" });
  if (malformedCallback.status !== 400) throw new Error("e2e_browser_auth_malformed_callback_not_rejected");
  const forgedCallback = await fetch(`${publicOrigin}/auth/pc/callback?code=forged&state=${"s".repeat(43)}`, { redirect: "manual" });
  if (forgedCallback.status !== 400) throw new Error("e2e_browser_auth_forged_callback_not_rejected");

  browser = await launchBrowser(`${publicOrigin}/auth/pc/login?returnTo=%2Fsettings`);
  const fixationCredential = randomBytes(32).toString("base64url");
  const fixation = await browser.command("Network.setCookie", {
    httpOnly: true,
    name: "__Host-ai_crm_pc_session",
    sameSite: "Lax",
    secure: true,
    url: publicOrigin,
    value: fixationCredential,
  });
  if (!fixation.success) throw new Error("e2e_browser_auth_fixation_setup_failed");
  await browserLogin(browser, username, password);
  try {
    await waitFor(async () => browser.evaluate(`document.body.innerText.includes("当前阶段没有可编辑的个人设置")`), "e2e_browser_auth_workbench_not_mounted");
  } catch (error) {
    const diagnostic = await browser.evaluate(`({
      documentLength: document.documentElement?.outerHTML.length,
      errorBoundary: document.body.innerText.includes("页面资源加载失败"),
      moduleScripts: document.querySelectorAll('script[type="module"]').length,
      path: location.pathname,
      readyState: document.readyState,
      rootPresent: Boolean(document.querySelector("#root")),
      signedOut: document.body.innerText.includes("请登录平台工作台"),
      systemFailure: document.body.innerText.includes("请求未成功")
    })`);
    throw new Error(`e2e_browser_auth_workbench_not_mounted:${JSON.stringify({ ...diagnostic, browserExceptions: browser.exceptions.slice(-3), resourceEvents: browser.resourceEvents.slice(-10) })}`, { cause: error });
  }

  const session = await browser.evaluate(`fetch("/auth/pc/session", {
    credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} }
  }).then(async response => ({
    body: await response.json(), status: response.status, traceId: response.headers.get("X-Trace-Id")
  }))`);
  if (session.status !== 200 || session.body?.client !== "pc-web" || typeof session.body?.csrfToken !== "string" ||
    session.traceId !== browserTraceId) {
    throw new Error("e2e_browser_auth_session_missing");
  }
  const registry = await browser.evaluate(`fetch("/application-registry", {
    credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} }
  }).then(async response => ({ body: await response.json(), status: response.status, traceId: response.headers.get("X-Trace-Id") }))`);
  if (registry.status !== 200 || registry.traceId !== browserTraceId || registry.body?.version !== 1 ||
    registry.body?.applications?.[0]?.applicationId !== "platform.synthetic" ||
    registry.body?.routes?.[0]?.routeId !== "platform.synthetic.task-detail" ||
    registry.body?.navigation?.[0]?.navigationId !== "platform.synthetic.tasks") {
    throw new Error("e2e_browser_application_registry_not_loaded");
  }
  applicationRegistryLoaded = true;
  const resourceReference = "source-task.main-chain-synthetic";
  const deepLink = await browser.evaluate(`fetch("/application-registry/deep-links/resolve", {
    body: JSON.stringify({
      applicationId: "platform.synthetic",
      resourceReference: ${JSON.stringify(resourceReference)},
      routeId: "platform.synthetic.task-detail",
      source: "task",
      version: 1
    }),
    credentials: "include",
    headers: { "Content-Type": "application/json", traceparent: ${JSON.stringify(browserTraceparent)} },
    method: "POST"
  }).then(async response => ({ body: await response.json(), status: response.status, traceId: response.headers.get("X-Trace-Id") }))`);
  if (deepLink.status !== 200 || deepLink.traceId !== browserTraceId ||
    deepLink.body?.path !== "/tasks/:resource_reference" || deepLink.body?.resourceReference !== resourceReference) {
    throw new Error("e2e_browser_deep_link_not_resolved");
  }
  deepLinkResolved = true;
  const resolvedPath = deepLink.body.path.replace(":resource_reference", encodeURIComponent(resourceReference));
  await browser.evaluate(`history.pushState({}, "", ${JSON.stringify(resolvedPath)}); window.dispatchEvent(new PopStateEvent("popstate"))`);
  deepLinkNavigated = await browser.evaluate(`location.pathname === ${JSON.stringify(`/tasks/${resourceReference}`)}`);
  if (!deepLinkNavigated) throw new Error("e2e_browser_deep_link_not_navigated");
  if (process.env.AI_CRM_E2E_FILE_REFERENCE_JSON !== undefined) {
    const expectedFileReference = JSON.parse(process.env.AI_CRM_E2E_FILE_REFERENCE_JSON);
    const formPath = "/form-definitions/platform.synthetic.task-completion/releases/1";
    const releaseResponse = await browser.evaluate(`fetch(${JSON.stringify(formPath)}, {
      credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} }
    }).then(async response => ({ body: await response.json(), status: response.status, traceId: response.headers.get("X-Trace-Id") }))`);
    const release = releaseResponse.body;
    const fields = release?.uiSchema?.fields?.map((field) => field.field);
    if (releaseResponse.status !== 200 || releaseResponse.traceId !== browserTraceId || release?.active !== true ||
      release?.definitionId !== "platform.synthetic.task-completion" || release?.releaseVersion !== 1 ||
      !Array.isArray(fields) || fields.join(",") !== "synthetic_value,file_id,content_version_id") {
      throw new Error(`e2e_browser_form_release_invalid:${JSON.stringify({
        active: release?.active,
        errorCode: release?.code,
        e2eBodyPresent: release?.e2eBodyPresent,
        e2eMethod: release?.e2eMethod,
        e2ePath: release?.e2ePath,
        definitionId: release?.definitionId,
        fields,
        releaseVersion: release?.releaseVersion,
        responseTraceId: releaseResponse.traceId,
        status: releaseResponse.status,
      })}`);
    }
    const validFormBody = { data: { content_version_id: expectedFileReference.contentVersionId, file_id: expectedFileReference.fileId, synthetic_value: "synthetic-approved" } };
    const readOnlyValidation = await browser.evaluate(`fetch(${JSON.stringify(`${formPath}/validate`)}, {
      body: ${JSON.stringify(JSON.stringify(validFormBody))}, credentials: "include",
      headers: { "Content-Type": "application/json", traceparent: ${JSON.stringify(browserTraceparent)} }, method: "POST"
    }).then(response => response.status)`);
    if (readOnlyValidation !== 200) throw new Error("e2e_browser_form_readonly_validation_failed");
    const rejectedForm = await browser.evaluate(`fetch("/__e2e/walking-skeleton/form-submissions", {
      body: JSON.stringify({ data: ${JSON.stringify(validFormBody.data)}, fileReference: ${JSON.stringify(expectedFileReference)}, version: 1 }), credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "76000000-0000-4000-8000-000000000099", traceparent: ${JSON.stringify(browserTraceparent)},
        "X-CSRF-Token": "${"x".repeat(43)}" }, method: "POST"
    }).then(response => response.status)`);
    if (rejectedForm !== 403) throw new Error(`e2e_browser_form_csrf_not_rejected:${String(rejectedForm)}`);
    for (const [index, scenario] of ["unlinked", "inactive_employment", "permission_denied"].entries()) {
      bff.setTaskAuthorizationScenario(scenario);
      const deniedFormRead = await browser.evaluate(`fetch(${JSON.stringify(formPath)}, {
        credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} }
      }).then(response => response.status)`);
      if (deniedFormRead !== 403) throw new Error(`e2e_browser_form_read_${scenario}_not_rejected`);
      const deniedFormValidation = await browser.evaluate(`fetch(${JSON.stringify(`${formPath}/validate`)}, {
        body: ${JSON.stringify(JSON.stringify(validFormBody))}, credentials: "include",
        headers: { "Content-Type": "application/json", traceparent: ${JSON.stringify(browserTraceparent)} }, method: "POST"
      }).then(response => response.status)`);
      if (deniedFormValidation !== 403) throw new Error(`e2e_browser_form_validate_${scenario}_not_rejected`);
      const deniedFormSubmission = await browser.evaluate(`fetch("/__e2e/walking-skeleton/form-submissions", {
        body: JSON.stringify({ data: ${JSON.stringify(validFormBody.data)}, fileReference: ${JSON.stringify(expectedFileReference)}, version: 1 }), credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": ${JSON.stringify(`76000000-0000-4000-8000-${String(97 - index).padStart(12, "0")}`)}, traceparent: ${JSON.stringify(browserTraceparent)},
          "X-CSRF-Token": ${JSON.stringify(session.body.csrfToken)} }, method: "POST"
      }).then(response => response.status)`);
      if (deniedFormSubmission !== 403) throw new Error(`e2e_browser_form_submission_${scenario}_not_rejected`);
    }
    process.stdout.write(`${JSON.stringify({ stage: "e2e-browser-form-denials-passed" })}\n`);
    bff.setTaskAuthorizationScenario("allowed");
    const restoredFormRead = await browser.evaluate(`fetch(${JSON.stringify(formPath)}, {
      credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} }
    }).then(response => response.status)`);
    if (restoredFormRead !== 200) throw new Error(`e2e_browser_form_authorization_not_restored:${String(restoredFormRead)}`);
    await browser.command("Page.navigate", { url: `${publicOrigin}/forms/platform.synthetic.task-completion` });
    try {
      await waitFor(async () => browser.evaluate(`location.pathname === "/forms/platform.synthetic.task-completion" && Boolean(document.querySelector('input[aria-label="合成值"]'))`), "e2e_browser_form_not_rendered", 60_000);
    } catch (error) {
      const diagnostic = await browser.evaluate(`({
        documentLength: document.documentElement?.outerHTML.length,
        collectionPage: Boolean(document.querySelector(".collection-page")),
        errorBoundary: document.body.innerText.includes("页面资源加载失败"),
        formHeading: document.body.innerText.includes("合成表单验收"),
        inputLabels: Array.from(document.querySelectorAll("input[aria-label]"), input => input.getAttribute("aria-label")).filter(label => ["合成值", "File ID", "Content Version ID"].includes(label)),
        loadingRelease: document.body.innerText.includes("正在加载表单版本"),
        missingPage: document.body.innerText.includes("页面不存在"),
        moduleScripts: document.querySelectorAll('script[type="module"]').length,
        path: location.pathname,
        readyState: document.readyState,
        rootPresent: Boolean(document.querySelector("#root")),
        settingsPage: document.body.innerText.includes("当前阶段没有可编辑的个人设置"),
        signedOut: document.body.innerText.includes("请登录平台工作台"),
        syntheticFixture: document.body.innerText.includes("合成验收数据"),
        systemFailure: document.body.innerText.includes("请求未成功"),
        workspaceLoading: document.body.innerText.includes("正在加载工作区")
      })`);
      throw new Error(`e2e_browser_form_not_rendered:${JSON.stringify({ ...diagnostic, browserExceptions: browser.exceptions.slice(-3), resourceEvents: browser.resourceEvents.slice(-10) })}`, { cause: error });
    }
    formRendered = true;
    process.stdout.write(`${JSON.stringify({ stage: "e2e-browser-form-rendered" })}\n`);
    const readonlyReferences = await browser.evaluate(`({
      contentVersionId: document.querySelector('input[aria-label="Content Version ID"]')?.value,
      contentVersionReadonly: document.querySelector('input[aria-label="Content Version ID"]')?.readOnly,
      fileId: document.querySelector('input[aria-label="File ID"]')?.value,
      fileReadonly: document.querySelector('input[aria-label="File ID"]')?.readOnly
    })`);
    if (readonlyReferences.fileId !== expectedFileReference.fileId || readonlyReferences.contentVersionId !== expectedFileReference.contentVersionId ||
      readonlyReferences.fileReadonly !== true || readonlyReferences.contentVersionReadonly !== true) {
      throw new Error("e2e_browser_form_file_reference_mismatch");
    }
    formFileReferenceMatched = true;
    await browser.evaluate(`document.querySelector('input[aria-label="合成值"]').focus()`);
    await browser.command("Input.insertText", { text: "synthetic-approved" });
    await waitFor(async () => browser.evaluate(`document.querySelector('input[aria-label="合成值"]')?.value === "synthetic-approved"`), "e2e_browser_form_input_not_updated");
    await browser.evaluate(`document.querySelector('button[type="submit"]').click()`);
    process.stdout.write(`${JSON.stringify({ stage: "e2e-browser-form-submitted" })}\n`);
    try {
      await waitFor(async () => browser.evaluate(`document.body.innerText.includes("表单提交已接受")`), "e2e_browser_form_not_accepted");
    } catch (error) {
      const diagnostic = await browser.evaluate(`({
        failure: document.body.innerText.includes("提交未完成"),
        inputValue: document.querySelector('input[aria-label="合成值"]')?.value,
        pending: Boolean(document.querySelector('button[type="submit"].ant-btn-loading'))
      })`);
      throw new Error(`e2e_browser_form_not_accepted:${JSON.stringify({ ...diagnostic, resourceEvents: browser.resourceEvents.slice(-10) })}`, { cause: error });
    }
    const submissionReference = await browser.evaluate(`document.querySelector('[data-testid="submission-reference"]')?.textContent`);
    if (typeof submissionReference !== "string" || !/^submission\.[0-9a-f-]{36}$/u.test(submissionReference)) throw new Error("e2e_browser_form_receipt_invalid");
    formServerValidated = true;
  }
  if (process.env.AI_CRM_E2E_TASK_COMMAND_FILE !== undefined || (process.env.AI_CRM_E2E_DURABLE_DATABASE_URL_FILE !== undefined && process.env.AI_CRM_E2E_FILE_REFERENCE_JSON !== undefined)) {
    const submissionReference = await browser.evaluate(`document.querySelector('[data-testid="submission-reference"]')?.textContent`);
    if (typeof submissionReference !== "string") throw new Error("e2e_browser_task_submission_reference_missing");
    await waitFor(async () => browser.evaluate(`fetch("/tasks?status=open&limit=50", { credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} } }).then(async response => response.ok && (await response.json()).items?.some(item => item.sourceType === "tests.walking-skeleton" && item.sourceTaskId === "source-task.main-chain-synthetic"))`), "e2e_browser_task_projection_not_available", 60_000);
    const taskUrl = "/tasks/tests.walking-skeleton/source-task.main-chain-synthetic/complete";
    const rejectedTask = await browser.evaluate(`fetch(${JSON.stringify(taskUrl)}, {
      body: JSON.stringify({ sourceCommandReference: ${JSON.stringify(submissionReference)} }), credentials: "include", headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "task-complete.browser-causal-rejected",
        traceparent: ${JSON.stringify(browserTraceparent)},
        "X-CSRF-Token": "${"x".repeat(43)}"
      }, method: "POST"
    }).then(response => response.status)`);
    if (rejectedTask !== 403) throw new Error("e2e_browser_task_csrf_not_rejected");
    for (const scenario of ["unlinked", "inactive_employment", "permission_denied"]) {
      bff.setTaskAuthorizationScenario(scenario);
      if (process.env.AI_CRM_E2E_DURABLE_DATABASE_URL_FILE !== undefined) {
        const deniedObservations = await browser.evaluate(`Promise.all([
          fetch("/tasks?limit=50", { credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} } }).then(response => response.status),
          fetch("/notifications?limit=50", { credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} } }).then(response => response.status)
        ])`);
        if (deniedObservations[0] !== 403 || deniedObservations[1] !== 403) throw new Error(`e2e_browser_observation_${scenario}_not_rejected`);
      }
      const deniedStatus = await browser.evaluate(`fetch(${JSON.stringify(taskUrl)}, {
        body: JSON.stringify({ sourceCommandReference: ${JSON.stringify(submissionReference)} }), credentials: "include", headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": ${JSON.stringify(`task-complete.browser-${scenario}`)},
          traceparent: ${JSON.stringify(browserTraceparent)},
          "X-CSRF-Token": ${JSON.stringify(session.body.csrfToken)}
        }, method: "POST"
      }).then(response => response.status)`);
      if (deniedStatus !== 403) throw new Error(`e2e_browser_task_${scenario}_not_rejected`);
    }
    taskAuthorizationDenied = true;
    bff.setTaskAuthorizationScenario("allowed");
    const successfulTaskRequest = `fetch(${JSON.stringify(taskUrl)}, {
      body: JSON.stringify({ sourceCommandReference: ${JSON.stringify(submissionReference)} }), credentials: "include", headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "task-complete.browser-causal-0001",
        traceparent: ${JSON.stringify(browserTraceparent)},
        "X-CSRF-Token": ${JSON.stringify(session.body.csrfToken)}
      }, method: "POST"
    }).then(async response => ({ body: await response.json(), status: response.status, traceId: response.headers.get("X-Trace-Id") }))`;
    const taskCompletion = await browser.evaluate(successfulTaskRequest);
    const expectedFixedCommand = process.env.AI_CRM_E2E_TASK_COMMAND_FILE !== undefined && process.env.AI_CRM_E2E_DURABLE_DATABASE_URL_FILE === undefined;
    if (taskCompletion.status !== 202 || taskCompletion.body?.status !== "accepted" ||
      (expectedFixedCommand ? taskCompletion.body?.sourceCommandId !== "94000000-0000-5000-8000-000000000001" : !/^[0-9a-f-]{36}$/u.test(taskCompletion.body?.sourceCommandId ?? "")) || taskCompletion.traceId !== browserTraceId) {
      throw new Error("e2e_browser_task_completion_not_accepted");
    }
    const replayedTaskCompletion = await browser.evaluate(successfulTaskRequest);
    if (JSON.stringify(replayedTaskCompletion) !== JSON.stringify(taskCompletion)) {
      throw new Error("e2e_browser_task_completion_replay_mismatch");
    }
    taskCompletionAccepted = true;
    taskCompletionReplayed = true;
  }
  if (process.env.AI_CRM_E2E_DURABLE_OBSERVATION_JSON !== undefined) {
    const observation = JSON.parse(process.env.AI_CRM_E2E_DURABLE_OBSERVATION_JSON);
    const observed = await browser.evaluate(`Promise.all([
      fetch("/tasks?limit=50", { credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} } }).then(async response => ({ body: await response.json(), status: response.status, traceId: response.headers.get("X-Trace-Id") })),
      fetch("/notifications?limit=50", { credentials: "include", headers: { traceparent: ${JSON.stringify(browserTraceparent)} } }).then(async response => ({ body: await response.json(), status: response.status, traceId: response.headers.get("X-Trace-Id") }))
    ])`);
    const observedTask = observed[0]?.body?.items?.find((item) => item.sourceType === observation.taskProjection?.sourceType && item.sourceTaskId === observation.taskProjection?.sourceTaskId);
    const observedNotification = observed[1]?.body?.items?.find((item) => item.sourceType === observation.notificationProjection?.sourceType && item.sourceId === observation.notificationProjection?.sourceId && item.notificationId === observation.notificationProjection?.notificationId);
    durableTaskObserved = observed[0]?.status === 200 && observed[0]?.traceId === browserTraceId && observedTask?.sourceType === observation.taskProjection?.sourceType &&
      observedTask?.sourceTaskId === observation.taskProjection?.sourceTaskId && observedTask?.status === "completed";
    durableNotificationObserved = observed[1]?.status === 200 && observed[1]?.traceId === browserTraceId && observedNotification?.sourceType === observation.notificationProjection?.sourceType &&
      observedNotification?.sourceId === observation.notificationProjection?.sourceId && observedNotification?.notificationId === observation.notificationProjection?.notificationId;
    if (!durableTaskObserved || !durableNotificationObserved) {
      process.stderr.write(`${JSON.stringify({ durableObservationDiagnostic: {
        notificationCount: Array.isArray(observed[1]?.body?.items) ? observed[1].body.items.length : -1,
        notificationSourceMatched: observedNotification?.sourceId === observation.notificationProjection?.sourceId,
        notificationStatus: observed[1]?.status,
        notificationTraceMatched: observed[1]?.traceId === browserTraceId,
        taskCount: Array.isArray(observed[0]?.body?.items) ? observed[0].body.items.length : -1,
        taskSourceMatched: observedTask?.sourceTaskId === observation.taskProjection?.sourceTaskId,
        taskStatus: observed[0]?.status,
        taskTraceMatched: observed[0]?.traceId === browserTraceId,
      } })}\n`);
      throw new Error("e2e_browser_durable_observation_mismatch");
    }
  }
  const cookies = (await browser.command("Network.getAllCookies")).cookies;
  const sessionCookie = cookies.find((cookie) => cookie.name === "__Host-ai_crm_pc_session" && cookie.domain === "localhost");
  if (!sessionCookie || !sessionCookie.httpOnly || !sessionCookie.secure || sessionCookie.sameSite !== "Lax" ||
    sessionCookie.value === fixationCredential || sessionCookie.value.length !== 43) {
    throw new Error("e2e_browser_auth_cookie_boundary_failed");
  }
  const browserBoundary = await browser.evaluate(`({
    cookie: document.cookie,
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    url: location.href
  })`);
  const serializedBoundary = JSON.stringify(browserBoundary);
  if (browserBoundary.cookie.includes("ai_crm_pc_session") || /access_token|refresh_token|id_token/iu.test(serializedBoundary)) {
    throw new Error("e2e_browser_auth_token_exposed");
  }

  const csrfFailure = await browser.evaluate(`fetch("/auth/pc/refresh", {
    credentials: "include", headers: { "X-CSRF-Token": "${"x".repeat(43)}" }, method: "POST"
  }).then(response => response.status)`);
  if (csrfFailure !== 403) throw new Error("e2e_browser_auth_csrf_not_rejected");

  const oldCredential = sessionCookie.value;
  const refreshStatus = await browser.evaluate(`fetch("/auth/pc/refresh", {
    credentials: "include", headers: { "X-CSRF-Token": ${JSON.stringify(session.body.csrfToken)} }, method: "POST"
  }).then(response => response.status)`);
  if (refreshStatus !== 204) throw new Error("e2e_browser_auth_refresh_failed");
  const rotatedCookies = (await browser.command("Network.getAllCookies")).cookies;
  const rotatedCookie = rotatedCookies.find((cookie) => cookie.name === "__Host-ai_crm_pc_session" && cookie.domain === "localhost");
  if (!rotatedCookie || rotatedCookie.value === oldCredential) throw new Error("e2e_browser_auth_session_not_rotated");
  const oldSession = await fetch(`${publicOrigin}/auth/pc/session`, {
    headers: { cookie: `__Host-ai_crm_pc_session=${oldCredential}` },
  });
  if (oldSession.status !== 401) throw new Error("e2e_browser_auth_old_session_not_rejected");

  bff.advanceClock(121_000);
  const expiredStatus = await browser.evaluate(
    `fetch("/auth/pc/session", { credentials: "include" }).then(response => response.status)`,
  );
  if (expiredStatus !== 401) throw new Error("e2e_browser_auth_expired_session_not_rejected");

  if (process.env.AI_CRM_E2E_KEYCLOAK_DUMP_OUTPUT !== undefined) await dumpKeycloakDatabase(process.env.AI_CRM_E2E_KEYCLOAK_DUMP_OUTPUT);

  process.stdout.write(`${JSON.stringify({
    callbackRejected: true,
    applicationRegistryLoaded,
    browserTraceId,
    browserTraceparent,
    csrfRejected: true,
    deepLinkNavigated,
    deepLinkResolved,
    durableNotificationObserved,
    durableTaskObserved,
    expiredSessionRejected: true,
    formFileReferenceMatched,
    formRendered,
    formServerValidated,
    httpOnlyCookie: true,
    project,
    sessionFixationRejected: true,
    sessionRotated: true,
    status: process.env.AI_CRM_E2E_DURABLE_OBSERVATION_JSON === undefined ? "e2e-browser-authentication-passed" : "e2e-browser-durable-observation-passed",
    syntheticUser: true,
    syntheticSubjectId: syntheticUserId,
    syntheticIssuer: issuer,
    taskAuthorizationDenied,
    taskCompletionAccepted,
    taskCompletionReplayed,
    tokenExposedToBrowser: false,
  })}\n`);
} catch (error) {
  failures.push(error);
  if (compose && environment) {
    spawnSync("docker", [...compose, "ps"], { env: environment, shell: false, stdio: "inherit" });
    spawnSync("docker", [...compose, "logs", "--no-color", "--tail", "100"], { env: environment, shell: false, stdio: "inherit" });
  }
} finally {
  try { await browser?.close(); } catch (error) { failures.push(error); }
  try { await bff?.close(); } catch (error) { failures.push(error); }
  if (process.env.AI_CRM_E2E_IDENTITY_FIXTURE_FILE === undefined && adminAccessToken && syntheticUserId && keycloakPort) {
    try {
      const response = await fetch(`http://localhost:${String(keycloakPort)}/admin/realms/ai-crm-dev/users/${syntheticUserId}`, {
        headers: { authorization: `Bearer ${adminAccessToken}` }, method: "DELETE",
      });
      if (response.status !== 204 && response.status !== 404) failures.push(new Error(`e2e_browser_auth_user_cleanup_failed_${String(response.status)}`));
    } catch (error) { failures.push(error); }
  }
  if (compose && environment) {
    const cleanup = spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], {
      env: environment, shell: false, stdio: "inherit",
    });
    if (cleanup.status !== 0) failures.push(new Error("e2e_browser_auth_compose_cleanup_failed"));
  }
  for (const directory of [secretDirectory, chromeProfile, harnessBuildDirectory].filter(Boolean)) {
    try { await rm(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 }); }
    catch (error) { failures.push(error); }
  }
}
if (failures.length > 0) throw new AggregateError(failures, "Browser authentication E2E or cleanup failed.");
