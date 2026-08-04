import { NotificationError } from "./errors.js";
import type {
  InAppNotification,
  NotificationPage,
  NotificationStore,
  NotificationTemplateDefinition,
  NotificationTemplateDraft,
  StoredIntent,
  TemplateRelease,
} from "./types.js";

const clone = <T>(value: T): T => structuredClone(value);
const intentKey = (producer: string, key: string): string => `${producer}\u0000${key}`;
const releaseKey = (templateKey: string, version: number): string => `${templateKey}\u0000${String(version)}`;

export class InMemoryNotificationStore implements NotificationStore {
  private readonly definitions = new Map<string, NotificationTemplateDefinition>();
  private readonly drafts = new Map<string, NotificationTemplateDraft>();
  private readonly draftOperations = new Map<string, NotificationTemplateDraft>();
  private readonly templates = new Map<string, TemplateRelease>();
  private readonly activeVersions = new Map<string, number>();
  private readonly activationIds = new Map<string, { readonly templateKey: string; readonly version: number }>();
  private readonly intents = new Map<string, StoredIntent>();
  private readonly notifications = new Map<string, InAppNotification>();

  public registerTemplateDefinition(definition: NotificationTemplateDefinition): Promise<"created" | "duplicate"> {
    const existing = this.definitions.get(definition.templateKey);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(definition)) throw new NotificationError("NOTIFICATION_CONFLICT");
      return Promise.resolve("duplicate");
    }
    this.definitions.set(definition.templateKey, clone(definition));
    return Promise.resolve("created");
  }

  public getTemplateDefinition(templateKey: string): Promise<NotificationTemplateDefinition | undefined> {
    return Promise.resolve(clone(this.definitions.get(templateKey)));
  }

  public listTemplateDefinitions(): Promise<readonly NotificationTemplateDefinition[]> {
    return Promise.resolve([...this.definitions.values()].sort((a, b) => a.templateKey.localeCompare(b.templateKey)).map(clone));
  }

  public saveTemplateDraft(input: { readonly draft: Omit<NotificationTemplateDraft, "revision">; readonly expectedRevision: number; readonly operationId: string }): Promise<NotificationTemplateDraft> {
    return Promise.resolve().then(() => {
      const receipt = this.draftOperations.get(input.operationId);
      if (receipt) {
        if (receipt.templateKey !== input.draft.templateKey || receipt.revision !== input.expectedRevision + 1 || receipt.titleTemplate !== input.draft.titleTemplate || receipt.summaryTemplate !== input.draft.summaryTemplate || receipt.bodyTemplate !== input.draft.bodyTemplate || receipt.updatedAt !== input.draft.updatedAt) throw new NotificationError("NOTIFICATION_CONFLICT");
        return clone(receipt);
      }
      const existing = this.drafts.get(input.draft.templateKey);
      if ((existing?.revision ?? 0) !== input.expectedRevision) throw new NotificationError("NOTIFICATION_CONFLICT");
      const next = { ...clone(input.draft), revision: input.expectedRevision + 1 };
      this.drafts.set(input.draft.templateKey, next);
      this.draftOperations.set(input.operationId, next);
      return clone(next);
    });
  }

  public getTemplateDraft(templateKey: string): Promise<NotificationTemplateDraft | undefined> {
    return Promise.resolve(clone(this.drafts.get(templateKey)));
  }

  public publishTemplate(release: TemplateRelease): Promise<"published" | "duplicate"> {
    const key = releaseKey(release.templateKey, release.version);
    const existing = this.templates.get(key);
    if (existing) {
      if (existing.contentDigest !== release.contentDigest) throw new NotificationError("NOTIFICATION_CONFLICT");
      return Promise.resolve("duplicate");
    }
    this.templates.set(key, clone(release));
    return Promise.resolve("published");
  }

  public async publishAndActivateTemplate(input: { readonly activatedAt: string; readonly activationId: string; readonly release: TemplateRelease }): Promise<"published" | "duplicate"> {
    const existingRelease = this.templates.get(releaseKey(input.release.templateKey, input.release.version));
    const existingActivation = this.activationIds.get(input.activationId);
    if (existingRelease && existingRelease.contentDigest !== input.release.contentDigest) throw new NotificationError("NOTIFICATION_CONFLICT");
    if (existingActivation && (existingActivation.templateKey !== input.release.templateKey || existingActivation.version !== input.release.version)) throw new NotificationError("NOTIFICATION_CONFLICT");
    const status = await this.publishTemplate(input.release);
    await this.activateTemplate({ activatedAt: input.activatedAt, activationId: input.activationId, templateKey: input.release.templateKey, version: input.release.version });
    return status;
  }

  public getTemplate(key: string, version: number): Promise<TemplateRelease | undefined> {
    return Promise.resolve(clone(this.templates.get(releaseKey(key, version))));
  }

  public listTemplateReleases(templateKey: string): Promise<readonly TemplateRelease[]> {
    return Promise.resolve([...this.templates.values()].filter((item) => item.templateKey === templateKey).sort((a, b) => b.version - a.version).map(clone));
  }

  public activateTemplate(input: { readonly activatedAt: string; readonly activationId: string; readonly templateKey: string; readonly version: number }): Promise<void> {
    if (!this.templates.has(releaseKey(input.templateKey, input.version))) throw new NotificationError("NOTIFICATION_TEMPLATE_NOT_FOUND");
    const existing = this.activationIds.get(input.activationId);
    if (existing && (existing.templateKey !== input.templateKey || existing.version !== input.version)) throw new NotificationError("NOTIFICATION_CONFLICT");
    if (!existing) this.activationIds.set(input.activationId, { templateKey: input.templateKey, version: input.version });
    this.activeVersions.set(input.templateKey, input.version);
    return Promise.resolve();
  }

  public getActiveTemplate(templateKey: string): Promise<TemplateRelease | undefined> {
    const version = this.activeVersions.get(templateKey);
    return version === undefined ? Promise.resolve(undefined) : this.getTemplate(templateKey, version);
  }

  public findIntent(producer: string, key: string): Promise<StoredIntent | undefined> {
    return Promise.resolve(clone(this.intents.get(intentKey(producer, key))));
  }

  public acceptIntent(input: { readonly intent: StoredIntent; readonly notifications: readonly InAppNotification[] }): Promise<{ status: "created" | "duplicate"; result: StoredIntent["result"] }> {
    const key = intentKey(input.intent.producer, input.intent.idempotencyKey);
    const existing = this.intents.get(key);
    if (existing) {
      if (existing.fingerprint !== input.intent.fingerprint) throw new NotificationError("NOTIFICATION_CONFLICT");
      return Promise.resolve({ status: "duplicate", result: clone(existing.result) });
    }
    const snapshot = clone(this.notifications);
    try {
      for (const item of input.notifications) {
        if (this.notifications.has(item.notificationId)) throw new NotificationError("NOTIFICATION_CONFLICT");
        this.notifications.set(item.notificationId, clone(item));
      }
      this.intents.set(key, clone(input.intent));
      return Promise.resolve({ status: "created", result: clone(input.intent.result) });
    } catch (error) {
      this.notifications.clear();
      snapshot.forEach((value, id) => this.notifications.set(id, value));
      throw error;
    }
  }

  public get(principalId: string, notificationId: string): Promise<InAppNotification | undefined> {
    const item = this.notifications.get(notificationId);
    return Promise.resolve(item?.principalId === principalId && item.preferenceDecision === "deliver" ? clone(item) : undefined);
  }

  public list(input: { readonly principalId: string; readonly limit: number; readonly cursor?: string; readonly includeArchived: boolean }): Promise<NotificationPage> {
    const rows = [...this.notifications.values()]
      .filter((item) => item.principalId === input.principalId && item.preferenceDecision === "deliver" && (input.includeArchived || item.archivedAt === undefined))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.notificationId.localeCompare(a.notificationId))
      .filter((item) => input.cursor === undefined || `${item.createdAt}\u0000${item.notificationId}` < input.cursor);
    const items = rows.slice(0, input.limit).map(clone);
    const last = items.at(-1);
    return Promise.resolve({ items, ...(rows.length > input.limit && last ? { nextCursor: `${last.createdAt}\u0000${last.notificationId}` } : {}) });
  }

  public unreadCount(principalId: string): Promise<number> {
    return Promise.resolve([...this.notifications.values()].filter((item) => item.principalId === principalId && item.preferenceDecision === "deliver" && item.readAt === undefined && item.archivedAt === undefined).length);
  }

  public markRead(principalId: string, id: string, at: string): Promise<InAppNotification | undefined> {
    const item = this.notifications.get(id);
    if (!item || item.principalId !== principalId || item.preferenceDecision !== "deliver") return Promise.resolve(undefined);
    const next = item.readAt === undefined ? { ...item, readAt: at, stateVersion: item.stateVersion + 1 } : item;
    this.notifications.set(id, next);
    return Promise.resolve(clone(next));
  }

  public archive(principalId: string, id: string, at: string): Promise<InAppNotification | undefined> {
    const item = this.notifications.get(id);
    if (!item || item.principalId !== principalId || item.preferenceDecision !== "deliver") return Promise.resolve(undefined);
    const next = item.archivedAt === undefined ? { ...item, archivedAt: at, stateVersion: item.stateVersion + 1 } : item;
    this.notifications.set(id, next);
    return Promise.resolve(clone(next));
  }
}
