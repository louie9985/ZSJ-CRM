import { runApiMain, type ApiPlatformBindingFactory, type ApiPlatformBindings } from "@ai-crm/api";

const unavailable = (): Promise<never> => Promise.reject(new Error("e2e_capability_not_composed"));
const authenticationUnavailable = () => Promise.resolve({
  body: { code: "e2e_authentication_not_composed" },
  headers: { "Cache-Control": "no-store" },
  status: 503,
});

export function createE2eProcessBindings(): ApiPlatformBindings {
  const bindings = {
    audit: { readSensitive: unavailable, record: unavailable },
    authentication: {
      beginLogin: authenticationUnavailable,
      completeLogin: authenticationUnavailable,
      currentSession: authenticationUnavailable,
      logout: authenticationUnavailable,
      refresh: authenticationUnavailable,
    },
    authenticationCallbackUrl: () => "http://e2e.invalid/auth/pc/callback",
    browserSecurity: { allowedOrigins: ["http://e2e.invalid"] },
    authorization: { requireAllowed: unavailable },
    authorizationTrace: { run: async (_traceId: string, work: () => Promise<unknown>) => work() },
    databaseCompatibility: { assertCompatible: () => undefined },
    organization: { resolveWorkforceContext: unavailable },
    queries: {
      applicationRegistry: { loadRegistry: unavailable, resolveDeepLink: unavailable },
      fileCenter: { authorizeDownload: unavailable, completeUpload: unavailable, createUploadSession: unavailable },
      forms: { getRelease: unavailable, validateSubmission: unavailable },
      notifications: { get: unavailable, list: unavailable, unreadCount: unavailable },
      tasks: { get: unavailable, list: unavailable },
    },
    readiness: () => [{ healthy: true, name: "e2e-process-bindings", required: true }],
    sessions: { resolvePrincipal: unavailable, sessionForMutation: unavailable },
  };
  return bindings as unknown as ApiPlatformBindings;
}

export const e2eApiBindingFactory: ApiPlatformBindingFactory = Object.freeze({
  create: () => Promise.resolve(createE2eProcessBindings()),
});

if (process.env["AI_CRM_E2E_PROCESS_ENTRYPOINT"] === "api") {
  void runApiMain({ bindingFactory: e2eApiBindingFactory }).catch(() => { process.exitCode = 1; });
}
