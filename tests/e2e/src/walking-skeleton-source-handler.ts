import {
  EventingError,
  type JobEnvelope,
  type MessageHandler,
  type ValidatedMessage,
} from "@ai-crm/platform-eventing-outbox";

import {
  walkingSkeletonSourceType,
  type WalkingSkeletonSourceCommand,
  type WalkingSkeletonSourceReceipt,
} from "./walking-skeleton-source.js";

export const walkingSkeletonSourceJobType = "tests.walking-skeleton.source-command" as const;

export interface WalkingSkeletonSourceCommandPort {
  canAccept(command: WalkingSkeletonSourceCommand): boolean | Promise<boolean>;
  complete(input: { readonly command: WalkingSkeletonSourceCommand; readonly idempotencyKey: string }): Promise<WalkingSkeletonSourceReceipt>;
}

const requiredPayloadKeys = Object.freeze([
  "action",
  "actorContextReference",
  "commandId",
  "expectedSourceVersion",
  "sourceTaskId",
  "sourceType",
  "workflowCompletionEventId",
  "workflowTaskId",
]);
const optionalPayloadKeys = Object.freeze(["fileReferences", "formSubmissionReference"]);

function invalid(): never {
  throw new EventingError("eventing_invalid_input");
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : invalid();
}

function string(value: unknown): string {
  return typeof value === "string" ? value : invalid();
}

function parse(message: ValidatedMessage): { readonly command: WalkingSkeletonSourceCommand; readonly idempotencyKey: string } {
  if (message.messageKind !== "job" || message.messageType !== walkingSkeletonSourceJobType || message.messageVersion !== 1) invalid();
  const envelope = message.envelope as JobEnvelope;
  const rawPolicy = record(record(message.envelope)["policy"]);
  if (envelope.jobType !== walkingSkeletonSourceJobType
    || envelope.jobVersion !== 1
    || envelope.source !== "urn:ai-crm:tests.walking-skeleton"
    || envelope.policy.maxAttempts !== 3
    || envelope.policy.timeoutMs !== 10_000
    || rawPolicy["failureDisposition"] !== "isolate"
    || envelope.policy.backoffSeconds.length !== 2
    || envelope.policy.backoffSeconds[0] !== 30
    || envelope.policy.backoffSeconds[1] !== 300) invalid();
  const payload = record(envelope.payload);
  const keys = Object.keys(payload);
  if (!requiredPayloadKeys.every((key) => keys.includes(key)) || keys.some((key) => !requiredPayloadKeys.includes(key) && !optionalPayloadKeys.includes(key))) invalid();
  const fileReferences = payload["fileReferences"];
  if (fileReferences !== undefined && (!Array.isArray(fileReferences) || !fileReferences.every((item) => typeof item === "string"))) invalid();
  const expectedSourceVersion = payload["expectedSourceVersion"];
  if (!Number.isSafeInteger(expectedSourceVersion)) invalid();
  return Object.freeze({
    command: Object.freeze({
      action: string(payload["action"]) as "complete",
      actorContextReference: string(payload["actorContextReference"]),
      commandId: string(payload["commandId"]),
      expectedSourceVersion: expectedSourceVersion as number,
      ...(fileReferences === undefined ? {} : { fileReferences: Object.freeze([...fileReferences]) }),
      ...(payload["formSubmissionReference"] === undefined ? {} : { formSubmissionReference: string(payload["formSubmissionReference"]) }),
      sourceTaskId: string(payload["sourceTaskId"]),
      sourceType: string(payload["sourceType"]) as typeof walkingSkeletonSourceType,
      workflowCompletionEventId: string(payload["workflowCompletionEventId"]),
      workflowTaskId: string(payload["workflowTaskId"]),
    }),
    idempotencyKey: envelope.idempotencyKey,
  });
}

export function createWalkingSkeletonSourceCommandMessageHandler(
  source: WalkingSkeletonSourceCommandPort,
): MessageHandler {
  if (typeof source.canAccept !== "function" || typeof source.complete !== "function") throw new Error("e2e_source_port_invalid");
  return Object.freeze({
    kind: "job",
    messageType: walkingSkeletonSourceJobType,
    messageVersion: 1,
    async recheckAuthoritativeState(message: ValidatedMessage, signal: AbortSignal): Promise<boolean> {
      signal.throwIfAborted();
      const acceptable = await source.canAccept(parse(message).command);
      signal.throwIfAborted();
      return acceptable;
    },
    async handle(message: ValidatedMessage, signal: AbortSignal): Promise<void> {
      signal.throwIfAborted();
      await source.complete(parse(message));
      signal.throwIfAborted();
    },
  });
}
