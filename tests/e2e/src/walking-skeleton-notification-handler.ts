import {
  EventingError,
  type JsonValue,
  type JobEnvelope,
  type MessageHandler,
  type ValidatedMessage,
} from "@ai-crm/platform-eventing-outbox";
import type {
  NotificationActor,
  NotificationCenter,
  NotificationDeepLink,
  NotificationIntent,
  RecipientSelector,
} from "@ai-crm/platform-notifications";

export const walkingSkeletonNotificationJobType = "platform.notifications.intent-submit" as const;

export interface WalkingSkeletonNotificationActorResolver {
  resolve(reference: string): Promise<NotificationActor>;
}

const intentKeys = Object.freeze(["deepLink", "idempotencyKey", "intentId", "producer", "selectors", "sourceId", "sourceType", "templateKey", "templateVersion", "variables"]);
const deepLinkRequiredKeys = Object.freeze(["applicationId", "resourceId", "resourceType", "routeId"]);

function invalid(): never {
  throw new EventingError("eventing_invalid_input");
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : invalid();
}

function exact(value: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): void {
  const keys = Object.keys(value);
  if (!required.every((key) => keys.includes(key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) invalid();
}

function string(value: unknown): string {
  return typeof value === "string" ? value : invalid();
}

function parseIntent(value: unknown): NotificationIntent {
  const intent = record(value);
  exact(intent, intentKeys);
  const selectorsValue = intent["selectors"];
  if (!Array.isArray(selectorsValue)) invalid();
  const selectors: RecipientSelector[] = selectorsValue.map((value) => {
    const selector = record(value);
    exact(selector, ["referenceId", "selectorType"]);
    return Object.freeze({ referenceId: string(selector["referenceId"]), selectorType: string(selector["selectorType"]) });
  });
  const link = record(intent["deepLink"]);
  exact(link, deepLinkRequiredKeys, ["parameters"]);
  const parametersValue = link["parameters"];
  const parameters = parametersValue === undefined ? undefined : Object.fromEntries(
    Object.entries(record(parametersValue)).map(([key, item]) => [key, string(item)]),
  );
  const deepLink: NotificationDeepLink = Object.freeze({
    applicationId: string(link["applicationId"]),
    resourceId: string(link["resourceId"]),
    resourceType: string(link["resourceType"]),
    routeId: string(link["routeId"]),
    ...(parameters === undefined ? {} : { parameters: Object.freeze(parameters) }),
  });
  const templateVersion = intent["templateVersion"];
  if (!Number.isSafeInteger(templateVersion)) invalid();
  return Object.freeze({
    deepLink,
    idempotencyKey: string(intent["idempotencyKey"]),
    intentId: string(intent["intentId"]),
    producer: string(intent["producer"]),
    selectors: Object.freeze(selectors),
    sourceId: string(intent["sourceId"]),
    sourceType: string(intent["sourceType"]),
    templateKey: string(intent["templateKey"]),
    templateVersion: templateVersion as number,
    variables: record(intent["variables"]) as Readonly<Record<string, JsonValue>>,
  });
}

function parse(message: ValidatedMessage): { readonly actorContextReference: string; readonly intent: NotificationIntent } {
  if (message.messageKind !== "job" || message.messageType !== walkingSkeletonNotificationJobType || message.messageVersion !== 1) invalid();
  const envelope = message.envelope as JobEnvelope;
  const rawPolicy = record(record(message.envelope)["policy"]);
  if (envelope.jobType !== walkingSkeletonNotificationJobType
    || envelope.jobVersion !== 1
    || envelope.policy.maxAttempts !== 3
    || envelope.policy.timeoutMs !== 10_000
    || rawPolicy["failureDisposition"] !== "isolate"
    || envelope.policy.backoffSeconds.length !== 2
    || envelope.policy.backoffSeconds[0] !== 30
    || envelope.policy.backoffSeconds[1] !== 300) invalid();
  const payload = record(envelope.payload);
  exact(payload, ["actorContextReference", "intent"]);
  return Object.freeze({ actorContextReference: string(payload["actorContextReference"]), intent: parseIntent(payload["intent"]) });
}

export function createWalkingSkeletonNotificationMessageHandler(
  center: NotificationCenter,
  resolver: WalkingSkeletonNotificationActorResolver,
): MessageHandler {
  if (typeof center.submitIntent !== "function" || typeof resolver.resolve !== "function") throw new Error("e2e_notification_port_invalid");
  const actors = new Map<string, Promise<NotificationActor>>();
  const resolveActor = (message: ValidatedMessage): Promise<NotificationActor> => {
    const existing = actors.get(message.messageId);
    if (existing !== undefined) return existing;
    const pending = resolver.resolve(parse(message).actorContextReference);
    actors.set(message.messageId, pending);
    void pending.catch(() => { if (actors.get(message.messageId) === pending) actors.delete(message.messageId); });
    return pending;
  };
  return Object.freeze({
    kind: "job",
    messageType: walkingSkeletonNotificationJobType,
    messageVersion: 1,
    async recheckAuthoritativeState(message: ValidatedMessage, signal: AbortSignal): Promise<boolean> {
      signal.throwIfAborted();
      await resolveActor(message);
      signal.throwIfAborted();
      return true;
    },
    async handle(message: ValidatedMessage, signal: AbortSignal): Promise<void> {
      signal.throwIfAborted();
      const input = parse(message);
      const actor = await resolveActor(message);
      signal.throwIfAborted();
      await center.submitIntent(actor, input.intent);
      signal.throwIfAborted();
    },
  });
}
