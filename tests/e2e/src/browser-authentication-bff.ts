import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

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
}

export interface RunningBrowserAuthenticationBff {
  advanceClock(milliseconds: number): void;
  close(): Promise<void>;
}

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
    const traceByActor = new Map<string, string>();
    const platformHttp: ApiComposition["platformHttp"] = options.taskCompletionCommandFile === undefined ? undefined : Object.freeze({
      applicationRegistry: {} as BrowserPlatformHttp["applicationRegistry"],
      authorize: async (input: Parameters<BrowserPlatformHttp["authorize"]>[0]) => {
        if (input.permission.action !== "complete" || input.permission.resource !== "platform.task-center.task-projection" || input.traceId === undefined) {
          throw new Error("e2e_browser_task_authorization_denied");
        }
        const principal = await service.resolvePrincipal(input.credential);
        const subject = principal.authenticationSubject;
        const actorId = `subject:${createHash("sha256").update(`${subject.issuer}\0${subject.subject}`).digest("hex")}`;
        if (traceByActor.has(actorId)) throw new Error("e2e_browser_task_request_concurrent");
        traceByActor.set(actorId, input.traceId);
        return Object.freeze({
          decision: Object.freeze({ allowed: true, decisionId: "decision.e2e-browser-task-complete", evaluatedAt: input.at, policyVersion: "e2e-browser-task-v1", reason: "allowed" }),
          principal,
          workforce: Object.freeze({
            assignments: Object.freeze([{ assignmentId: "assignment.synthetic", employmentId: "employment.synthetic", organizationUnitId: "unit.synthetic", positionId: "position.synthetic" }]),
            employmentIds: Object.freeze(["employment.synthetic"]),
            resolvedAt: input.at,
            subject,
            workforcePersonId: "person.synthetic",
          }),
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
    });
  } catch (error) {
    await connection.close();
    throw error;
  }
}
