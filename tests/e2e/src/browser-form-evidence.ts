import { randomUUID } from "node:crypto";

import {
  createFormSchemaService,
  createMemoryFormSchemaStore,
  type FormSchemaQueryService,
} from "@ai-crm/platform-form-schema";

const definitionId = "platform.synthetic.task-completion";
const actor = Object.freeze({ actorId: "system.e2e-browser-form", actorType: "system" as const });

export async function createBrowserFormEvidenceFixture(): Promise<Readonly<{
  readonly definitionId: typeof definitionId;
  readonly releaseVersion: 1;
  readonly service: FormSchemaQueryService;
}>> {
  const command = createFormSchemaService(
    createMemoryFormSchemaStore(),
    { authorize: () => Promise.resolve(Object.freeze({ allowed: true, decisionId: randomUUID() })) },
    { record: () => Promise.resolve() },
    { clock: () => new Date("2026-08-02T00:00:00.000Z"), id: randomUUID },
  );
  const metadata = (operationId: string) => Object.freeze({
    actor,
    operationId,
    reason: "business-neutral browser form evidence",
    traceId: "76000000000000000000000000000001",
  });
  await command.saveDraft({
    ...metadata(randomUUID()),
    definitionId,
    expectedRevision: 0,
    ownerModule: "tests.walking-skeleton",
    jsonSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
      properties: {
        content_version_id: { maxLength: 36, minLength: 36, type: "string" },
        file_id: { maxLength: 36, minLength: 36, type: "string" },
        synthetic_value: { maxLength: 500, minLength: 1, type: "string" },
      },
      required: ["content_version_id", "file_id", "synthetic_value"],
      type: "object",
    },
    uiSchema: {
      fields: [
        { component: "input", field: "synthetic_value", order: 1 },
        { component: "input", field: "file_id", order: 2 },
        { component: "input", field: "content_version_id", order: 3 },
      ],
      layout: "vertical",
      version: 1,
    },
  });
  const published = await command.publish({ ...metadata(randomUUID()), definitionId, expectedRevision: 1 });
  if (published.reference.releaseVersion !== 1) throw new Error("e2e_browser_form_release_invalid");
  const service: FormSchemaQueryService = Object.freeze({
    getRelease: (input: Parameters<FormSchemaQueryService["getRelease"]>[0]) => command.getRelease({
      actor: input.context.actor,
      definitionId: input.definitionId,
      releaseVersion: input.releaseVersion,
    }),
    validateSubmission: (input: Parameters<FormSchemaQueryService["validateSubmission"]>[0]) => command.validateSubmission({
      actor: input.context.actor,
      data: input.data,
      definitionId: input.definitionId,
      releaseVersion: input.releaseVersion,
    }),
  });
  return Object.freeze({ definitionId, releaseVersion: 1, service });
}
