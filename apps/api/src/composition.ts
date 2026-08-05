import { createHash } from "node:crypto";

import { createTraceContext, extractTraceContext, type HealthDependency } from "@ai-crm/observability";
import type { AuditService } from "@ai-crm/crm-audit";
import type {
  AuthorizationDecision,
  AuthorizationService,
  PermissionRequest,
} from "@ai-crm/crm-authorization";
import type { FileCenterService } from "@ai-crm/crm-file-center";
import type { FormSchemaQueryService } from "@ai-crm/crm-form-schema";
import type { NotificationCenter } from "@ai-crm/crm-notifications";
import type { OrganizationServiceApi, WorkforcePersonContext } from "@ai-crm/crm-organization";
import type { TaskCenter } from "@ai-crm/crm-task-center";

import type { AccountAccessPrincipal } from "./auth/account-access-service.js";
import type { LocalAuthenticationHttpAdapter } from "./auth/local-http-adapter.js";
import { validateLocalBrowserMutation } from "./auth/local-http-adapter.js";
import type { AuthenticationSurface } from "./auth/local-session-store.js";
import type { ApiComposition } from "./index.js";
import type { RealtimeServer } from "./realtime/realtime-server.js";
import {
  createFileCenterHttpAdapter,
  type FileCenterHttpAdapter,
} from "./platform-http/file-center-http.js";
import {
  createFormSchemaHttpAdapter,
  type FormSchemaHttpAdapter,
} from "./platform-http/form-schema-http.js";
import { createWorkbenchHttpAdapter, type WorkbenchBootstrapFacade } from "./platform-http/workbench-http.js";
import {
  createWorkforceAdministrationHttpAdapter,
  type WorkforceAdministrationFacade,
} from "./platform-http/workforce-administration-http.js";

export interface DatabaseMigrationCompatibility {
  readonly assertCompatible: (signal: AbortSignal) => void | Promise<void>;
}

export interface ProtectedOperationInput {
  readonly at: string;
  readonly credential: string;
  readonly permission: PermissionRequest;
  readonly selectedAssignmentId?: string;
  readonly surface: AuthenticationSurface;
  readonly traceId?: string;
}

export interface AuthorizedOperationContext {
  readonly assignmentId?: string;
  readonly decision: Readonly<AuthorizationDecision>;
  readonly principal: Readonly<AccountAccessPrincipal>;
  readonly workforce: Readonly<WorkforcePersonContext>;
}

export interface ApiQueryBindings {
  readonly fileCenter: Pick<FileCenterService, "authorizeDownload" | "completeUpload" | "createUploadSession">;
  readonly forms: FormSchemaQueryService;
  readonly notifications: Pick<NotificationCenter, "get" | "list" | "unreadCount"> & Partial<Pick<NotificationCenter, "activateTemplate" | "archive" | "getTemplateAdministration" | "listTemplateDefinitions" | "markRead" | "previewTemplate" | "publishTemplateDraft" | "saveTemplateDraft">>;
  readonly tasks: Pick<TaskCenter, "get" | "list"> & Partial<Pick<TaskCenter, "complete">>;
}

export interface ApiPlatformBindings {
  readonly audit: AuditService;
  readonly accountAccess: LocalAuthenticationHttpAdapter;
  readonly partTimeAccess?: LocalAuthenticationHttpAdapter;
  readonly browserSecurity: { readonly allowedOrigins: Readonly<Record<AuthenticationSurface, string>> };
  readonly authorization: AuthorizationService;
  readonly authorizationTrace: {
    readonly run: <T>(traceId: string, work: () => Promise<T>) => Promise<T>;
  };
  readonly close?: () => void | Promise<void>;
  readonly databaseCompatibility: DatabaseMigrationCompatibility;
  readonly organization: OrganizationServiceApi;
  readonly queries: ApiQueryBindings;
  readonly readiness: () => readonly HealthDependency[];
  readonly realtime?: RealtimeServer;
  readonly sessions: Readonly<{
    logout?: (credential: string, traceId?: string) => Promise<void>;
    resolvePrincipal: (surface: AuthenticationSurface, credential: string, traceId?: string) => Promise<Readonly<AccountAccessPrincipal>>;
    sessionForMutation: (surface: AuthenticationSurface, credential: string) => Promise<Readonly<{ authenticatedAt: string; client: "internal-h5" | "pc-web"; csrfToken: string; expiresAt: string; sessionReference: string }>>;
  }>;
  readonly workbench?: WorkbenchBootstrapFacade;
  readonly workforceAdministration?: WorkforceAdministrationFacade;
}

export interface ApiPlatformHttpComposition {
  readonly authorize: ApiPlatformComposition["authorize"];
  readonly fileCenter: FileCenterHttpAdapter;
  readonly forms: FormSchemaHttpAdapter;
  readonly notifications?: Pick<NotificationCenter, "list"> & Partial<Pick<NotificationCenter, "activateTemplate" | "archive" | "get" | "getTemplateAdministration" | "listTemplateDefinitions" | "markRead" | "previewTemplate" | "publishTemplateDraft" | "saveTemplateDraft" | "unreadCount">>;
  /** Test-scoped causal-evidence port; production bindings use TaskCenter.complete. */
  readonly taskCompletionWithTrace?: (command: Parameters<TaskCenter["complete"]>[0], traceparent: string) => ReturnType<TaskCenter["complete"]>;
  readonly tasks?: Partial<Pick<TaskCenter, "complete" | "list">>;
  /** Explicitly bound only by the disposable Walking Skeleton E2E BFF. */
  readonly walkingSkeletonFormSubmissions?: Readonly<{
    handle(request: Readonly<{
      readonly body?: string | Uint8Array;
      readonly contentType?: string;
      readonly credential?: string;
      readonly csrfToken?: string;
      readonly idempotencyKey?: string;
      readonly method: string;
      readonly origin?: string;
      readonly referer?: string;
      readonly traceparent?: string;
    }>): Promise<Readonly<{ readonly body: unknown; readonly headers: Readonly<Record<string, string>>; readonly status: number }>>;
  }>;
  readonly validateFormMutation: (input: BrowserMutationInput) => Promise<void>;
  readonly validateNotificationMutation?: (input: BrowserMutationInput) => Promise<void>;
  readonly validateTaskMutation: (input: BrowserMutationInput) => Promise<void>;
}

export interface BrowserMutationInput {
    readonly credential: string;
    readonly csrfToken?: string;
    readonly origin?: string;
    readonly referer?: string;
    readonly surface: AuthenticationSurface;
}

export interface ApiPlatformComposition {
  readonly bindings: ApiPlatformBindings;
  readonly lifecycle: Pick<ApiComposition, "accountAccess" | "partTimeAccess" | "dependencies" | "onStart" | "onStop" | "platformHttp" | "realtime" | "workbenchHttp" | "workforceAdministrationHttp">;
  readonly authorize: (input: ProtectedOperationInput) => Promise<Readonly<AuthorizedOperationContext>>;
}

function actorId(context: Readonly<AuthorizedOperationContext>): string {
  return `account:${createHash("sha256").update(context.principal.accountId).digest("hex")}`;
}

function requireBinding(value: unknown, name: string): void {
  if (value === undefined || value === null) throw new Error(`api_binding_missing_${name}`);
}

function requireFunction(value: unknown, name: string): void {
  if (typeof value !== "function") throw new Error(`api_binding_missing_${name}`);
}

function requireMethod(value: object, method: string, name: string): void {
  requireFunction(Reflect.get(value, method), name);
}

function assertStartupActive(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("api_start_cancelled");
}

/**
 * Explicit application wiring. It intentionally creates no HTTP business
 * routes: the reviewed contracts do not yet define a generic authorization or
 * capability endpoint. Controllers can consume these named bindings directly.
 */
export function createApiPlatformComposition(bindings: ApiPlatformBindings): Readonly<ApiPlatformComposition> {
  requireBinding(bindings.audit, "audit");
  requireBinding(bindings.accountAccess, "account_access");
  requireBinding(bindings.browserSecurity, "browser_security");
  requireBinding(bindings.authorization, "authorization");
  requireBinding(bindings.authorizationTrace, "authorization_trace");
  if (bindings.close !== undefined) requireFunction(bindings.close, "close");
  requireBinding(bindings.databaseCompatibility, "database_compatibility");
  requireBinding(bindings.organization, "organization");
  requireBinding(bindings.queries, "queries");
  requireBinding(bindings.queries.fileCenter, "file_queries");
  requireBinding(bindings.queries.forms, "form_queries");
  requireBinding(bindings.queries.notifications, "notification_queries");
  requireBinding(bindings.queries.tasks, "task_queries");
  requireBinding(bindings.sessions, "sessions");
  requireMethod(bindings.audit, "readSensitive", "audit_read");
  requireMethod(bindings.audit, "record", "audit_record");
  requireMethod(bindings.accountAccess, "login", "account_access_login");
  requireMethod(bindings.accountAccess, "session", "account_access_session");
  requireMethod(bindings.accountAccess, "reauthentication", "account_access_reauthentication");
  requireMethod(bindings.accountAccess, "assignment", "account_access_assignment");
  requireMethod(bindings.accountAccess, "logout", "account_access_logout");
  requireMethod(bindings.authorization, "requireAllowed", "authorization_require_allowed");
  requireFunction(bindings.authorizationTrace.run, "authorization_trace_run");
  requireFunction(bindings.databaseCompatibility.assertCompatible, "database_compatibility_check");
  requireMethod(bindings.organization, "resolveWorkforcePersonContext", "organization_resolve_workforce_person");
  requireFunction(bindings.queries.fileCenter.authorizeDownload, "file_authorize_download");
  requireFunction(bindings.queries.fileCenter.completeUpload, "file_complete_upload");
  requireFunction(bindings.queries.fileCenter.createUploadSession, "file_create_upload_session");
  requireMethod(bindings.queries.forms, "getRelease", "form_get_release");
  requireMethod(bindings.queries.forms, "validateSubmission", "form_validate_submission");
  requireFunction(bindings.queries.notifications.get, "notification_get");
  requireFunction(bindings.queries.notifications.list, "notification_list");
  requireFunction(bindings.queries.notifications.unreadCount, "notification_unread_count");
  requireFunction(bindings.queries.tasks.get, "task_get");
  requireFunction(bindings.queries.tasks.list, "task_list");
  requireFunction(bindings.readiness, "readiness");
  requireFunction(bindings.sessions.resolvePrincipal, "session_resolve_principal");
  requireFunction(bindings.sessions.sessionForMutation, "session_for_mutation");
  if (bindings.workbench !== undefined) requireMethod(bindings.workbench, "load", "workbench_load");
  if (bindings.workforceAdministration !== undefined) {
    requireMethod(bindings.workforceAdministration, "execute", "workforce_administration_execute");
    requireMethod(bindings.workforceAdministration, "load", "workforce_administration_load");
  }

  const authorize = async (input: ProtectedOperationInput): Promise<Readonly<AuthorizedOperationContext>> => {
    const traceId = input.traceId ?? createTraceContext().traceId;
    return bindings.authorizationTrace.run(traceId, async () => {
      const principal = await bindings.sessions.resolvePrincipal(input.surface, input.credential, traceId);
      const assignmentId = input.selectedAssignmentId ?? principal.currentAssignmentId;
      const workforce = await bindings.organization.resolveWorkforcePersonContext(
        principal.workforcePersonId,
        input.at,
        assignmentId,
      );
      const decision = await bindings.authorization.requireAllowed({
        activeAssignmentIds: workforce.assignments.map((assignment) => assignment.assignmentId),
        ...(assignmentId === undefined ? {} : { selectedAssignmentId: assignmentId }),
        workforcePersonId: workforce.workforcePersonId,
      }, input.permission);
      return Object.freeze({ ...(assignmentId === undefined ? {} : { assignmentId }), decision, principal, workforce });
    });
  };
  const forms = createFormSchemaHttpAdapter({
    authorize: async (input) => {
      const traceId = extractTraceContext({ traceparent: input.traceparent }).traceId;
      const context = await authorize({ ...input, surface: "pc", traceId });
      return Object.freeze({
        activeAssignmentIds: context.workforce.assignments.map((assignment) => assignment.assignmentId),
        actorId: actorId(context),
        traceId,
        workforcePersonId: context.workforce.workforcePersonId,
        ...(context.assignmentId === undefined ? {} : { assignmentId: context.assignmentId }),
      });
    },
    service: bindings.queries.forms,
  });
  const fileCenter = createFileCenterHttpAdapter({
    actorResolver: {
      resolve: async (input) => {
        const context = await authorize({
          at: new Date().toISOString(),
          credential: input.credential,
          permission: {
            action: input.operation,
            resource: "crm.file-center.file",
          },
          traceId: input.traceId,
          surface: "pc",
          ...(input.selectedAssignmentId === undefined ? {} : { selectedAssignmentId: input.selectedAssignmentId }),
        });
        return Object.freeze({
          actorId: context.workforce.workforcePersonId,
          actorType: "authenticated_subject" as const,
          ...(context.assignmentId === undefined ? {} : { assignmentId: context.assignmentId }),
        });
      },
    },
    allowedOrigins: [bindings.browserSecurity.allowedOrigins.pc],
    service: bindings.queries.fileCenter,
    sessions: { sessionForMutation: (credential) => bindings.sessions.sessionForMutation("pc", credential) },
  });
  const validateMutation = async (input: BrowserMutationInput): Promise<void> => {
    const session = await bindings.sessions.sessionForMutation(input.surface, input.credential);
    validateLocalBrowserMutation({
      allowedOrigin: bindings.browserSecurity.allowedOrigins[input.surface],
      ...(input.csrfToken === undefined ? {} : { csrfToken: input.csrfToken }),
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      ...(input.referer === undefined ? {} : { referer: input.referer }),
      sessionCsrfToken: session.csrfToken,
    });
  };
  const platformHttp: Readonly<ApiPlatformHttpComposition> = Object.freeze({
    authorize,
    fileCenter,
    forms,
    notifications: {
      list: (query: Parameters<ApiQueryBindings["notifications"]["list"]>[0]) => bindings.queries.notifications.list(query),
      get: bindings.queries.notifications.get.bind(bindings.queries.notifications),
      unreadCount: bindings.queries.notifications.unreadCount.bind(bindings.queries.notifications),
      ...(bindings.queries.notifications.markRead === undefined ? {} : { markRead: bindings.queries.notifications.markRead.bind(bindings.queries.notifications) }),
      ...(bindings.queries.notifications.archive === undefined ? {} : { archive: bindings.queries.notifications.archive.bind(bindings.queries.notifications) }),
      ...(bindings.queries.notifications.listTemplateDefinitions === undefined ? {} : { listTemplateDefinitions: bindings.queries.notifications.listTemplateDefinitions.bind(bindings.queries.notifications) }),
      ...(bindings.queries.notifications.getTemplateAdministration === undefined ? {} : { getTemplateAdministration: bindings.queries.notifications.getTemplateAdministration.bind(bindings.queries.notifications) }),
      ...(bindings.queries.notifications.saveTemplateDraft === undefined ? {} : { saveTemplateDraft: bindings.queries.notifications.saveTemplateDraft.bind(bindings.queries.notifications) }),
      ...(bindings.queries.notifications.previewTemplate === undefined ? {} : { previewTemplate: bindings.queries.notifications.previewTemplate.bind(bindings.queries.notifications) }),
      ...(bindings.queries.notifications.publishTemplateDraft === undefined ? {} : { publishTemplateDraft: bindings.queries.notifications.publishTemplateDraft.bind(bindings.queries.notifications) }),
      ...(bindings.queries.notifications.activateTemplate === undefined ? {} : { activateTemplate: bindings.queries.notifications.activateTemplate.bind(bindings.queries.notifications) }),
    },
    tasks: { list: (query: Parameters<ApiQueryBindings["tasks"]["list"]>[0]) => bindings.queries.tasks.list(query), complete: async (command: Parameters<NonNullable<ApiQueryBindings["tasks"]["complete"]>>[0]) => {
      const result = await bindings.queries.tasks.complete?.(command);
      if (result === undefined) throw new Error("task_completion_binding_missing");
      return result;
    } },
    validateFormMutation: validateMutation,
    validateNotificationMutation: validateMutation,
    validateTaskMutation: validateMutation,
  });
  const workbenchHttp = bindings.workbench === undefined ? undefined : createWorkbenchHttpAdapter(bindings.workbench);
  const workforceAdministrationHttp = bindings.workforceAdministration === undefined
    ? undefined
    : createWorkforceAdministrationHttpAdapter(bindings.workforceAdministration);

  return Object.freeze({
    authorize,
    bindings,
    lifecycle: Object.freeze({
    accountAccess: bindings.accountAccess,
      ...(bindings.partTimeAccess === undefined ? {} : { partTimeAccess: bindings.partTimeAccess }),
      dependencies: bindings.readiness,
      ...(bindings.realtime === undefined ? {} : { realtime: bindings.realtime }),
      platformHttp,
      ...(workbenchHttp === undefined ? {} : { workbenchHttp }),
      ...(workforceAdministrationHttp === undefined ? {} : { workforceAdministrationHttp }),
      onStart: async (signal: AbortSignal) => {
        assertStartupActive(signal);
        await bindings.databaseCompatibility.assertCompatible(signal);
        assertStartupActive(signal);
      },
      ...(bindings.close === undefined ? {} : { onStop: bindings.close }),
    }),
  });
}
