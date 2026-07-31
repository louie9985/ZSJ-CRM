import { createHash } from "node:crypto";

import {
  BrowserSessionFailure,
  runApiMain,
  type ApiPlatformBindingFactory,
  type ApiPlatformBindings,
} from "@ai-crm/api";
import {
  createTaskCenter,
  InMemoryTaskCenterStore,
  type TaskActor,
  type TaskLifecycleEvent,
  type TaskOperation,
  type TaskProjectionKey,
} from "@ai-crm/platform-task-center";

import {
  createWalkingSkeletonSource,
  createWalkingSkeletonTaskPorts,
  walkingSkeletonSourceType,
} from "./walking-skeleton-source.js";

const unavailable = (): Promise<never> => Promise.reject(new Error("e2e_capability_not_composed"));
const authenticationUnavailable = () => Promise.resolve({
  body: { code: "e2e_authentication_not_composed" },
  headers: { "Cache-Control": "no-store" },
  status: 503,
});

export const e2eTaskFixture = Object.freeze({
  activeAssignmentId: "assignment.e2e-task",
  actorContextReference: "actor-context.e2e-task",
  credential: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  csrfToken: "ccccccccccccccccccccccccccccccccccccccccccc",
  issuer: "https://identity.e2e.invalid/realms/walking-skeleton",
  sourceTaskId: "source-task.e2e-api",
  sourceType: walkingSkeletonSourceType,
  subject: "subject.e2e-task",
  workflowTaskId: "workflow-task.e2e-api",
});

export interface E2eProcessBindingOptions {
  readonly allowTaskOperation?: (operation: TaskOperation, key: TaskProjectionKey | undefined) => boolean;
  readonly onAuthorizationTrace?: (traceId: string) => void;
}

function stableActorId(): string {
  return `subject:${createHash("sha256").update(`${e2eTaskFixture.issuer}\0${e2eTaskFixture.subject}`).digest("hex")}`;
}

function exactActor(actor: TaskActor): boolean {
  return actor.principalId === stableActorId()
    && actor.activeAssignmentIds?.length === 1
    && actor.activeAssignmentIds[0] === e2eTaskFixture.activeAssignmentId;
}

function createE2eTaskCenter(options: E2eProcessBindingOptions) {
  const actor = Object.freeze({
    activeAssignmentIds: Object.freeze([e2eTaskFixture.activeAssignmentId]),
    principalId: stableActorId(),
  });
  const source = createWalkingSkeletonSource({
    audit: { record: () => Promise.resolve() },
    authorization: {
      authorize: (input) => Promise.resolve({
        allowed: input.actor.principalId === actor.principalId
          && input.actor.activeAssignmentIds.length === 1
          && input.actor.activeAssignmentIds[0] === e2eTaskFixture.activeAssignmentId
          && input.sourceTaskId === e2eTaskFixture.sourceTaskId,
        decisionId: "decision.e2e-source-complete",
      }),
    },
    resolver: {
      resolve: (reference) => reference === e2eTaskFixture.actorContextReference
        ? Promise.resolve(actor)
        : Promise.reject(new Error("e2e_actor_context_not_found")),
    },
  });
  source.register({
    actorContextReference: e2eTaskFixture.actorContextReference,
    assigneeReference: e2eTaskFixture.activeAssignmentId,
    sourceTaskId: e2eTaskFixture.sourceTaskId,
    sourceVersion: 1,
    status: "open",
    workflowTaskId: e2eTaskFixture.workflowTaskId,
  });
  const ports = createWalkingSkeletonTaskPorts({
    actorContextReference: (candidate) => exactActor(candidate)
      ? Promise.resolve(e2eTaskFixture.actorContextReference)
      : Promise.reject(new Error("e2e_actor_context_not_found")),
    source,
    workflowCompletion: (command) => exactActor(command.actor)
      && command.sourceType === e2eTaskFixture.sourceType
      && command.sourceTaskId === e2eTaskFixture.sourceTaskId
      ? Promise.resolve({
        eventId: "e2e00000-0000-5000-8000-000000000002",
        workflowTaskId: e2eTaskFixture.workflowTaskId,
      })
      : Promise.reject(new Error("e2e_workflow_task_not_found")),
  });
  const taskCenter = createTaskCenter({
    audit: { record: () => Promise.resolve() },
    authorization: {
      authorize: (input) => Promise.resolve({
        allowed: exactActor(input.actor)
          && (input.task === undefined
            || (input.task.sourceType === e2eTaskFixture.sourceType && input.task.sourceTaskId === e2eTaskFixture.sourceTaskId))
          && (options.allowTaskOperation?.(input.operation, input.task) ?? true),
        decisionId: `decision.e2e-task-${input.operation}`,
      }),
    },
    router: ports.router,
    sourceReader: ports.sourceReader,
    store: new InMemoryTaskCenterStore(),
  });
  const initialEvent: TaskLifecycleEvent = Object.freeze({
    assigneeReference: e2eTaskFixture.activeAssignmentId,
    deepLink: Object.freeze({ appId: "platform.synthetic", routeId: "platform.synthetic.detail" }),
    eventId: "e2e00000-0000-5000-8000-000000000001",
    occurredAt: "2026-07-31T00:00:00.000Z",
    sourceTaskId: e2eTaskFixture.sourceTaskId,
    sourceType: e2eTaskFixture.sourceType,
    sourceVersion: 1,
    status: "open",
  });
  const initialized = taskCenter.apply(initialEvent).then(() => undefined);
  return Object.freeze({
    complete: async (...args: Parameters<typeof taskCenter.complete>) => { await initialized; return taskCenter.complete(...args); },
    get: async (...args: Parameters<typeof taskCenter.get>) => { await initialized; return taskCenter.get(...args); },
    list: async (...args: Parameters<typeof taskCenter.list>) => { await initialized; return taskCenter.list(...args); },
  });
}

export function createE2eProcessBindings(options: E2eProcessBindingOptions = {}): ApiPlatformBindings {
  const tasks = createE2eTaskCenter(options);
  const principal = Object.freeze({
    authenticationSubject: Object.freeze({ issuer: e2eTaskFixture.issuer, subject: e2eTaskFixture.subject }),
    clientId: "pc-web",
    expiresAt: "2099-01-01T00:00:00.000Z",
    issuedAt: "2026-07-31T00:00:00.000Z",
  });
  const requireCredential = (credential: string) => credential === e2eTaskFixture.credential
    ? Promise.resolve(principal)
    : Promise.reject(new BrowserSessionFailure("authentication_session_invalid"));
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
    authorization: {
      requireAllowed: (_subject: unknown, permission: { readonly action: string; readonly resource: string }) => permission.action === "complete"
        && permission.resource === "platform.task-center.task-projection"
        ? Promise.resolve({ allowed: true, decisionId: "decision.e2e-http-task-complete", evaluatedAt: "2026-07-31T00:00:00.000Z", policyVersion: "e2e-task-v1", reason: "allowed" })
        : Promise.reject(new Error("e2e_operation_denied")),
    },
    authorizationTrace: {
      run: async (traceId: string, work: () => Promise<unknown>) => {
        options.onAuthorizationTrace?.(traceId);
        return work();
      },
    },
    databaseCompatibility: { assertCompatible: () => undefined },
    organization: {
      resolveWorkforceContext: (subject: { readonly issuer: string; readonly subject: string }, at: string) => subject.issuer === e2eTaskFixture.issuer && subject.subject === e2eTaskFixture.subject
        ? Promise.resolve({
          assignments: [{ assignmentId: e2eTaskFixture.activeAssignmentId, employmentId: "employment.e2e-task", organizationUnitId: "unit.e2e-task", positionId: "position.e2e-task" }],
          employmentIds: ["employment.e2e-task"],
          resolvedAt: at,
          subject,
          workforcePersonId: "person.e2e-task",
        })
        : Promise.reject(new Error("e2e_workforce_not_found")),
    },
    queries: {
      applicationRegistry: { loadRegistry: unavailable, resolveDeepLink: unavailable },
      fileCenter: { authorizeDownload: unavailable, completeUpload: unavailable, createUploadSession: unavailable },
      forms: { getRelease: unavailable, validateSubmission: unavailable },
      notifications: { get: unavailable, list: unavailable, unreadCount: unavailable },
      tasks,
    },
    readiness: () => [{ healthy: true, name: "e2e-process-bindings", required: true }],
    sessions: {
      resolvePrincipal: requireCredential,
      sessionForMutation: (credential: string) => requireCredential(credential).then(() => ({
        authenticatedAt: "2026-07-31T00:00:00.000Z",
        client: "pc-web" as const,
        csrfToken: e2eTaskFixture.csrfToken,
        expiresAt: "2099-01-01T00:00:00.000Z",
        sessionReference: "session.e2e-task",
      })),
    },
  };
  return bindings as unknown as ApiPlatformBindings;
}

export const e2eApiBindingFactory: ApiPlatformBindingFactory = Object.freeze({
  create: () => Promise.resolve(createE2eProcessBindings()),
});

if (process.env["AI_CRM_E2E_PROCESS_ENTRYPOINT"] === "api") {
  void runApiMain({ bindingFactory: e2eApiBindingFactory }).catch(() => { process.exitCode = 1; });
}
