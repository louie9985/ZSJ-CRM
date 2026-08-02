import { createHash, randomUUID } from "node:crypto";

import type { FileReference } from "@ai-crm/platform-file-center";
import { FormSchemaError, type FormQueryContext, type FormSchemaQueryService } from "@ai-crm/platform-form-schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TRACEPARENT = /^00-((?!0{32})[0-9a-f]{32})-(?!0{16})[0-9a-f]{16}-0[01]$/u;
const DEFINITION_ID = "platform.synthetic.task-completion";

export type WalkingSkeletonFormSubmissionErrorCode =
  | "submission_conflict"
  | "submission_denied"
  | "submission_dependency_unavailable"
  | "submission_invalid";

export class WalkingSkeletonFormSubmissionError extends Error {
  constructor(readonly code: WalkingSkeletonFormSubmissionErrorCode, readonly retryable = false, options?: { readonly cause?: unknown }) {
    super(code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "WalkingSkeletonFormSubmissionError";
  }
}

export interface WalkingSkeletonFormSubmissionCommand {
  readonly context: FormQueryContext;
  readonly data: Readonly<{ readonly content_version_id: string; readonly file_id: string; readonly synthetic_value: string }>;
  readonly fileReference: FileReference;
  readonly operationId: string;
  readonly traceparent: string;
}

export interface WalkingSkeletonFormSubmissionReceipt {
  readonly fileReference: FileReference;
  readonly operationId: string;
  readonly reference: Readonly<{ readonly contentDigest: string; readonly definitionId: typeof DEFINITION_ID; readonly releaseVersion: 1; readonly version: 1 }>;
  readonly replayed: boolean;
  readonly submissionReference: string;
  readonly submittedAt: string;
  readonly traceId: string;
  readonly version: 1;
}

export interface WalkingSkeletonFormSubmissionStoreInput {
  readonly actor: Readonly<{ readonly actorId: string; readonly assignmentId?: string; readonly workforcePersonId: string }>;
  readonly auditId: string;
  readonly authorizationDecisionId: string;
  readonly eventId: string;
  readonly fingerprint: string;
  readonly receipt: Omit<WalkingSkeletonFormSubmissionReceipt, "replayed">;
  readonly traceparent: string;
}

export interface WalkingSkeletonFormSubmissionStore {
  accept(input: WalkingSkeletonFormSubmissionStoreInput): Promise<WalkingSkeletonFormSubmissionReceipt>;
  getBySubmissionReference(submissionReference: string): Promise<(Omit<WalkingSkeletonFormSubmissionReceipt, "replayed"> & { readonly actor: WalkingSkeletonFormSubmissionStoreInput["actor"] }) | undefined>;
}

export interface WalkingSkeletonFormSubmissionAuthorizer {
  authorize(input: Readonly<{ readonly context: FormQueryContext; readonly definitionId: typeof DEFINITION_ID; readonly releaseVersion: 1 }>): Promise<Readonly<{ readonly allowed: boolean; readonly decisionId: string }>>;
}

export type WalkingSkeletonFormSubmissionDependencyStage = "authorize" | "store" | "validate";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function validFileReference(value: FileReference): boolean {
  return UUID.test(value.fileId) && UUID.test(value.contentVersionId) && value.displayName.length > 0 && value.displayName.length <= 255 && !/[\0\r\n]/u.test(value.displayName)
    && (value.mediaType === undefined || (value.mediaType.length >= 3 && value.mediaType.length <= 255 && !/[\0\r\n]/u.test(value.mediaType)))
    && (value.sizeBytes === undefined || (Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0));
}

function parse(command: WalkingSkeletonFormSubmissionCommand): WalkingSkeletonFormSubmissionCommand & { readonly traceId: string } {
  const traceId = TRACEPARENT.exec(command.traceparent)?.[1];
  if (!UUID.test(command.operationId) || traceId === undefined || command.context.traceId !== traceId || !validFileReference(command.fileReference) ||
    command.data.file_id !== command.fileReference.fileId || command.data.content_version_id !== command.fileReference.contentVersionId ||
    command.data.synthetic_value.length < 1 || command.data.synthetic_value.length > 500) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
  return Object.freeze({ ...command, operationId: command.operationId.toLowerCase(), traceId });
}

export function createWalkingSkeletonFormSubmissionService(input: Readonly<{
  readonly authorizer: WalkingSkeletonFormSubmissionAuthorizer;
  readonly clock?: () => Date;
  readonly id?: () => string;
  readonly onDependencyFailure?: (stage: WalkingSkeletonFormSubmissionDependencyStage) => void;
  readonly store: WalkingSkeletonFormSubmissionStore;
  readonly validator: FormSchemaQueryService;
}>): Readonly<{ submit(command: WalkingSkeletonFormSubmissionCommand): Promise<WalkingSkeletonFormSubmissionReceipt> }> {
  const id = input.id ?? randomUUID;
  const clock = input.clock ?? (() => new Date());
  return Object.freeze({
    async submit(command): Promise<WalkingSkeletonFormSubmissionReceipt> {
      const parsed = parse(command);
      let authorization: Readonly<{ readonly allowed: boolean; readonly decisionId: string }>;
      try { authorization = await input.authorizer.authorize({ context: parsed.context, definitionId: DEFINITION_ID, releaseVersion: 1 }); }
      catch (error) {
        input.onDependencyFailure?.("authorize");
        throw new WalkingSkeletonFormSubmissionError("submission_dependency_unavailable", true, { cause: error });
      }
      if (!authorization.allowed || !UUID.test(authorization.decisionId)) throw new WalkingSkeletonFormSubmissionError("submission_denied");
      let validation: Awaited<ReturnType<FormSchemaQueryService["validateSubmission"]>>;
      try { validation = await input.validator.validateSubmission({ context: parsed.context, data: parsed.data, definitionId: DEFINITION_ID, releaseVersion: 1 }); }
      catch (error) {
        if (error instanceof FormSchemaError && error.code === "form_denied") throw new WalkingSkeletonFormSubmissionError("submission_denied");
        if (error instanceof FormSchemaError && (error.code === "form_not_found" || error.code === "form_invalid_input" || error.code === "form_schema_rejected")) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
        input.onDependencyFailure?.("validate");
        throw new WalkingSkeletonFormSubmissionError("submission_dependency_unavailable", true, { cause: error });
      }
      if (!validation.valid || validation.reference.definitionId !== DEFINITION_ID || validation.reference.releaseVersion !== 1) throw new WalkingSkeletonFormSubmissionError("submission_invalid");
      const submittedAt = clock().toISOString();
      const receipt = Object.freeze({
        fileReference: Object.freeze({ ...parsed.fileReference }), operationId: parsed.operationId,
        reference: Object.freeze({ ...validation.reference, definitionId: DEFINITION_ID, releaseVersion: 1 as const }),
        submissionReference: `submission.${id()}`, submittedAt, traceId: parsed.traceId, version: 1 as const,
      });
      const fingerprint = createHash("sha256").update(canonical({ actor: parsed.context.actor, data: parsed.data, fileReference: parsed.fileReference, operationId: parsed.operationId, reference: validation.reference, subject: parsed.context.subject })).digest("hex");
      try {
        return await input.store.accept({
          actor: Object.freeze({ actorId: parsed.context.actor.actorId, ...(parsed.context.subject.selectedAssignmentId === undefined ? {} : { assignmentId: parsed.context.subject.selectedAssignmentId }), workforcePersonId: parsed.context.subject.workforcePersonId }),
          auditId: id(), authorizationDecisionId: authorization.decisionId, eventId: id(), fingerprint, receipt, traceparent: parsed.traceparent,
        });
      } catch (error) {
        if (error instanceof WalkingSkeletonFormSubmissionError) throw error;
        input.onDependencyFailure?.("store");
        throw new WalkingSkeletonFormSubmissionError("submission_dependency_unavailable", true, { cause: error });
      }
    },
  });
}
