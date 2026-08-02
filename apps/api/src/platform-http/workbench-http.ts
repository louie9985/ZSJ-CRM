export interface WorkbenchBootstrapView {
  readonly accountKind: "system_administrator" | "workforce";
  readonly assignmentReference?: string;
  readonly displayName: string;
  readonly navigationIds: readonly string[];
  readonly sessionScope: string;
}

export interface WorkbenchBootstrapFacade {
  load(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<WorkbenchBootstrapView>>;
}

export interface WorkbenchHttpResponse {
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: 200 | 401 | 403 | 503;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TRACE_ID = /^(?!0{32})[0-9a-f]{32}$/u;
const CREDENTIAL = /^[A-Za-z0-9_-]{32,512}$/u;
const NAVIGATION_ID = /^[a-z][a-z0-9_.-]{0,127}$/u;
const SESSION_SCOPE = /^[A-Za-z0-9._:-]{16,128}$/u;

function headers(traceId?: string): Readonly<Record<string, string>> {
  return Object.freeze({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'",
    ...(traceId === undefined ? {} : { "X-Trace-Id": traceId }),
  });
}

function errorCode(error: unknown): string | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : undefined;
}

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value || /[\0\r\n]/u.test(value)) {
    throw new Error("workbench_facade_result_invalid");
  }
  return value;
}

function serialize(view: Readonly<WorkbenchBootstrapView>): Readonly<Record<string, unknown>> {
  if (!(new Set<unknown>(["system_administrator", "workforce"])).has(view.accountKind)) throw new Error("workbench_facade_result_invalid");
  if (!SESSION_SCOPE.test(view.sessionScope)) throw new Error("workbench_facade_result_invalid");
  const rawNavigationIds: readonly unknown[] = view.navigationIds;
  if (!Array.isArray(rawNavigationIds) || rawNavigationIds.length > 128 ||
    rawNavigationIds.some((id) => typeof id !== "string" || !NAVIGATION_ID.test(id)) ||
    new Set(rawNavigationIds).size !== rawNavigationIds.length) {
    throw new Error("workbench_facade_result_invalid");
  }
  if (view.assignmentReference !== undefined && !UUID.test(view.assignmentReference)) throw new Error("workbench_facade_result_invalid");
  if (view.accountKind === "system_administrator" && view.assignmentReference !== undefined) throw new Error("workbench_facade_result_invalid");
  const navigationIds: string[] = [];
  for (const navigationId of rawNavigationIds) {
    if (typeof navigationId !== "string") throw new Error("workbench_facade_result_invalid");
    navigationIds.push(navigationId);
  }
  return Object.freeze({
    collections: Object.freeze({ files: Object.freeze({}), forms: Object.freeze({}), notifications: Object.freeze({}), tasks: Object.freeze({}) }),
    context: Object.freeze({
      accountKind: view.accountKind,
      ...(view.assignmentReference === undefined ? {} : { assignmentReference: view.assignmentReference.toLowerCase() }),
      displayName: boundedText(view.displayName, 64),
      sessionScope: view.sessionScope,
    }),
    counts: Object.freeze({ files: 0, forms: 0, notifications: 0, tasks: 0 }),
    fixture: false,
    kind: "ready",
    navigationIds: Object.freeze(navigationIds),
  });
}

export function createWorkbenchHttpAdapter(facade: WorkbenchBootstrapFacade): Readonly<{
  bootstrap(input: Readonly<{ credential: string; traceId: string }>): Promise<Readonly<WorkbenchHttpResponse>>;
}> {
  return Object.freeze({
    async bootstrap(input): Promise<Readonly<WorkbenchHttpResponse>> {
      const traceId = typeof input.traceId === "string" && TRACE_ID.test(input.traceId) ? input.traceId : undefined;
      if (traceId === undefined || typeof input.credential !== "string" || !CREDENTIAL.test(input.credential)) {
        return Object.freeze({ body: Object.freeze({ code: "authentication_required" }), headers: headers(traceId), status: 401 });
      }
      try {
        const body = serialize(await facade.load({ credential: input.credential, traceId }));
        return Object.freeze({ body, headers: headers(traceId), status: 200 });
      } catch (error) {
        const code = errorCode(error);
        const unauthorized = code?.startsWith("authentication_") === true;
        const forbidden = !unauthorized && ["authorization_denied", "employment_not_active", "subject_not_associated"].includes(code ?? "");
        return Object.freeze({
          body: Object.freeze({ code: unauthorized ? "authentication_required" : forbidden ? "workbench_forbidden" : "workbench_unavailable" }),
          headers: headers(traceId),
          status: unauthorized ? 401 : forbidden ? 403 : 503,
        });
      }
    },
  });
}
