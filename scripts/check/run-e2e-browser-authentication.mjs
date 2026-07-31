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

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("e2e_browser_auth_port_unavailable"));
      server.close(() => resolvePort(address.port));
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
  const adminPassword = (await readFile(resolve(secretDirectory, "keycloak_bootstrap_password"), "utf8")).trim();
  adminAccessToken = await keycloakAdminToken(adminPassword);
  const clientsResponse = await fetch(`http://localhost:${String(keycloakPort)}/admin/realms/ai-crm-dev/clients?clientId=ai-crm-pc-bff`, {
    headers: { authorization: `Bearer ${adminAccessToken}` },
  });
  const clients = await clientsResponse.json();
  const client = clientsResponse.ok && Array.isArray(clients) && clients.length === 1 ? clients[0] : undefined;
  if (!client || typeof client.id !== "string") throw new Error("e2e_browser_auth_client_lookup_failed");
  const clientUpdate = await fetch(`http://localhost:${String(keycloakPort)}/admin/realms/ai-crm-dev/clients/${client.id}`, {
    body: JSON.stringify({
      ...client,
      redirectUris: [...new Set([...(Array.isArray(client.redirectUris) ? client.redirectUris : []), `${publicOrigin}/auth/pc/callback`])],
      webOrigins: [...new Set([...(Array.isArray(client.webOrigins) ? client.webOrigins : []), publicOrigin])],
    }),
    headers: { authorization: `Bearer ${adminAccessToken}`, "content-type": "application/json" },
    method: "PUT",
  });
  if (clientUpdate.status !== 204) throw new Error("e2e_browser_auth_client_update_failed");
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
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") return;
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
  [edgePort, keycloakPort, redisPort, bffPort] = await availablePorts(4);
  publicOrigin = `http://localhost:${String(edgePort)}`;
  issuer = `http://localhost:${String(keycloakPort)}/realms/ai-crm-dev`;
  project = `ai-crm-test-e2e-browser-auth-${randomUUID().slice(0, 8)}`;
  secretDirectory = await mkdtemp(resolve("tests/e2e/.ai-crm-e2e-browser-auth-secrets-"));
  chromeProfile = await mkdtemp(resolve("tests/e2e/.ai-crm-e2e-browser-auth-chrome-"));
  harnessBuildDirectory = await mkdtemp(resolve("tests/e2e/.ai-crm-e2e-browser-auth-harness-"));
  chromePort = await availablePort();

  environment = {
    ...process.env,
    AI_CRM_COMPOSE_SECRET_DIR: secretDirectory,
    AI_CRM_E2E_BROWSER_EDGE_PORT: String(edgePort),
    AI_CRM_E2E_BROWSER_NGINX_CONFIG: resolve(secretDirectory, "nginx.conf"),
    AI_CRM_TEST_KEYCLOAK_PORT: String(keycloakPort),
    AI_CRM_TEST_REDIS_PORT: String(redisPort),
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
  run("docker", [...compose, "up", "-d", "--wait", "postgres", "redis", "keycloak"]);
  run(process.execPath, [pnpmCli, "--filter", "@ai-crm/api", "build"]);
  run(process.execPath, [pnpmCli, "exec", "tsc", "tests/e2e/src/browser-authentication-bff.ts",
    "--outDir", harnessBuildDirectory, "--target", "ES2022", "--module", "NodeNext",
    "--moduleResolution", "NodeNext", "--strict", "--skipLibCheck"]);
  const harnessModule = resolve(harnessBuildDirectory, "browser-authentication-bff.js");
  const { startBrowserAuthenticationBff } = await import(pathToFileURL(harnessModule).href);
  bff = await startBrowserAuthenticationBff({
    clientSecretFile: resolve(secretDirectory, "pc_oidc_client_secret"),
    encryptionKeyFile: resolve(secretDirectory, "pc_session_encryption_key"),
    indexingKeyFile: resolve(secretDirectory, "pc_session_index_key"),
    issuer,
    port: bffPort,
    publicOrigin,
    redisPasswordFile: resolve(secretDirectory, "redis_password"),
    redisUrl: `redis://127.0.0.1:${String(redisPort)}`,
  });
  const localBff = await fetch(`http://127.0.0.1:${String(bffPort)}/health/ready`);
  if (localBff.status !== 200) throw new Error("e2e_browser_auth_local_bff_not_ready");
  await runAsync("docker", ["run", "--rm", "--add-host", "host.docker.internal:host-gateway", "busybox:1.37",
    "wget", "-T", "5", "-t", "1", "-qO-", `http://host.docker.internal:${String(bffPort)}/health/ready`], { stdio: "ignore" });
  run("docker", [...compose, "up", "-d", "--wait", "nginx"]);

  const username = `browser-auth-${randomBytes(8).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  await createSyntheticUser(username, password);

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

  const session = await browser.evaluate(`fetch("/auth/pc/session", { credentials: "include" }).then(async response => ({
    body: await response.json(), status: response.status
  }))`);
  if (session.status !== 200 || session.body?.client !== "pc-web" || typeof session.body?.csrfToken !== "string") {
    throw new Error("e2e_browser_auth_session_missing");
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

  process.stdout.write(`${JSON.stringify({
    callbackRejected: true,
    csrfRejected: true,
    expiredSessionRejected: true,
    httpOnlyCookie: true,
    project,
    sessionFixationRejected: true,
    sessionRotated: true,
    status: "e2e-browser-authentication-passed",
    syntheticUser: true,
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
  if (adminAccessToken && syntheticUserId && keycloakPort) {
    try {
      const response = await fetch(`http://localhost:${String(keycloakPort)}/admin/realms/ai-crm-dev/users/${syntheticUserId}`, {
        headers: { authorization: `Bearer ${adminAccessToken}` }, method: "DELETE",
      });
      if (response.status !== 204) throw new Error("e2e_browser_auth_user_cleanup_failed");
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
