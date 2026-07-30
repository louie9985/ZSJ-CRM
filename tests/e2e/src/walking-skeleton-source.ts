import { createHash, randomUUID } from "node:crypto";

import type { TaskActor, TaskLifecycleEvent, TaskProjectionKey, TaskSourceCommandRouter, TaskSourceReader } from "@ai-crm/platform-task-center";

export const walkingSkeletonSourceType = "tests.walking-skeleton" as const;

export type WalkingSkeletonSourceErrorCode =
  | "source_actor_context_invalid"
  | "source_command_conflict"
  | "source_command_invalid"
  | "source_operation_denied"
  | "source_storage_unavailable"
  | "source_state_conflict"
  | "source_state_not_found";

export class WalkingSkeletonSourceError extends Error {
  public constructor(public readonly code: WalkingSkeletonSourceErrorCode, public readonly retryable = false) {
    super(code);
    this.name = "WalkingSkeletonSourceError";
  }
}

export interface WalkingSkeletonActorContext {
  readonly activeAssignmentIds: readonly string[];
  readonly principalId: string;
}

export interface WalkingSkeletonSourceState {
  readonly actorContextReference: string;
  readonly assigneeReference: string;
  readonly sourceTaskId: string;
  readonly sourceVersion: number;
  readonly status: "completed" | "open";
  readonly workflowTaskId: string;
}

export interface WalkingSkeletonSourceCommand {
  readonly action: "complete";
  readonly actorContextReference: string;
  readonly commandId: string;
  readonly expectedSourceVersion: number;
  readonly fileReferences?: readonly string[];
  readonly formSubmissionReference?: string;
  readonly sourceTaskId: string;
  readonly sourceType: typeof walkingSkeletonSourceType;
  readonly workflowCompletionEventId: string;
  readonly workflowTaskId: string;
}

export interface WalkingSkeletonSourceReceipt {
  readonly lifecycleEvent: TaskLifecycleEvent;
  readonly sourceCommandId: string;
  readonly status: "accepted";
}

export interface WalkingSkeletonSourceAudit {
  record(input: {
    readonly decisionId: string;
    readonly errorCode?: WalkingSkeletonSourceErrorCode;
    readonly operation: "source_complete";
    readonly phase: "attempted" | "failed" | "succeeded";
    readonly referenceId: string;
  }): Promise<void>;
}

export interface WalkingSkeletonSourceAuthorization {
  authorize(input: {
    readonly actor: WalkingSkeletonActorContext;
    readonly operation: "source_complete";
    readonly sourceTaskId: string;
  }): Promise<{ readonly allowed: boolean; readonly decisionId: string }>;
}

export interface WalkingSkeletonActorContextResolver {
  resolve(reference: string): Promise<WalkingSkeletonActorContext>;
}

interface AcceptedCommand {
  readonly fingerprint: string;
  readonly receipt: WalkingSkeletonSourceReceipt;
}

interface RunningCommand {
  readonly fingerprint: string;
  readonly promise: Promise<WalkingSkeletonSourceReceipt>;
}

const stableId = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function requireStableId(value: string): string {
  if (!stableId.test(value)) throw new WalkingSkeletonSourceError("source_command_invalid");
  return value;
}

function requireUuid(value: string): string {
  if (!uuid.test(value)) throw new WalkingSkeletonSourceError("source_command_invalid");
  return value;
}

function validateActor(actor: WalkingSkeletonActorContext): WalkingSkeletonActorContext {
  if (!stableId.test(actor.principalId) || actor.activeAssignmentIds.length > 100 || actor.activeAssignmentIds.some((id) => !stableId.test(id))) {
    throw new WalkingSkeletonSourceError("source_actor_context_invalid");
  }
  return Object.freeze({ activeAssignmentIds: Object.freeze([...actor.activeAssignmentIds]), principalId: actor.principalId });
}

function validateCommand(command: WalkingSkeletonSourceCommand): WalkingSkeletonSourceCommand {
  const raw = command as unknown as Readonly<Record<string, unknown>>;
  if (raw["action"] !== "complete" || raw["sourceType"] !== walkingSkeletonSourceType || !Number.isSafeInteger(command.expectedSourceVersion) || command.expectedSourceVersion < 1) {
    throw new WalkingSkeletonSourceError("source_command_invalid");
  }
  requireUuid(command.commandId);
  requireUuid(command.workflowCompletionEventId);
  requireStableId(command.actorContextReference);
  requireStableId(command.sourceTaskId);
  requireStableId(command.workflowTaskId);
  if (command.formSubmissionReference !== undefined) requireStableId(command.formSubmissionReference);
  if ((command.fileReferences?.length ?? 0) > 20 || command.fileReferences?.some((reference) => !stableId.test(reference)) === true || new Set(command.fileReferences).size !== (command.fileReferences?.length ?? 0)) {
    throw new WalkingSkeletonSourceError("source_command_invalid");
  }
  return command;
}

function commandFingerprint(command: WalkingSkeletonSourceCommand): string {
  return createHash("sha256").update(JSON.stringify({
    action: command.action,
    actorContextReference: command.actorContextReference,
    commandId: command.commandId,
    expectedSourceVersion: command.expectedSourceVersion,
    fileReferences: [...(command.fileReferences ?? [])],
    formSubmissionReference: command.formSubmissionReference ?? null,
    sourceTaskId: command.sourceTaskId,
    sourceType: command.sourceType,
    workflowCompletionEventId: command.workflowCompletionEventId,
    workflowTaskId: command.workflowTaskId,
  })).digest("hex");
}

function deterministicCommandId(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "8";
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export function createWalkingSkeletonSource(options: {
  readonly audit: WalkingSkeletonSourceAudit;
  readonly authorization: WalkingSkeletonSourceAuthorization;
  readonly clock?: () => Date;
  readonly resolver: WalkingSkeletonActorContextResolver;
}) {
  const accepted = new Map<string, AcceptedCommand>();
  const running = new Map<string, RunningCommand>();
  const states = new Map<string, WalkingSkeletonSourceState>();
  const clock = options.clock ?? (() => new Date());

  const readState = (sourceTaskId: string): WalkingSkeletonSourceState => {
    const state = states.get(sourceTaskId);
    if (state === undefined) throw new WalkingSkeletonSourceError("source_state_not_found");
    return state;
  };

  const execute = async (command: WalkingSkeletonSourceCommand): Promise<WalkingSkeletonSourceReceipt> => {
    const actor = validateActor(await options.resolver.resolve(command.actorContextReference));
    const decision = await options.authorization.authorize({ actor, operation: "source_complete", sourceTaskId: command.sourceTaskId });
    const decisionId = requireStableId(decision.decisionId);
    const referenceId = `${walkingSkeletonSourceType}:${command.sourceTaskId}`;
    if (!decision.allowed) {
      await options.audit.record({ decisionId, errorCode: "source_operation_denied", operation: "source_complete", phase: "failed", referenceId });
      throw new WalkingSkeletonSourceError("source_operation_denied");
    }
    await options.audit.record({ decisionId, operation: "source_complete", phase: "attempted", referenceId });
    try {
      const current = readState(command.sourceTaskId);
      if (current.status !== "open" || current.sourceVersion !== command.expectedSourceVersion || current.actorContextReference !== command.actorContextReference || current.workflowTaskId !== command.workflowTaskId) {
        throw new WalkingSkeletonSourceError("source_state_conflict");
      }
      const completed: WalkingSkeletonSourceState = Object.freeze({ ...current, sourceVersion: current.sourceVersion + 1, status: "completed" });
      states.set(command.sourceTaskId, completed);
      const receipt: WalkingSkeletonSourceReceipt = Object.freeze({
        lifecycleEvent: Object.freeze({
          assigneeReference: completed.assigneeReference,
          deepLink: Object.freeze({ appId: "platform.synthetic", routeId: "platform.synthetic.detail" }),
          eventId: command.workflowCompletionEventId,
          occurredAt: clock().toISOString(),
          sourceTaskId: completed.sourceTaskId,
          sourceType: walkingSkeletonSourceType,
          sourceVersion: completed.sourceVersion,
          status: "completed",
        }),
        sourceCommandId: command.commandId,
        status: "accepted",
      });
      try {
        await options.audit.record({ decisionId, operation: "source_complete", phase: "succeeded", referenceId });
      } catch (error) {
        if (states.get(command.sourceTaskId) === completed) states.set(command.sourceTaskId, current);
        throw error;
      }
      return receipt;
    } catch (error) {
      const failure = error instanceof WalkingSkeletonSourceError ? error : new WalkingSkeletonSourceError("source_state_conflict");
      await options.audit.record({ decisionId, errorCode: failure.code, operation: "source_complete", phase: "failed", referenceId });
      throw failure;
    }
  };

  return Object.freeze({
    canAccept(commandInput: WalkingSkeletonSourceCommand): boolean {
      const command = validateCommand(commandInput);
      const current = states.get(command.sourceTaskId);
      return current !== undefined
        && current.status === "open"
        && current.sourceVersion === command.expectedSourceVersion
        && current.actorContextReference === command.actorContextReference
        && current.workflowTaskId === command.workflowTaskId;
    },
    complete(input: { readonly command: WalkingSkeletonSourceCommand; readonly idempotencyKey: string }): Promise<WalkingSkeletonSourceReceipt> {
      const command = validateCommand(input.command);
      const idempotencyKey = requireStableId(input.idempotencyKey);
      if (idempotencyKey.length < 8 || idempotencyKey.length > 128) return Promise.reject(new WalkingSkeletonSourceError("source_command_invalid"));
      const fingerprint = commandFingerprint(command);
      const previous = accepted.get(idempotencyKey);
      if (previous !== undefined) {
        if (previous.fingerprint !== fingerprint) return Promise.reject(new WalkingSkeletonSourceError("source_command_conflict"));
        return Promise.resolve(previous.receipt);
      }
      const active = running.get(idempotencyKey);
      if (active !== undefined) {
        if (active.fingerprint !== fingerprint) return Promise.reject(new WalkingSkeletonSourceError("source_command_conflict"));
        return active.promise;
      }
      const promise = execute(command).then((receipt) => {
        accepted.set(idempotencyKey, Object.freeze({ fingerprint, receipt }));
        return receipt;
      }).finally(() => { running.delete(idempotencyKey); });
      running.set(idempotencyKey, Object.freeze({ fingerprint, promise }));
      return promise;
    },
    getState(sourceTaskId: string): WalkingSkeletonSourceState {
      return readState(requireStableId(sourceTaskId));
    },
    register(state: WalkingSkeletonSourceState): void {
      requireStableId(state.actorContextReference);
      requireStableId(state.assigneeReference);
      requireStableId(state.sourceTaskId);
      requireStableId(state.workflowTaskId);
      if (!Number.isSafeInteger(state.sourceVersion) || state.sourceVersion < 1 || states.has(state.sourceTaskId)) throw new WalkingSkeletonSourceError("source_state_conflict");
      states.set(state.sourceTaskId, Object.freeze({ ...state }));
    },
  });
}

export function createWalkingSkeletonTaskPorts(input: {
  readonly actorContextReference: (actor: TaskActor) => Promise<string>;
  readonly source: ReturnType<typeof createWalkingSkeletonSource>;
  readonly workflowCompletion: (key: TaskProjectionKey & { readonly actor: TaskActor; readonly idempotencyKey: string }) => Promise<{ readonly eventId: string; readonly workflowTaskId: string }>;
}): { readonly router: TaskSourceCommandRouter; readonly sourceReader: TaskSourceReader } {
  type RoutedCommand = TaskProjectionKey & { readonly actor: TaskActor; readonly idempotencyKey: string };
  const preparedCommands = new Map<string, Promise<WalkingSkeletonSourceCommand>>();
  const prepare = (command: RoutedCommand): Promise<WalkingSkeletonSourceCommand> => {
    const routeKey = `${command.actor.principalId}:${command.sourceType}:${command.sourceTaskId}:${command.idempotencyKey}`;
    const existing = preparedCommands.get(routeKey);
    if (existing !== undefined) return existing;
    const current = input.source.getState(command.sourceTaskId);
    const pending = Promise.all([
      input.workflowCompletion(command),
      input.actorContextReference(command.actor),
    ]).then(([workflow, actorContextReference]) => {
      return Object.freeze({
        action: "complete" as const,
        actorContextReference,
        commandId: deterministicCommandId(`${walkingSkeletonSourceType}:${command.sourceTaskId}:${command.idempotencyKey}`),
        expectedSourceVersion: current.sourceVersion,
        sourceTaskId: command.sourceTaskId,
        sourceType: walkingSkeletonSourceType,
        workflowCompletionEventId: workflow.eventId,
        workflowTaskId: workflow.workflowTaskId,
      });
    });
    preparedCommands.set(routeKey, pending);
    void pending.catch(() => {
      if (preparedCommands.get(routeKey) === pending) preparedCommands.delete(routeKey);
    });
    return pending;
  };
  return Object.freeze({
    router: Object.freeze({
      async complete(command: RoutedCommand) {
        const receipt = await input.source.complete({ command: await prepare(command), idempotencyKey: command.idempotencyKey });
        return { sourceCommandId: receipt.sourceCommandId, status: receipt.status };
      },
    }),
    sourceReader: Object.freeze({
      get(key: TaskProjectionKey) {
        if (key.sourceType !== walkingSkeletonSourceType) return Promise.reject(new WalkingSkeletonSourceError("source_state_not_found"));
        const state = input.source.getState(key.sourceTaskId);
        return Promise.resolve({
          assigneeReference: state.assigneeReference,
          deepLink: { appId: "platform.synthetic", routeId: "platform.synthetic.detail" },
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          sourceTaskId: state.sourceTaskId,
          sourceType: walkingSkeletonSourceType,
          sourceVersion: state.sourceVersion,
          status: state.status,
        });
      },
    }),
  });
}
