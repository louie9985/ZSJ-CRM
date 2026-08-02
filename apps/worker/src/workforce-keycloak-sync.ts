import { EventingError, type JobDeliveryIsolation, type MessageHandler, type RabbitConsumedNotice, type ValidatedMessage } from "@ai-crm/platform-eventing-outbox";
import type { FinishIdentitySyncCommand, IdentitySyncOperation, WorkforceAccount } from "@ai-crm/platform-workforce-access";

import type { RabbitInboxBinding } from "./handlers.js";
import { WorkforceKeycloakClientError } from "./workforce-keycloak-client.js";
import { workforceKeycloakSyncBindingId, workforceKeycloakSyncConsumerId, workforceKeycloakSyncRuntimePolicy } from "./workforce-keycloak-sync-policy.js";

const JOB_TYPE = "workforce-access.keycloak-sync.v1" as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEYCLOAK_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const USERNAME = /^[A-Za-z0-9._-]{4,32}$/u;
const PHONE = /^\+?[0-9]{6,20}$/u;

export interface WorkforceAccountQueryPort {
  getAccount(accountId: string): Promise<Readonly<WorkforceAccount>>;
}
export interface WorkforceIdentitySyncRecorderPort {
  finishIdentitySync(command: FinishIdentitySyncCommand): Promise<Readonly<IdentitySyncOperation>>;
  getIdentitySyncOperation(operationId: string): Promise<Readonly<IdentitySyncOperation>>;
}
export interface WorkforceKeycloakSyncPort {
  disable(input: Readonly<{ accountId: string; keycloakUserId: string; operationId: string; traceId: string }>, signal: AbortSignal): Promise<void>;
  revokeSessions(input: Readonly<{ accountId: string; keycloakUserId: string; operationId: string; traceId: string }>, signal: AbortSignal): Promise<void>;
  synchronizeLoginIdentifiers(input: Readonly<{ accountId: string; keycloakUserId: string; operationId: string; phone?: string; traceId: string; username: string }>, signal: AbortSignal): Promise<void>;
}

type Payload = Readonly<{
  accountId: string;
  action: "disable" | "revoke_sessions" | "synchronize_login_identifiers";
  keycloakUserId: string;
  operationId: string;
  phone?: string;
  retryOfOperationId?: string;
  username?: string;
}>;

function invalid(): never { throw new EventingError("eventing_invalid_input"); }
function record(value: unknown): Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : invalid(); }

function payload(message: ValidatedMessage): Payload {
  if (message.messageKind !== "job" || message.messageType !== JOB_TYPE || message.messageVersion !== 1) invalid();
  const envelope = record(message.envelope);
  const value = record(envelope["payload"]);
  const keys = Object.keys(value);
  if (!["accountId", "action", "keycloakUserId", "operationId"].every((key) => keys.includes(key)) || keys.some((key) => !["accountId", "action", "keycloakUserId", "operationId", "phone", "retryOfOperationId", "username"].includes(key))) invalid();
  const accountId = value["accountId"];
  const action = value["action"];
  const keycloakUserId = value["keycloakUserId"];
  const operationId = value["operationId"];
  const phone = value["phone"];
  const retryOfOperationId = value["retryOfOperationId"];
  const username = value["username"];
  if (typeof accountId !== "string" || !UUID.test(accountId) || typeof operationId !== "string" || !UUID.test(operationId) || typeof keycloakUserId !== "string" || !KEYCLOAK_ID.test(keycloakUserId) || !["disable", "revoke_sessions", "synchronize_login_identifiers"].includes(String(action))) invalid();
  if (retryOfOperationId !== undefined && (typeof retryOfOperationId !== "string" || !UUID.test(retryOfOperationId) || retryOfOperationId === operationId)) invalid();
  if (action === "synchronize_login_identifiers") {
    if (typeof username !== "string" || !USERNAME.test(username) || (phone !== undefined && (typeof phone !== "string" || !PHONE.test(phone)))) invalid();
  } else if (phone !== undefined || username !== undefined) invalid();
  return Object.freeze({ accountId, action: action as Payload["action"], keycloakUserId, operationId, ...(phone === undefined ? {} : { phone }), ...(retryOfOperationId === undefined ? {} : { retryOfOperationId }), ...(username === undefined ? {} : { username }) });
}

function traceId(message: ValidatedMessage): string {
  const value = message.traceparent?.split("-")[1];
  return value !== undefined && /^(?!0{32})[0-9a-f]{32}$/u.test(value) ? value : invalid();
}

export function createWorkforceKeycloakSyncMessageHandler(accounts: WorkforceAccountQueryPort, keycloak: WorkforceKeycloakSyncPort): MessageHandler {
  let accepted: Payload | undefined;
  return Object.freeze({
    kind: "job",
    messageType: JOB_TYPE,
    messageVersion: 1,
    async recheckAuthoritativeState(message: ValidatedMessage): Promise<boolean> {
      const candidate = payload(message);
      const account = await accounts.getAccount(candidate.accountId);
      const identifiersCurrent = candidate.action !== "synchronize_login_identifiers" || (candidate.username === account.username && candidate.phone === account.phone);
      const statusAllows = candidate.action === "disable"
        ? account.status === "disabled"
        : candidate.action === "revoke_sessions"
          ? account.status === "active" || account.status === "credential_pending" || account.status === "disabled"
          : account.status === "active" || account.status === "credential_pending";
      const valid = account.keycloakUserId === candidate.keycloakUserId && identifiersCurrent && statusAllows;
      accepted = valid ? candidate : undefined;
      return valid;
    },
    async handle(message: ValidatedMessage, signal: AbortSignal): Promise<void> {
      const value = accepted;
      accepted = undefined;
      if (value === undefined) invalid();
      const common = { accountId: value.accountId, keycloakUserId: value.keycloakUserId, operationId: value.operationId, traceId: traceId(message) };
      if (value.action === "disable") {
        await keycloak.disable(common, signal);
        return keycloak.revokeSessions(common, signal);
      }
      if (value.action === "revoke_sessions") return keycloak.revokeSessions(common, signal);
      if (value.username === undefined) invalid();
      await keycloak.synchronizeLoginIdentifiers({ ...common, ...(value.phone === undefined ? {} : { phone: value.phone }), username: value.username }, signal);
      await keycloak.revokeSessions(common, signal);
    },
  });
}

export function createWorkforceKeycloakSyncRabbitBinding(
  accounts: WorkforceAccountQueryPort & WorkforceIdentitySyncRecorderPort,
  keycloak: WorkforceKeycloakSyncPort,
  clock: () => Date = () => new Date(),
): Readonly<RabbitInboxBinding> {
  const finish = async (jobId: string, status: "failed" | "succeeded" | "superseded", errorCode?: "eventing_handler_timeout" | "identity_sync_failed"): Promise<void> => {
    const operation = await accounts.getIdentitySyncOperation(jobId);
    await accounts.finishIdentitySync({
      accountId: operation.accountId,
      actor: Object.freeze({ actorId: "worker.workforce-keycloak-sync", actorType: "system" }),
      completedAt: clock().toISOString(),
      ...(errorCode === undefined ? {} : { errorCode }),
      operationId: operation.operationId,
      reason: `workforce_keycloak_sync:${status}`,
      status,
      traceId: operation.traceId,
    });
  };
  return Object.freeze({
    bindingId: workforceKeycloakSyncBindingId,
    classify: classifyWorkforceKeycloakSyncError,
    consumer: workforceKeycloakSyncConsumerId,
    eventPolicy: workforceKeycloakSyncRuntimePolicy,
    handler: createWorkforceKeycloakSyncMessageHandler(accounts, keycloak),
    onConsumed: async (notice: RabbitConsumedNotice) => {
      if (notice.messageKind !== "job") return;
      if (notice.result.status === "completed" || notice.result.status === "duplicate") await finish(notice.messageId, "succeeded");
      else if (notice.result.status === "skipped") await finish(notice.messageId, "superseded");
      else await finish(notice.messageId, "failed", "identity_sync_failed");
    },
    onIsolated: async (notice: JobDeliveryIsolation) => {
      await finish(notice.jobId, "failed", notice.category === "terminal_failure" ? "identity_sync_failed" : "eventing_handler_timeout");
    },
  });
}

export function classifyWorkforceKeycloakSyncError(error: unknown): "retryable" | "terminal" {
  if (error instanceof WorkforceKeycloakClientError) return error.retryable ? "retryable" : "terminal";
  if (error instanceof EventingError) {
    return error.retryable && error.code !== "eventing_invalid_input" ? "retryable" : "terminal";
  }
  return "terminal";
}
