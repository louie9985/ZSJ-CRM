import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const apiOrigin = new URL(process.env.AI_CRM_E2E_API_ORIGIN ?? "http://127.0.0.1:13001").origin;
const passwordFile = process.env.AI_CRM_E2E_SYSTEM_ADMIN_PASSWORD_FILE ?? resolve("deploy/compose/.runtime/dev/system_admin_password");
const identifier = process.env.AI_CRM_E2E_SYSTEM_ADMIN_IDENTIFIER ?? "system.admin";
const origins = Object.freeze({
  pc: new URL(process.env.AI_CRM_E2E_PC_ORIGIN ?? "http://127.0.0.1:3000").origin,
  "internal-h5": new URL(process.env.AI_CRM_E2E_INTERNAL_H5_ORIGIN ?? "http://127.0.0.1:10086").origin,
});

async function restrictedSecret(path) {
  if (!isAbsolute(path)) throw new Error("e2e_authentication_password_file_invalid");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 2048 || process.platform !== "win32" && (info.mode & 0o077) !== 0) throw new Error("e2e_authentication_password_file_invalid");
  return (await readFile(path, "utf8")).replace(/\r?\n$/u, "");
}

function sessionCookie(response, surface) {
  const expected = surface === "pc" ? "__Host-ai_crm_pc_session" : "__Host-ai_crm_internal_h5_session";
  const value = response.headers.get("set-cookie");
  if (value === null || !value.startsWith(`${expected}=`) || !value.includes("HttpOnly") || !value.includes("Secure") || !value.includes("SameSite=Lax")) throw new Error(`e2e_authentication_${surface}_cookie_invalid`);
  return value.split(";", 1)[0];
}

async function json(response, code) {
  let body;
  try { body = await response.json(); } catch { throw new Error(code); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error(code);
  return body;
}

async function establishSession(surface, password) {
  const origin = origins[surface];
  const login = await fetch(`${apiOrigin}/auth/${surface}/login`, {
    body: JSON.stringify({ identifier, password }),
    headers: { "Content-Type": "application/json", Origin: origin },
    method: "POST",
  });
  if (login.status !== 200) throw new Error(`e2e_authentication_${surface}_login_failed`);
  const cookie = sessionCookie(login, surface);
  const loginView = await json(login, `e2e_authentication_${surface}_login_view_invalid`);
  if (loginView.surface !== surface || loginView.accountId === undefined || loginView.csrfToken === undefined || !Array.isArray(loginView.roles) || !loginView.roles.includes("system_administrator")) throw new Error(`e2e_authentication_${surface}_login_view_invalid`);

  const current = await fetch(`${apiOrigin}/auth/${surface}/session`, { headers: { Cookie: cookie } });
  const currentView = await json(current, `e2e_authentication_${surface}_session_invalid`);
  if (current.status !== 200 || currentView.accountId !== loginView.accountId || currentView.csrfToken !== loginView.csrfToken) throw new Error(`e2e_authentication_${surface}_session_invalid`);

  return Object.freeze({ accountId: loginView.accountId, cookie, csrfToken: String(currentView.csrfToken), origin, surface });
}

async function logoutSession(session) {
  const logout = await fetch(`${apiOrigin}/auth/${session.surface}/logout`, { headers: { Cookie: session.cookie, Origin: session.origin, "X-CSRF-Token": session.csrfToken }, method: "POST" });
  if (logout.status !== 204 || !String(logout.headers.get("set-cookie")).includes("Max-Age=0")) throw new Error(`e2e_authentication_${session.surface}_logout_failed`);
  const expired = await fetch(`${apiOrigin}/auth/${session.surface}/session`, { headers: { Cookie: session.cookie } });
  if (expired.status !== 401) throw new Error(`e2e_authentication_${session.surface}_logout_not_enforced`);
}

const password = await restrictedSecret(passwordFile);
const established = await Promise.allSettled([establishSession("pc", password), establishSession("internal-h5", password)]);
const sessions = established.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
let outcome;
let failure = established.find((result) => result.status === "rejected")?.reason;
if (failure === undefined) {
  try {
    const [pc, internalH5] = sessions;
    if (pc === undefined || internalH5 === undefined) throw new Error("e2e_authentication_session_missing");
    if (pc.accountId !== internalH5.accountId) throw new Error("e2e_authentication_surface_account_mismatch");
    const [pcCookieOnH5, h5CookieOnPc] = await Promise.all([
      fetch(`${apiOrigin}/auth/internal-h5/session`, { headers: { Cookie: pc.cookie } }),
      fetch(`${apiOrigin}/auth/pc/session`, { headers: { Cookie: internalH5.cookie } }),
    ]);
    if (pcCookieOnH5.status !== 401 || h5CookieOnPc.status !== 401) throw new Error("e2e_authentication_surface_cookie_isolation_failed");
    outcome = { accountId: pc.accountId, status: "e2e-browser-authentication-passed", surfaces: [pc.surface, internalH5.surface] };
  } catch (error) {
    failure = error;
  }
}
const cleanup = await Promise.allSettled(sessions.map(logoutSession));
failure ??= cleanup.find((result) => result.status === "rejected")?.reason;
if (failure !== undefined) throw failure;
process.stdout.write(`${JSON.stringify(outcome)}\n`);
