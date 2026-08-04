import { createHash } from "node:crypto";

import type { EventingCore, JobEnvelope } from "@ai-crm/platform-eventing-outbox";

import type { IdentityAdministrationPort } from "./types.js";

const JOB_TYPE = "workforce-access.keycloak-sync.v1" as const;

function traceparent(traceId: string, operationId: string): string {
  const spanId = createHash("sha256").update(`workforce-keycloak-sync:${operationId}`).digest("hex").slice(0, 16);
  return `00-${traceId}-${spanId === "0000000000000000" ? "0000000000000001" : spanId}-01`;
}

export function createDurableIdentityAdministrationPort(input: Readonly<{
  clock?: () => Date;
  direct: Pick<IdentityAdministrationPort, "createDisabledAccount" | "setPasswordAndEnable">;
  eventing: Pick<EventingCore, "submitJob">;
}>): Readonly<IdentityAdministrationPort> {
  const clock = input.clock ?? (() => new Date());
  const submit = async (
    action: "disable" | "revoke_sessions" | "synchronize_login_identifiers",
    command: Readonly<{ accountId: string; keycloakUserId: string; operationId: string; phone?: string; retryOfOperationId?: string; traceId: string; username?: string }>,
  ): Promise<void> => {
    const requestedAt = clock().toISOString();
    const envelope: JobEnvelope = Object.freeze({
      correlationId: command.operationId,
      idempotencyKey: `workforce-keycloak-sync/${command.operationId}`,
      jobId: command.operationId,
      jobType: JOB_TYPE,
      jobVersion: 1,
      payload: Object.freeze({
        accountId: command.accountId,
        action,
        keycloakUserId: command.keycloakUserId,
        operationId: command.operationId,
        ...(command.phone === undefined ? {} : { phone: command.phone }),
        ...(command.retryOfOperationId === undefined ? {} : { retryOfOperationId: command.retryOfOperationId }),
        ...(command.username === undefined ? {} : { username: command.username }),
      }),
      policy: Object.freeze({ backoffSeconds: Object.freeze([5, 30]), failureDisposition: "isolate", maxAttempts: 3, timeoutMs: 10_000 }),
      requestedAt,
      source: "urn:ai-crm:workforce-access",
      traceparent: traceparent(command.traceId, command.operationId),
    });
    await input.eventing.submitJob(envelope);
  };
  return Object.freeze({
    createDisabledAccount: (command: Parameters<IdentityAdministrationPort["createDisabledAccount"]>[0]) => input.direct.createDisabledAccount(command),
    disableAccount: (command: Parameters<IdentityAdministrationPort["disableAccount"]>[0]) => submit("disable", command),
    revokeSessions: (command: Parameters<IdentityAdministrationPort["revokeSessions"]>[0]) => submit("revoke_sessions", command),
    setPasswordAndEnable: (command: Parameters<IdentityAdministrationPort["setPasswordAndEnable"]>[0]) => input.direct.setPasswordAndEnable(command),
    synchronizeLoginIdentifiers: (command: Parameters<IdentityAdministrationPort["synchronizeLoginIdentifiers"]>[0]) => submit("synchronize_login_identifiers", command),
  });
}
