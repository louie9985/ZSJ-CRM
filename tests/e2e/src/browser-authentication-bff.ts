import { readFile } from "node:fs/promises";

import {
  connectRedisSessionStore,
  createApiApplication,
  createOidcClient,
  createPcAuthenticationHttpAdapter,
  createPcBffSessionService,
  createRedisBrowserSessionStore,
  type RedisSessionConnection,
} from "@ai-crm/api";
import { createOidcTokenVerifier } from "@ai-crm/platform-auth-context";

export interface BrowserAuthenticationBffOptions {
  readonly clientSecretFile: string;
  readonly encryptionKeyFile: string;
  readonly indexingKeyFile: string;
  readonly issuer: string;
  readonly port: number;
  readonly publicOrigin: string;
  readonly redisPasswordFile: string;
  readonly redisUrl: string;
}

export interface RunningBrowserAuthenticationBff {
  advanceClock(milliseconds: number): void;
  close(): Promise<void>;
}

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
    const application = createApiApplication({
      authentication,
      authenticationCallbackUrl: (pathAndQuery) => new URL(pathAndQuery, options.publicOrigin).href,
      dependencies: () => [
        { healthy: connection.isReady(), name: "redis-session-store", required: true },
      ],
      logger: { log: () => undefined },
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
