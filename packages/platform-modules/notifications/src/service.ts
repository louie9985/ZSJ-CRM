/* eslint-disable @typescript-eslint/no-unnecessary-condition -- runtime ports and versioned external contracts are validated here. */
import { createHash } from "node:crypto";

import { NotificationError } from "./errors.js";
import {
  digestTemplate,
  renderTemplate,
  validatePlainTemplate,
  validateRestrictedMarkdown,
  validateTemplateRelease,
  validateTemplateSource,
  variableNames,
  variableSchema,
} from "./template.js";
import { actor, cursor, deepLink, id, jsonRecord, recipient, selector, sha256, timestamp, uuid } from "./validation.js";
import type {
  ArchiveNotificationCommand,
  InAppNotification,
  JsonValue,
  NotificationActor,
  NotificationAudit,
  NotificationAuthorization,
  NotificationCenter,
  NotificationIntent,
  NotificationIntentV2,
  NotificationObserver,
  NotificationOperation,
  NotificationPreference,
  NotificationRecipientResolver,
  NotificationStore,
  NotificationTemplateDefinition,
  NotificationVariableResolver,
  PublishTemplateCommand,
  ResolvedRecipient,
  TemplateRelease,
  TemplateVariableDefinition,
} from "./types.js";

const notificationUuid = (intentId: string, principalId: string, recipientReference: string): string => {
  const hex = createHash("sha256").update(`${intentId}\u0000${principalId}\u0000${recipientReference}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
};

const mapped = (error: unknown, fallback: "NOTIFICATION_RECIPIENT_RESOLUTION_FAILED" | "NOTIFICATION_STORAGE_UNAVAILABLE"): NotificationError =>
  error instanceof NotificationError ? error : new NotificationError(fallback, { cause: error, retryable: true });

const deduplicateRecipients = (resolved: readonly ResolvedRecipient[]): readonly ResolvedRecipient[] => {
  const targets = new Map<string, ResolvedRecipient>();
  for (const item of resolved) {
    const key = `${item.principalId}\u0000${item.recipientReference}`;
    const existing = targets.get(key);
    if (existing && (existing.resolutionReference !== item.resolutionReference || existing.resolutionVersion !== item.resolutionVersion || existing.workforcePersonId !== item.workforcePersonId)) {
      throw new NotificationError("NOTIFICATION_RECIPIENT_RESOLUTION_FAILED");
    }
    targets.set(key, item);
  }
  return [...targets.values()];
};

const shanghaiTime = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const required = (key: string): string => {
    const part = value[key];
    if (part === undefined) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
    return part;
  };
  return `${required("year")}-${required("month")}-${required("day")} ${required("hour")}:${required("minute")}:${required("second")}`;
};

const validateVariable = (value: TemplateVariableDefinition): TemplateVariableDefinition => ({
  key: id(value.key),
  label: validatePlainTemplate(value.label, 100),
  description: validatePlainTemplate(value.description, 500),
  example: value.example,
  ownerModule: id(value.ownerModule),
  privacy: value.privacy === "internal" || value.privacy === "personal" ? value.privacy : (() => { throw new NotificationError("NOTIFICATION_INPUT_INVALID"); })(),
  source: ["domain", "notification.owner", "notification.sender", "notification.time"].includes(value.source) ? value.source : (() => { throw new NotificationError("NOTIFICATION_INPUT_INVALID"); })(),
  type: ["boolean", "date-time", "integer", "number", "string"].includes(value.type) ? value.type : (() => { throw new NotificationError("NOTIFICATION_INPUT_INVALID"); })(),
  ...(value.maximumLength === undefined ? {} : { maximumLength: value.maximumLength }),
});

const validateDefinition = (input: NotificationTemplateDefinition): NotificationTemplateDefinition => {
  if (!Number.isSafeInteger(input.definitionVersion) || input.definitionVersion < 1 || !Number.isSafeInteger(input.variableCatalogVersion) || input.variableCatalogVersion < 1 || typeof input.enabled !== "boolean") {
    throw new NotificationError("NOTIFICATION_INPUT_INVALID");
  }
  const allowedVariables = input.allowedVariables.map(validateVariable);
  if (new Set(allowedVariables.map((item) => item.key)).size !== allowedVariables.length) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
  return {
    templateKey: id(input.templateKey),
    ownerModule: id(input.ownerModule),
    notificationType: id(input.notificationType),
    definitionVersion: input.definitionVersion,
    variableCatalogVersion: input.variableCatalogVersion,
    systemSenderName: validatePlainTemplate(input.systemSenderName, 100),
    enabled: input.enabled,
    allowedVariables,
  };
};

const isV2 = (intent: NotificationIntent | NotificationIntentV2): intent is NotificationIntentV2 => "version" in intent && intent.version === 2;

export const createNotificationCenter = (ports: {
  readonly store: NotificationStore;
  readonly authorization: NotificationAuthorization;
  readonly audit: NotificationAudit;
  readonly resolver: NotificationRecipientResolver;
  readonly variableResolver?: NotificationVariableResolver;
  readonly preference: NotificationPreference;
  readonly observer?: NotificationObserver;
  readonly now?: () => Date;
}): NotificationCenter => {
  const clock = ports.now ?? (() => new Date());
  const recordObservation = (input: Parameters<NotificationObserver["record"]>[0]): void => { try { ports.observer?.record(input); } catch { /* Telemetry is non-authoritative. */ } };
  const observe = async <T>(operation: NotificationOperation, work: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    try {
      const result = await work();
      recordObservation({ operation, outcome: "completed", durationMs: Math.max(0, Date.now() - started) });
      return result;
    } catch (error) {
      recordObservation({ operation, outcome: error instanceof NotificationError && error.code === "NOTIFICATION_OPERATION_DENIED" ? "denied" : "failed", durationMs: Math.max(0, Date.now() - started) });
      throw error;
    }
  };
  const audit = async (input: Parameters<NotificationAudit["record"]>[0]): Promise<void> => {
    try { await ports.audit.record(input); } catch (error) { throw new NotificationError("NOTIFICATION_AUDIT_FAILED", { cause: error, retryable: true }); }
  };
  const authorize = async (actorInput: NotificationActor, operation: NotificationOperation, referenceId: string, extra?: { notificationId?: string; ownerReference?: string; producerReference?: string }): Promise<{ actor: NotificationActor; decisionId: string }> => {
    const validActor = actor(actorInput);
    let decision;
    try { decision = await ports.authorization.authorize({ actor: validActor, operation, ...extra }); } catch (error) { throw new NotificationError("NOTIFICATION_AUTHORIZATION_FAILED", { cause: error, retryable: true }); }
    const decisionId = id(decision.decisionId);
    if (!Object.is(decision.allowed, true)) {
      await audit({ actor: validActor, operation, phase: "failed", decisionId, referenceId, errorCode: "NOTIFICATION_OPERATION_DENIED" });
      throw new NotificationError("NOTIFICATION_OPERATION_DENIED");
    }
    await audit({ actor: validActor, operation, phase: "attempted", decisionId, referenceId });
    return { actor: validActor, decisionId };
  };
  const finish = (context: { actor: NotificationActor; decisionId: string }, operation: NotificationOperation, referenceId: string, error?: NotificationError): Promise<void> =>
    audit({ actor: context.actor, operation, phase: error === undefined ? "succeeded" : "failed", decisionId: context.decisionId, referenceId, ...(error ? { errorCode: error.code } : {}) });
  const read = async (actorInput: NotificationActor, notificationIdInput: string, operation: NotificationOperation): Promise<{ item: InAppNotification; context: { actor: NotificationActor; decisionId: string } }> => {
    const notificationId = uuid(notificationIdInput);
    const context = await authorize(actorInput, operation, notificationId, { notificationId });
    try {
      const item = await ports.store.get(context.actor.principalId, notificationId);
      if (!item) throw new NotificationError("NOTIFICATION_NOT_FOUND");
      return { item, context };
    } catch (error) {
      const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
      await finish(context, operation, notificationId, failure);
      throw failure;
    }
  };
  const templateContext = async (actorInput: NotificationActor, operation: NotificationOperation, templateKeyInput: string) => {
    const templateKey = id(templateKeyInput);
    const definition = await ports.store.getTemplateDefinition(templateKey);
    if (!definition) throw new NotificationError("NOTIFICATION_TEMPLATE_NOT_FOUND");
    const context = await authorize(actorInput, operation, templateKey, { ownerReference: definition.ownerModule });
    return { context, definition, templateKey };
  };

  return {
    registerTemplateDefinition: (actorInput, input) => observe("notification_template_manage", async () => {
      const definition = validateDefinition(input);
      const context = await authorize(actorInput, "notification_template_manage", definition.templateKey, { ownerReference: definition.ownerModule });
      try {
        await ports.store.registerTemplateDefinition(definition);
        await finish(context, "notification_template_manage", definition.templateKey);
        return definition;
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_template_manage", definition.templateKey, failure);
        throw failure;
      }
    }),
    listTemplateDefinitions: (actorInput) => observe("notification_template_read", async () => {
      const context = await authorize(actorInput, "notification_template_read", "notification-templates");
      try {
        const definitions = await ports.store.listTemplateDefinitions();
        const summaries = await Promise.all(definitions.map(async (definition) => {
          const draft = await ports.store.getTemplateDraft(definition.templateKey);
          const active = await ports.store.getActiveTemplate(definition.templateKey);
          return { definition, ...(draft ? { draft } : {}), releases: await ports.store.listTemplateReleases(definition.templateKey), ...(active ? { currentVersion: active.version } : {}) };
        }));
        await finish(context, "notification_template_read", "notification-templates");
        return summaries;
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_template_read", "notification-templates", failure);
        throw failure;
      }
    }),
    getTemplateAdministration: (actorInput, templateKeyInput) => observe("notification_template_read", async () => {
      const { context, definition, templateKey } = await templateContext(actorInput, "notification_template_read", templateKeyInput);
      try {
        const active = await ports.store.getActiveTemplate(templateKey);
        const draft = await ports.store.getTemplateDraft(templateKey);
        const result = { definition, releases: await ports.store.listTemplateReleases(templateKey), ...(draft ? { draft } : {}), ...(active ? { currentVersion: active.version } : {}) };
        await finish(context, "notification_template_read", templateKey);
        return result;
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_template_read", templateKey, failure);
        throw failure;
      }
    }),
    saveTemplateDraft: (command) => observe("notification_template_manage", async () => {
      const { context, definition, templateKey } = await templateContext(command.actor, "notification_template_manage", command.templateKey);
      try {
        if (!definition.enabled || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
        const titleTemplate = validatePlainTemplate(command.titleTemplate, 512);
        const summaryTemplate = validatePlainTemplate(command.summaryTemplate, 2_000);
        const bodyTemplate = validateRestrictedMarkdown(command.bodyTemplate);
        variableSchema(definition, [...variableNames(titleTemplate), ...variableNames(summaryTemplate), ...variableNames(bodyTemplate)]);
        const draft = await ports.store.saveTemplateDraft({ expectedRevision: command.expectedRevision, operationId: uuid(command.operationId), draft: { templateKey, titleTemplate, summaryTemplate, bodyTemplate, updatedAt: timestamp(command.updatedAt) } });
        await finish(context, "notification_template_manage", templateKey);
        return draft;
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_template_manage", templateKey, failure);
        throw failure;
      }
    }),
    previewTemplate: (command) => observe("notification_template_manage", async () => {
      const { context, definition, templateKey } = await templateContext(command.actor, "notification_template_manage", command.templateKey);
      try {
        const titleTemplate = validatePlainTemplate(command.titleTemplate, 512);
        const summaryTemplate = validatePlainTemplate(command.summaryTemplate, 2_000);
        const bodyTemplate = validateRestrictedMarkdown(command.bodyTemplate);
        const names = [...variableNames(titleTemplate), ...variableNames(summaryTemplate), ...variableNames(bodyTemplate)];
        const schema = variableSchema(definition, names);
        const examples = Object.fromEntries(definition.allowedVariables.map((item) => [item.key, item.example]));
        const variables = { ...examples, ...(command.exampleVariables ?? {}) } as Readonly<Record<string, JsonValue>>;
        const base = { templateKey, version: 1, ownerReference: definition.ownerModule, notificationType: definition.notificationType, variableSchema: schema, variableCatalogVersion: definition.variableCatalogVersion, titleTemplate, summaryTemplate, bodyTemplate, bodyFormat: "restricted-markdown" as const, publishedAt: clock().toISOString() };
        const release = { ...base, contentDigest: digestTemplate(base) };
        const rendered = renderTemplate(release, Object.fromEntries(Object.entries(variables).filter(([key]) => names.includes(key))));
        await finish(context, "notification_template_manage", templateKey);
        return rendered;
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_template_manage", templateKey, failure);
        throw failure;
      }
    }),
    publishTemplateDraft: (command) => observe("notification_template_publish", async () => {
      const { context, definition, templateKey } = await templateContext(command.actor, "notification_template_publish", command.templateKey);
      try {
        const draft = await ports.store.getTemplateDraft(templateKey);
        if (!draft || !definition.enabled) throw new NotificationError("NOTIFICATION_TEMPLATE_NOT_FOUND");
        const releases = await ports.store.listTemplateReleases(templateKey);
        const version = Math.max(0, ...releases.map((item) => item.version)) + 1;
        const schema = variableSchema(definition, [...variableNames(draft.titleTemplate), ...variableNames(draft.summaryTemplate), ...variableNames(draft.bodyTemplate)]);
        const base = { templateKey, version, ownerReference: definition.ownerModule, notificationType: definition.notificationType, variableSchema: schema, variableCatalogVersion: definition.variableCatalogVersion, titleTemplate: draft.titleTemplate, summaryTemplate: draft.summaryTemplate, bodyTemplate: draft.bodyTemplate, bodyFormat: "restricted-markdown" as const, publishedAt: timestamp(command.publishedAt) };
        const release = { ...base, contentDigest: digestTemplate(base) };
        validateTemplateRelease(release);
        await ports.store.publishAndActivateTemplate({ activationId: uuid(command.activationId), activatedAt: release.publishedAt, release });
        await finish(context, "notification_template_publish", `${templateKey}:${String(version)}`);
        return release;
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_template_publish", templateKey, failure);
        throw failure;
      }
    }),
    activateTemplate: (command) => observe("notification_template_activate", async () => {
      const { context, templateKey } = await templateContext(command.actor, "notification_template_activate", command.templateKey);
      try {
        if (!Number.isSafeInteger(command.version) || command.version < 1) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
        await ports.store.activateTemplate({ activationId: uuid(command.activationId), activatedAt: timestamp(command.activatedAt), templateKey, version: command.version });
        await finish(context, "notification_template_activate", `${templateKey}:${String(command.version)}`);
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_template_activate", templateKey, failure);
        throw failure;
      }
    }),
    publishTemplate: (command: PublishTemplateCommand) => observe("notification_template_publish", async () => {
      const validActor = actor(command.actor);
      const templateKey = id(command.templateKey);
      const ownerReference = id(command.ownerReference);
      const context = await authorize(validActor, "notification_template_publish", `${templateKey}:${String(command.version)}`, { ownerReference });
      try {
        if (!Number.isSafeInteger(command.version) || command.version < 1) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
        const base = { templateKey, version: command.version, ownerReference, notificationType: id(command.notificationType), variableSchema: structuredClone(command.variableSchema), ...(command.variableCatalogVersion === undefined ? {} : { variableCatalogVersion: command.variableCatalogVersion }), titleTemplate: validatePlainTemplate(command.titleTemplate, 512), ...(command.summaryTemplate === undefined ? {} : { summaryTemplate: validatePlainTemplate(command.summaryTemplate, 2_000) }), bodyTemplate: command.bodyFormat === "restricted-markdown" ? validateRestrictedMarkdown(command.bodyTemplate) : validateTemplateSource(command.bodyTemplate), ...(command.bodyFormat === undefined ? {} : { bodyFormat: command.bodyFormat }), publishedAt: timestamp(command.publishedAt) };
        const release: TemplateRelease = { ...base, contentDigest: digestTemplate(base) };
        validateTemplateRelease(release);
        await ports.store.publishTemplate(release);
        await finish(context, "notification_template_publish", `${templateKey}:${String(command.version)}`);
        return release;
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_template_publish", `${templateKey}:${String(command.version)}`, failure);
        throw failure;
      }
    }),
    submitIntent: (actorInput, input) => observe("notification_intent_submit", async () => {
      const intentId = uuid(input.intentId);
      const producer = id(input.producer);
      const idempotencyKey = id(input.idempotencyKey);
      const context = await authorize(actorInput, "notification_intent_submit", intentId, { producerReference: producer });
      try {
        if (input.selectors.length < 1 || input.selectors.length > 100) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
        const variables = jsonRecord(input.variables);
        const normalized = { intentId, producer, idempotencyKey, templateKey: id(input.templateKey), selectors: input.selectors.map(selector), variables, sourceType: id(input.sourceType), sourceId: id(input.sourceId), deepLink: deepLink(input.deepLink), ...(isV2(input) ? { version: 2 as const, sender: input.sender.kind === "system" ? { kind: "system" as const } : { kind: "workforce_person" as const, workforcePersonId: id(input.sender.workforcePersonId) } } : { templateVersion: input.templateVersion }) };
        if (!isV2(input) && (!Number.isSafeInteger(input.templateVersion) || input.templateVersion < 1)) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
        const requestFingerprint = sha256(normalized);
        const existing = await ports.store.findIntent(producer, idempotencyKey);
        if (existing) {
          if (existing.fingerprint !== requestFingerprint) throw new NotificationError("NOTIFICATION_CONFLICT");
          await finish(context, "notification_intent_submit", intentId);
          return existing.result;
        }
        const release = isV2(input) ? await ports.store.getActiveTemplate(normalized.templateKey) : await ports.store.getTemplate(normalized.templateKey, input.templateVersion);
        if (!release) throw new NotificationError("NOTIFICATION_TEMPLATE_NOT_FOUND");
        let resolved: readonly ResolvedRecipient[];
        try { resolved = (await ports.resolver.resolve(normalized.selectors)).map(recipient); } catch (error) { throw mapped(error, "NOTIFICATION_RECIPIENT_RESOLUTION_FAILED"); }
        const recipients = deduplicateRecipients(resolved);
        if (recipients.length < 1 || recipients.length > 100) throw new NotificationError("NOTIFICATION_RECIPIENT_RESOLUTION_FAILED");
        const created = clock();
        const createdAt = timestamp(created.toISOString());
        let senderName: string | undefined;
        if (isV2(input)) {
          const definition = await ports.store.getTemplateDefinition(normalized.templateKey);
          if (!definition || !ports.variableResolver) throw new NotificationError("NOTIFICATION_RECIPIENT_RESOLUTION_FAILED");
          senderName = input.sender.kind === "system" ? definition.systemSenderName : (await ports.variableResolver.displayName(input.sender.workforcePersonId)).displayName;
        }
        const notifications: InAppNotification[] = [];
        for (const target of recipients) {
          let renderVariables = variables;
          if (isV2(input)) {
            if (!target.workforcePersonId || !ports.variableResolver || senderName === undefined) throw new NotificationError("NOTIFICATION_RECIPIENT_RESOLUTION_FAILED");
            const owner = await ports.variableResolver.displayName(target.workforcePersonId);
            renderVariables = { ...variables, owner: owner.displayName, sender: senderName, time: shanghaiTime(created) };
          }
          const rendered = renderTemplate(release, renderVariables);
          const decision = await ports.preference.evaluate({ notificationType: release.notificationType, recipient: target });
          if (decision.decision !== "deliver" && decision.decision !== "suppress") throw new NotificationError("NOTIFICATION_INPUT_INVALID");
          notifications.push({ notificationId: notificationUuid(intentId, target.principalId, target.recipientReference), intentId, principalId: target.principalId, recipientReference: target.recipientReference, resolutionReference: target.resolutionReference, resolutionVersion: target.resolutionVersion, templateKey: release.templateKey, templateVersion: release.version, notificationType: release.notificationType, title: rendered.title, summary: rendered.summary, body: rendered.body, bodyFormat: release.bodyFormat ?? "plain-text", contentDigest: release.contentDigest, stateVersion: 1, sourceType: normalized.sourceType, sourceId: normalized.sourceId, deepLink: normalized.deepLink, preferenceDecision: decision.decision, preferenceReason: id(decision.reason), preferenceVersion: id(decision.version), createdAt });
        }
        const result = { intentId, notificationIds: notifications.map((item) => item.notificationId), status: "accepted" as const };
        const accepted = await ports.store.acceptIntent({ intent: { intentId, producer, idempotencyKey, fingerprint: requestFingerprint, result, createdAt }, notifications });
        await finish(context, "notification_intent_submit", intentId);
        return accepted.result;
      } catch (error) {
        const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE");
        await finish(context, "notification_intent_submit", intentId, failure);
        throw failure;
      }
    }),
    get: (actorInput, notificationId) => observe("notification_detail", async () => { const result = await read(actorInput, notificationId, "notification_detail"); await finish(result.context, "notification_detail", result.item.notificationId); return result.item; }),
    list: (query) => observe("notification_list", async () => {
      const context = await authorize(query.actor, "notification_list", query.actor.principalId);
      try {
        const limit = query.limit ?? 50;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
        const page = await ports.store.list({ principalId: context.actor.principalId, limit, includeArchived: query.includeArchived ?? false, ...(query.cursor === undefined ? {} : { cursor: cursor(query.cursor) }) });
        await finish(context, "notification_list", context.actor.principalId);
        return page;
      } catch (error) { const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE"); await finish(context, "notification_list", context.actor.principalId, failure); throw failure; }
    }),
    unreadCount: (actorInput) => observe("notification_unread_count", async () => {
      const context = await authorize(actorInput, "notification_unread_count", actorInput.principalId);
      try { const count = await ports.store.unreadCount(context.actor.principalId); await finish(context, "notification_unread_count", context.actor.principalId); return count; } catch (error) { const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE"); await finish(context, "notification_unread_count", context.actor.principalId, failure); throw failure; }
    }),
    markRead: (command: ArchiveNotificationCommand) => observe("notification_mark_read", async () => {
      const found = await read(command.actor, command.notificationId, "notification_mark_read");
      try { const item = await ports.store.markRead(found.context.actor.principalId, found.item.notificationId, timestamp(clock().toISOString())); if (!item) throw new NotificationError("NOTIFICATION_NOT_FOUND"); await finish(found.context, "notification_mark_read", found.item.notificationId); return item; } catch (error) { const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE"); await finish(found.context, "notification_mark_read", found.item.notificationId, failure); throw failure; }
    }),
    archive: (command: ArchiveNotificationCommand) => observe("notification_archive", async () => {
      const found = await read(command.actor, command.notificationId, "notification_archive");
      try { const item = await ports.store.archive(found.context.actor.principalId, found.item.notificationId, timestamp(clock().toISOString())); if (!item) throw new NotificationError("NOTIFICATION_NOT_FOUND"); await finish(found.context, "notification_archive", found.item.notificationId); return item; } catch (error) { const failure = mapped(error, "NOTIFICATION_STORAGE_UNAVAILABLE"); await finish(found.context, "notification_archive", found.item.notificationId, failure); throw failure; }
    }),
  };
};
