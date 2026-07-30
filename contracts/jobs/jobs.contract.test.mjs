import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const directory = import.meta.dirname;
const load = async (path) => {
  const source = await readFile(resolve(directory, path), "utf8");
  return JSON.parse(source
    .replaceAll('"./job-envelope.v1.schema.json"', '"https://contracts.ai-crm.local/jobs/v1/job-envelope.schema.json"')
    .replaceAll('"../notifications/notification-intent.v1.schema.json"', '"https://ai-crm.local/contracts/notifications/v1/notification-intent.schema.json"'));
};
const schemas = await Promise.all([
  load("job-envelope.v1.schema.json"),
  load("walking-skeleton-source-command.v1.schema.json"),
  load("notification-intent-submit.v1.schema.json"),
  load("../notifications/notification-intent.v1.schema.json"),
]);
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of schemas) ajv.addSchema(schema);

const envelope = {
  jobId: "43000000-0000-4000-8000-000000000001",
  jobVersion: 1,
  idempotencyKey: "walking-skeleton:command:1",
  requestedAt: "2026-07-30T00:00:00.000Z",
  correlationId: "43000000-0000-4000-8000-000000000002",
  policy: { maxAttempts: 3, backoffSeconds: [30, 300], timeoutMs: 10000, failureDisposition: "isolate" },
};

test("contracts a test-only source command with current-state and actor-context references", () => {
  const validate = ajv.getSchema("https://contracts.ai-crm.local/jobs/v1/walking-skeleton-source-command.schema.json");
  assert(validate);
  const valid = {
    ...envelope,
    jobType: "tests.walking-skeleton.source-command",
    source: "urn:ai-crm:tests.walking-skeleton",
    payload: {
      commandId: "43000000-0000-4000-8000-000000000003",
      action: "complete",
      sourceType: "tests.walking-skeleton",
      sourceTaskId: "task.synthetic",
      expectedSourceVersion: 2,
      actorContextReference: "context.synthetic",
      workflowTaskId: "workflow-task.synthetic",
      workflowCompletionEventId: "43000000-0000-4000-8000-000000000004",
      formSubmissionReference: "submission.synthetic",
      fileReferences: ["file.synthetic"],
    },
  };
  assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...valid, payload: { ...valid.payload, actor: { principalId: "untrusted" } } }), false);
  assert.equal(validate({ ...valid, payload: { ...valid.payload, expectedSourceVersion: 0 } }), false);
  assert.equal(validate({ ...valid, jobType: "crm.generic.command" }), false);
});

test("contracts Notification Intent submission without trusting an actor from the message", () => {
  const validate = ajv.getSchema("https://contracts.ai-crm.local/jobs/v1/notification-intent-submit.schema.json");
  assert(validate);
  const valid = {
    ...envelope,
    jobType: "platform.notifications.intent-submit",
    source: "urn:ai-crm:tests.walking-skeleton",
    idempotencyKey: "notification-intent:synthetic:1",
    payload: {
      actorContextReference: "context.synthetic",
      intent: {
        intentId: "43000000-0000-4000-8000-000000000005",
        producer: "tests.walking-skeleton",
        idempotencyKey: "notification-intent:synthetic:1",
        templateKey: "platform.synthetic.notice",
        templateVersion: 1,
        selectors: [{ selectorType: "assignment", referenceId: "assignment.synthetic" }],
        variables: { subject: "synthetic" },
        sourceType: "tests.walking-skeleton",
        sourceId: "task.synthetic",
        deepLink: { applicationId: "platform.synthetic", routeId: "platform.synthetic.detail", resourceType: "synthetic-task", resourceId: "task.synthetic" },
      },
    },
  };
  assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...valid, payload: { ...valid.payload, actor: { principalId: "untrusted" } } }), false);
  assert.equal(validate({ ...valid, policy: { ...valid.policy, maxAttempts: 4, backoffSeconds: [30, 300, 900] } }), false);
});
