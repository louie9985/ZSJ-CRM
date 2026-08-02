import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

import {
  connectRedisSessionStore,
  createApiApplication,
  createOidcClient,
  createPcAuthenticationHttpAdapter,
  createPcBffSessionService,
  createRedisBrowserSessionStore,
  validateBrowserMutation,
  type ApiComposition,
  type RedisSessionConnection,
} from "@ai-crm/api";
import { createOidcTokenVerifier } from "@ai-crm/platform-auth-context";
import {
  createAuthorizationService,
  type AuthorizationCache,
  type AuthorizationDecision,
  type AuthorizationPolicySnapshot,
  type AuthorizationPolicyStore,
  type PermissionRequest,
} from "@ai-crm/platform-authorization";
import { createMemoryOrganizationService, type OrganizationServiceApi } from "@ai-crm/platform-organization";
import type { AuthenticationSubject, WorkforceContext } from "@ai-crm/platform-organization";

import { recordBrowserTaskCommand } from "./browser-task-command.js";

export interface BrowserAuthenticationBffOptions {
  readonly clientSecretFile: string;
  readonly encryptionKeyFile: string;
  readonly indexingKeyFile: string;
  readonly issuer: string;
  readonly port: number;
  readonly publicOrigin: string;
  readonly redisPasswordFile: string;
  readonly redisUrl: string;
  readonly taskCompletionCommandFile?: string;
  readonly taskAuthorizationSubject?: string;
}

export interface RunningBrowserAuthenticationBff {
  advanceClock(milliseconds: number): void;
  close(): Promise<void>;
  setTaskAuthorizationScenario(scenario: BrowserTaskAuthorizationScenario): void;
}

export type BrowserTaskAuthorizationScenario = "allowed" | "inactive_employment" | "permission_denied" | "unlinked";

type BrowserPlatformHttp = NonNullable<ApiComposition["platformHttp"]>;
type BrowserTaskCommand = Parameters<NonNullable<BrowserPlatformHttp["tasks"]>["complete"]>[0];
type BrowserTaskMutation = Parameters<BrowserPlatformHttp["validateTaskMutation"]>[0];

export async function closeBrowserAuthenticationBffResources(
  application: Readonly<{ stop(): Promise<void> }>,
  connection: Readonly<{ close(): Promise<void> }>,
): Promise<void> {
  const results = await Promise.allSettled([application.stop(), connection.close()]);
  const failures: unknown[] = [];
  for (const result of results) {
    if (result.status === "rejected") failures.push(result.reason as unknown);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Browser authentication BFF cleanup failed.");
  }
}

async function secret(path: string): Promise<string> {
  const value = (await readFile(path, "utf8")).trim();
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new Error("e2e_browser_auth_secret_invalid");
  return value;
}

function key(id: string, value: string): Readonly<{ readonly id: string; readonly value: Uint8Array }> {
  return Object.freeze({ id, value: new Uint8Array(Buffer.from(value, "base64url")) });
}

const fixtureIds = Object.freeze({
  allowed: Object.freeze({
    assignment: "71000000-0000-4000-8000-000000000007", association: "71000000-0000-4000-8000-000000000003",
    employment: "71000000-0000-4000-8000-000000000002", person: "71000000-0000-4000-8000-000000000001",
    placement: "71000000-0000-4000-8000-000000000005", position: "71000000-0000-4000-8000-000000000006",
    unit: "71000000-0000-4000-8000-000000000004",
  }),
  inactive: Object.freeze({
    assignment: "72000000-0000-4000-8000-000000000007", association: "72000000-0000-4000-8000-000000000003",
    employment: "72000000-0000-4000-8000-000000000002", person: "72000000-0000-4000-8000-000000000001",
    placement: "72000000-0000-4000-8000-000000000005", position: "72000000-0000-4000-8000-000000000006",
    unit: "72000000-0000-4000-8000-000000000004",
  }),
  denied: Object.freeze({
    assignment: "73000000-0000-4000-8000-000000000007", association: "73000000-0000-4000-8000-000000000003",
    employment: "73000000-0000-4000-8000-000000000002", person: "73000000-0000-4000-8000-000000000001",
    placement: "73000000-0000-4000-8000-000000000005", position: "73000000-0000-4000-8000-000000000006",
    unit: "73000000-0000-4000-8000-000000000004",
  }),
});

type FixtureIds = (typeof fixtureIds)[keyof typeof fixtureIds];

async function organizationFixture(
  subject: Readonly<{ readonly issuer: string; readonly subject: string }>,
  ids: FixtureIds,
  inactive: boolean,
): Promise<OrganizationServiceApi> {
  const organization = createMemoryOrganizationService({ authorize: () => Promise.resolve() });
  const metadata = () => ({
    actor: { actorId: "system.e2e-browser-auth", actorType: "system" as const },
    operationId: randomUUID(),
    reason: "business-neutral browser authorization fixture",
    traceId: "71000000000000000000000000000001",
  });
  const effectiveFrom = "2026-01-01T00:00:00.000Z";
  const effectiveTo = inactive ? "2026-01-02T00:00:00.000Z" : undefined;
  const assignmentEffectiveTo = effectiveTo ?? "2099-01-01T00:00:00.000Z";
  await organization.createWorkforcePerson({ ...metadata(), recordedAt: effectiveFrom, workforcePersonId: ids.person });
  await organization.createEmployment({ ...metadata(), effectiveFrom, ...(effectiveTo === undefined ? {} : { effectiveTo }), employmentId: ids.employment, workforcePersonId: ids.person });
  await organization.createOrganizationUnit({ ...metadata(), effectiveFrom, organizationUnitId: ids.unit, placementId: ids.placement });
  await organization.createPosition({ ...metadata(), effectiveFrom, organizationUnitId: ids.unit, positionId: ids.position });
  await organization.createAssignment({ ...metadata(), assignmentId: ids.assignment, effectiveFrom, effectiveTo: assignmentEffectiveTo, employmentId: ids.employment, organizationUnitId: ids.unit, positionId: ids.position, workforcePersonId: ids.person });
  await organization.createSubjectAssociation({ ...metadata(), ...subject, associationId: ids.association, effectiveFrom, workforcePersonId: ids.person });
  return organization;
}

function authorizationFixture(ids: FixtureIds, grant: boolean) {
  const permission = Object.freeze({ action: "complete", code: "platform.task-center.task-projection:complete", resource: "platform.task-center.task-projection", scopeDimensions: Object.freeze([]) });
  const roleId = "74000000-0000-4000-8000-000000000001";
  const snapshot: AuthorizationPolicySnapshot = Object.freeze({
    grants: grant ? Object.freeze([{ grantId: "74000000-0000-4000-8000-000000000002", roleId, subject: { assignmentId: ids.assignment, kind: "assignment" as const }, validFrom: "2026-01-01T00:00:00.000Z" }]) : Object.freeze([]),
    permissions: Object.freeze([permission]),
    roles: Object.freeze([{ permissions: Object.freeze([{ permissionCode: permission.code, scope: Object.freeze({ terms: Object.freeze([{ kind: "all" as const }]), version: 1 as const }) }]), roleId }]),
    version: grant ? "e2e-browser-task-allowed-v1" : "e2e-browser-task-denied-v1",
  });
  const store: AuthorizationPolicyStore = { currentVersion: () => Promise.resolve(snapshot.version), load: (version) => Promise.resolve(version === snapshot.version ? snapshot : undefined) };
  const cache: AuthorizationCache = { get: () => Promise.resolve(undefined), invalidatePolicyVersion: () => Promise.resolve(), set: () => Promise.resolve() };
  let traceId = "71000000000000000000000000000002";
  return Object.freeze({
    service: createAuthorizationService({ cache, recorder: { record: () => Promise.resolve() }, store }, { cacheTtlSeconds: 1, clock: () => new Date(), decisionId: randomUUID, traceId: () => traceId }),
    setTraceId(value: string): void { traceId = value; },
  });
}

type BrowserTaskAuthorizationFixture = Readonly<{
  readonly authorization: ReturnType<typeof authorizationFixture>;
  readonly organization: OrganizationServiceApi;
}>;
export type BrowserTaskAuthorizationFixtures = Readonly<Record<BrowserTaskAuthorizationScenario, BrowserTaskAuthorizationFixture>>;

export async function createBrowserTaskAuthorizationFixtures(subject: AuthenticationSubject): Promise<BrowserTaskAuthorizationFixtures> {
  return Object.freeze({
    allowed: Object.freeze({ authorization: authorizationFixture(fixtureIds.allowed, true), organization: await organizationFixture(subject, fixtureIds.allowed, false) }),
    inactive_employment: Object.freeze({ authorization: authorizationFixture(fixtureIds.inactive, true), organization: await organizationFixture(subject, fixtureIds.inactive, true) }),
    permission_denied: Object.freeze({ authorization: authorizationFixture(fixtureIds.denied, false), organization: await organizationFixture(subject, fixtureIds.denied, false) }),
    unlinked: Object.freeze({ authorization: authorizationFixture(fixtureIds.allowed, true), organization: createMemoryOrganizationService({ authorize: () => Promise.resolve() }) }),
  });
}

export async function authorizeBrowserTaskFixture(
  fixtures: BrowserTaskAuthorizationFixtures,
  scenario: BrowserTaskAuthorizationScenario,
  subject: AuthenticationSubject,
  input: Readonly<{ readonly at: string; readonly permission: PermissionRequest; readonly traceId: string }>,
): Promise<Readonly<{ readonly decision: AuthorizationDecision; readonly workforce: WorkforceContext }>> {
  const fixture = fixtures[scenario];
  const workforce = await fixture.organization.resolveWorkforceContext(subject, input.at);
  const activeAssignmentIds = workforce.assignments.map(({ assignmentId }) => assignmentId);
  if (activeAssignmentIds.length !== 1) throw new Error("e2e_browser_task_workforce_context_invalid");
  fixture.authorization.setTraceId(input.traceId);
  const decision = await fixture.authorization.service.requireAllowed({
    activeAssignmentIds,
    selectedAssignmentId: activeAssignmentIds[0] ?? "",
    workforcePersonId: workforce.workforcePersonId,
  }, input.permission);
  return Object.freeze({ decision, workforce });
}

export async function startBrowserAuthenticationBff(
  options: BrowserAuthenticationBffOptions,
): Promise<Readonly<RunningBrowserAuthenticationBff>> {
  const [clientSecret, redisPassword, encryptionValue, indexingValue] = await Promise.all([
    secret(options.clientSecretFile),
    secret(options.redisPasswordFile),
    secret(options.encryptionKeyFile),
    secret(options.indexingKeyFile),
  ]);
  const connection: Readonly<RedisSessionConnection> = await connectRedisSessionStore({
    connectTimeoutMs: 2_000,
    password: redisPassword,
    url: options.redisUrl,
  });
  let nowMs = Date.now();
  try {
    const clientId = "ai-crm-pc-bff";
    const audience = "ai-crm-api";
    const redirectUri = `${options.publicOrigin}/auth/pc/callback`;
    const oidc = await createOidcClient({
      clientId,
      clientSecret,
      issuer: options.issuer,
      redirectUri,
      timeoutSeconds: 5,
    });
    const encryptionKey = key("e2e-browser-auth-current", encryptionValue);
    const service = createPcBffSessionService({
      audit: { record: () => Promise.resolve() },
      clock: () => nowMs,
      decryptionKeys: [encryptionKey],
      encryptionKey,
      indexingKey: new Uint8Array(Buffer.from(indexingValue, "base64url")),
      loginTransactionTtlSeconds: 60,
      oidc,
      refreshLeaseTtlMs: 5_000,
      sessionAbsoluteTtlSeconds: 120,
      sessionIdleTtlSeconds: 60,
      store: createRedisBrowserSessionStore(connection.executor),
      tokenVerifier: createOidcTokenVerifier({
        audience,
        clientId,
        clockToleranceSeconds: 5,
        issuer: options.issuer,
        jwksCacheMaxAgeMs: 60_000,
        jwksCooldownMs: 1_000,
        jwksTimeoutMs: 5_000,
        jwksUri: `${options.issuer}/protocol/openid-connect/certs`,
      }),
    });
    const authentication = createPcAuthenticationHttpAdapter({
      allowedOrigins: [options.publicOrigin],
      cookieMaxAgeSeconds: 120,
      service,
    });
    const taskSubject = Object.freeze({ issuer: options.issuer, subject: options.taskAuthorizationSubject ?? "" });
    const taskFixtures = options.taskCompletionCommandFile === undefined || options.taskAuthorizationSubject === undefined
      ? undefined
      : await createBrowserTaskAuthorizationFixtures(taskSubject);
    let taskAuthorizationScenario: BrowserTaskAuthorizationScenario = "allowed";
    const traceByActor = new Map<string, string>();
    const platformHttp: ApiComposition["platformHttp"] = options.taskCompletionCommandFile === undefined ? undefined : Object.freeze({
      applicationRegistry: {} as BrowserPlatformHttp["applicationRegistry"],
      authorize: async (input: Parameters<BrowserPlatformHttp["authorize"]>[0]) => {
        if (input.permission.action !== "complete" || input.permission.resource !== "platform.task-center.task-projection" || input.traceId === undefined) {
          throw new Error("e2e_browser_task_authorization_denied");
        }
        const principal = await service.resolvePrincipal(input.credential);
        const subject = principal.authenticationSubject;
        if (taskFixtures === undefined || subject.issuer !== taskSubject.issuer || subject.subject !== taskSubject.subject) {
          throw new Error("e2e_browser_task_authorization_denied");
        }
        const { decision, workforce } = await authorizeBrowserTaskFixture(taskFixtures, taskAuthorizationScenario, subject, {
          at: input.at,
          permission: input.permission,
          traceId: input.traceId,
        });
        const actorId = `subject:${createHash("sha256").update(`${subject.issuer}\0${subject.subject}`).digest("hex")}`;
        if (traceByActor.has(actorId)) throw new Error("e2e_browser_task_request_concurrent");
        traceByActor.set(actorId, input.traceId);
        return Object.freeze({
          decision,
          principal,
          workforce,
        });
      },
      fileCenter: {} as BrowserPlatformHttp["fileCenter"],
      forms: {} as BrowserPlatformHttp["forms"],
      tasks: Object.freeze({
        complete: async (command: BrowserTaskCommand) => {
          const traceId = traceByActor.get(command.actor.principalId);
          if (traceId === undefined) throw new Error("e2e_browser_task_trace_unavailable");
          traceByActor.delete(command.actor.principalId);
          return recordBrowserTaskCommand(options.taskCompletionCommandFile ?? "", command, traceId);
        },
      }),
      validateTaskMutation: async (input: BrowserTaskMutation) => {
        const session = await service.sessionForMutation(input.credential);
        validateBrowserMutation({
          allowedOrigins: [options.publicOrigin],
          csrfHeader: input.csrfToken,
          csrfSessionValue: session.csrfToken,
          origin: input.origin,
          referer: input.referer,
        });
      },
    });
    const application = createApiApplication({
      authentication,
      authenticationCallbackUrl: (pathAndQuery) => new URL(pathAndQuery, options.publicOrigin).href,
      dependencies: () => [
        { healthy: connection.isReady(), name: "redis-session-store", required: true },
      ],
      logger: { log: () => undefined },
      ...(platformHttp === undefined ? {} : { platformHttp }),
    });
    // Docker Desktop reaches the test-only host BFF through host.docker.internal.
    await application.start(options.port, "0.0.0.0");
    return Object.freeze({
      advanceClock(milliseconds: number): void {
        if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
          throw new Error("e2e_browser_auth_clock_advance_invalid");
        }
        nowMs += milliseconds;
      },
      async close(): Promise<void> {
        await closeBrowserAuthenticationBffResources(application, connection);
      },
      setTaskAuthorizationScenario(scenario: BrowserTaskAuthorizationScenario): void {
        taskAuthorizationScenario = scenario;
      },
    });
  } catch (error) {
    await connection.close();
    throw error;
  }
}
