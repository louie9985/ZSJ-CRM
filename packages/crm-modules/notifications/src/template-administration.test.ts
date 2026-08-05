import { describe, expect, it } from "vitest";

import { InMemoryNotificationStore } from "./memory-store.js";
import { NotificationError } from "./errors.js";

const definition = {
  allowedVariables: [], definitionVersion: 1, enabled: true, notificationType: "crm.synthetic",
  ownerModule: "crm.synthetic", systemSenderName: "System", templateKey: "crm.synthetic.notice", variableCatalogVersion: 1,
} as const;

describe("notification template administration persistence", () => {
  it("returns the original draft receipt for an idempotent retry after later revisions", async () => {
    const store = new InMemoryNotificationStore();
    await store.registerTemplateDefinition(definition);
    const firstInput = { operationId: "00000000-0000-4000-8000-000000000201", expectedRevision: 0, draft: { templateKey: definition.templateKey, titleTemplate: "First", summaryTemplate: "Summary", bodyTemplate: "Body", updatedAt: "2026-08-03T00:00:00.000Z" } };
    const first = await store.saveTemplateDraft(firstInput);
    await store.saveTemplateDraft({ operationId: "00000000-0000-4000-8000-000000000202", expectedRevision: 1, draft: { ...firstInput.draft, titleTemplate: "Second", updatedAt: "2026-08-03T00:01:00.000Z" } });
    await expect(store.saveTemplateDraft(firstInput)).resolves.toEqual(first);
    await expect(store.saveTemplateDraft({ ...firstInput, draft: { ...firstInput.draft, titleTemplate: "Changed" } })).rejects.toBeInstanceOf(NotificationError);
  });

  it("publishes and activates one immutable release operation", async () => {
    const store = new InMemoryNotificationStore();
    const release = { templateKey: definition.templateKey, version: 1, ownerReference: definition.ownerModule, notificationType: definition.notificationType, variableSchema: { type: "object", additionalProperties: false, required: [], properties: {} }, titleTemplate: "Title", summaryTemplate: "Summary", bodyTemplate: "Body", bodyFormat: "restricted-markdown" as const, contentDigest: "a".repeat(64), publishedAt: "2026-08-03T00:00:00.000Z" };
    await expect(store.publishAndActivateTemplate({ activationId: "00000000-0000-4000-8000-000000000203", activatedAt: release.publishedAt, release })).resolves.toBe("published");
    await expect(store.getActiveTemplate(definition.templateKey)).resolves.toEqual(release);
    await expect(store.publishAndActivateTemplate({ activationId: "00000000-0000-4000-8000-000000000203", activatedAt: release.publishedAt, release })).resolves.toBe("duplicate");
  });
});
