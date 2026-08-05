import type { DatabaseRuntime } from "@ai-crm/database";

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

export type NotificationPersistenceRuntime = Pick<DatabaseRuntime, "execute" | "withTransaction">;
export interface NotificationChangeRecorder { record(notification: InAppNotification): Promise<void> }

interface DefinitionRow { template_key: string; owner_module: string; notification_type: string; definition_version: number; allowed_variables: NotificationTemplateDefinition["allowedVariables"] | string; variable_catalog_version: number; system_sender_name: string; enabled: boolean }
interface DraftRow { template_key: string; revision: number; title_template: string; summary_template: string; body_template: string; updated_at: Date | string }
interface DraftOperationRow extends DraftRow { operation_id: string; expected_revision: number }
interface TemplateRow { template_key: string; version: number; owner_reference: string; notification_type: string; variable_schema: Record<string, unknown> | string; variable_catalog_version: number | null; title_template: string; summary_template: string | null; body_template: string; body_format: "plain-text" | "restricted-markdown"; content_digest: string; published_at: Date | string }
interface IntentRow { intent_id: string; producer: string; idempotency_key: string; fingerprint: string; result_json: StoredIntent["result"] | string; created_at: Date | string }
interface NotificationRow { notification_id: string; intent_id: string; principal_id: string; recipient_reference: string; resolution_reference: string; resolution_version: string; template_key: string; template_version: number; notification_type: string; title: string; summary: string | null; body: string; body_format: "plain-text" | "restricted-markdown"; content_digest: string | null; state_version: number; source_type: string; source_id: string; deep_link: InAppNotification["deepLink"] | string; preference_decision: InAppNotification["preferenceDecision"]; preference_reason: string; preference_version: string; created_at: Date | string; read_at: Date | string | null; archived_at: Date | string | null }

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const json = <T>(value: T | string): T => typeof value === "string" ? JSON.parse(value) as T : value;
const definition = (row: DefinitionRow): NotificationTemplateDefinition => ({ templateKey: row.template_key, ownerModule: row.owner_module, notificationType: row.notification_type, definitionVersion: row.definition_version, allowedVariables: json(row.allowed_variables), variableCatalogVersion: row.variable_catalog_version, systemSenderName: row.system_sender_name, enabled: row.enabled });
const draft = (row: DraftRow): NotificationTemplateDraft => ({ templateKey: row.template_key, revision: row.revision, titleTemplate: row.title_template, summaryTemplate: row.summary_template, bodyTemplate: row.body_template, updatedAt: iso(row.updated_at) });
const template = (row: TemplateRow): TemplateRelease => ({ templateKey: row.template_key, version: row.version, ownerReference: row.owner_reference, notificationType: row.notification_type, variableSchema: json(row.variable_schema), ...(row.variable_catalog_version === null ? {} : { variableCatalogVersion: row.variable_catalog_version }), titleTemplate: row.title_template, ...(row.summary_template === null ? {} : { summaryTemplate: row.summary_template }), bodyTemplate: row.body_template, bodyFormat: row.body_format, contentDigest: row.content_digest, publishedAt: iso(row.published_at) });
const notification = (row: NotificationRow): InAppNotification => ({ notificationId: row.notification_id, intentId: row.intent_id, principalId: row.principal_id, recipientReference: row.recipient_reference, resolutionReference: row.resolution_reference, resolutionVersion: row.resolution_version, templateKey: row.template_key, templateVersion: row.template_version, notificationType: row.notification_type, title: row.title, summary: row.summary ?? row.body, body: row.body, bodyFormat: row.body_format, ...(row.content_digest === null ? {} : { contentDigest: row.content_digest }), stateVersion: row.state_version, sourceType: row.source_type, sourceId: row.source_id, deepLink: json(row.deep_link), preferenceDecision: row.preference_decision, preferenceReason: row.preference_reason, preferenceVersion: row.preference_version, createdAt: iso(row.created_at), ...(row.read_at === null ? {} : { readAt: iso(row.read_at) }), ...(row.archived_at === null ? {} : { archivedAt: iso(row.archived_at) }) });
const stored = (row: IntentRow): StoredIntent => ({ intentId: row.intent_id, producer: row.producer, idempotencyKey: row.idempotency_key, fingerprint: row.fingerprint, result: json(row.result_json), createdAt: iso(row.created_at) });

class PrismaNotificationStore implements NotificationStore {
  public constructor(private readonly db: NotificationPersistenceRuntime, private readonly changes?: NotificationChangeRecorder) {}

  public async registerTemplateDefinition(value: NotificationTemplateDefinition): Promise<"created" | "duplicate"> {
    const result = await this.db.execute<DefinitionRow>(`insert into crm_notifications.template_definitions (template_key,owner_module,notification_type,definition_version,allowed_variables,variable_catalog_version,system_sender_name,enabled) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) on conflict (template_key) do nothing returning *`, [value.templateKey, value.ownerModule, value.notificationType, value.definitionVersion, JSON.stringify(value.allowedVariables), value.variableCatalogVersion, value.systemSenderName, value.enabled]);
    if (result.rows[0]) return "created";
    const existing = await this.getTemplateDefinition(value.templateKey);
    if (!existing) throw new NotificationError("NOTIFICATION_STORAGE_UNAVAILABLE", { retryable: true });
    if (JSON.stringify(existing) !== JSON.stringify(value)) throw new NotificationError("NOTIFICATION_CONFLICT");
    return "duplicate";
  }

  public async getTemplateDefinition(templateKey: string): Promise<NotificationTemplateDefinition | undefined> {
    const result = await this.db.execute<DefinitionRow>("select * from crm_notifications.template_definitions where template_key=$1", [templateKey]);
    return result.rows[0] ? definition(result.rows[0]) : undefined;
  }

  public async listTemplateDefinitions(): Promise<readonly NotificationTemplateDefinition[]> {
    const result = await this.db.execute<DefinitionRow>("select * from crm_notifications.template_definitions order by template_key");
    return result.rows.map(definition);
  }

  public saveTemplateDraft(input: { readonly draft: Omit<NotificationTemplateDraft, "revision">; readonly expectedRevision: number; readonly operationId: string }): Promise<NotificationTemplateDraft> {
    return this.db.withTransaction(async () => {
      await this.db.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", [`notification-draft:${input.operationId}`]);
      const receipt = await this.db.execute<DraftOperationRow>("select * from crm_notifications.template_draft_operations where operation_id=$1", [input.operationId]);
      const previous = receipt.rows[0];
      if (previous) {
        if (previous.template_key !== input.draft.templateKey || previous.expected_revision !== input.expectedRevision || previous.title_template !== input.draft.titleTemplate || previous.summary_template !== input.draft.summaryTemplate || previous.body_template !== input.draft.bodyTemplate) throw new NotificationError("NOTIFICATION_CONFLICT");
        return draft(previous);
      }
      const result = await this.db.execute<DraftRow>(`insert into crm_notifications.template_drafts (template_key,revision,title_template,summary_template,body_template,updated_at) values ($1,1,$2,$3,$4,$5) on conflict (template_key) do update set revision=crm_notifications.template_drafts.revision+1,title_template=excluded.title_template,summary_template=excluded.summary_template,body_template=excluded.body_template,updated_at=excluded.updated_at where crm_notifications.template_drafts.revision=$6 returning *`, [input.draft.templateKey, input.draft.titleTemplate, input.draft.summaryTemplate, input.draft.bodyTemplate, input.draft.updatedAt, input.expectedRevision]);
      const row = result.rows[0];
      if (!row || row.revision !== input.expectedRevision + 1) throw new NotificationError("NOTIFICATION_CONFLICT");
      await this.db.execute("insert into crm_notifications.template_draft_operations (operation_id,template_key,expected_revision,revision,title_template,summary_template,body_template,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)", [input.operationId, row.template_key, input.expectedRevision, row.revision, row.title_template, row.summary_template, row.body_template, row.updated_at]);
      return draft(row);
    });
  }

  public async getTemplateDraft(templateKey: string): Promise<NotificationTemplateDraft | undefined> {
    const result = await this.db.execute<DraftRow>("select * from crm_notifications.template_drafts where template_key=$1", [templateKey]);
    return result.rows[0] ? draft(result.rows[0]) : undefined;
  }

  public async publishTemplate(release: TemplateRelease): Promise<"published" | "duplicate"> {
    const result = await this.db.execute<TemplateRow>(`insert into crm_notifications.template_releases (template_key,version,owner_reference,notification_type,variable_schema,variable_catalog_version,title_template,summary_template,body_template,body_format,content_digest,published_at) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) on conflict (template_key,version) do nothing returning *`, [release.templateKey, release.version, release.ownerReference, release.notificationType, JSON.stringify(release.variableSchema), release.variableCatalogVersion ?? null, release.titleTemplate, release.summaryTemplate ?? null, release.bodyTemplate, release.bodyFormat ?? "plain-text", release.contentDigest, release.publishedAt]);
    if (result.rows[0]) return "published";
    const existing = await this.getTemplate(release.templateKey, release.version);
    if (!existing) throw new NotificationError("NOTIFICATION_STORAGE_UNAVAILABLE", { retryable: true });
    if (existing.contentDigest !== release.contentDigest) throw new NotificationError("NOTIFICATION_CONFLICT");
    return "duplicate";
  }

  public publishAndActivateTemplate(input: { readonly activatedAt: string; readonly activationId: string; readonly release: TemplateRelease }): Promise<"published" | "duplicate"> {
    return this.db.withTransaction(async () => {
      await this.db.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", [`notification-template:${input.release.templateKey}`]);
      const status = await this.publishTemplate(input.release);
      await this.activateTemplate({ activatedAt: input.activatedAt, activationId: input.activationId, templateKey: input.release.templateKey, version: input.release.version });
      return status;
    });
  }

  public async getTemplate(key: string, version: number): Promise<TemplateRelease | undefined> {
    const result = await this.db.execute<TemplateRow>("select * from crm_notifications.template_releases where template_key=$1 and version=$2", [key, version]);
    return result.rows[0] ? template(result.rows[0]) : undefined;
  }

  public async listTemplateReleases(templateKey: string): Promise<readonly TemplateRelease[]> {
    const result = await this.db.execute<TemplateRow>("select * from crm_notifications.template_releases where template_key=$1 order by version desc", [templateKey]);
    return result.rows.map(template);
  }

  public activateTemplate(input: { readonly activatedAt: string; readonly activationId: string; readonly templateKey: string; readonly version: number }): Promise<void> {
    return this.db.withTransaction(async () => {
      const release = await this.getTemplate(input.templateKey, input.version);
      if (!release) throw new NotificationError("NOTIFICATION_TEMPLATE_NOT_FOUND");
      const inserted = await this.db.execute<{ activation_id: string; template_key: string; version: number }>(`insert into crm_notifications.template_activation_history (activation_id,template_key,version,activated_at) values ($1,$2,$3,$4) on conflict (activation_id) do nothing returning activation_id,template_key,version`, [input.activationId, input.templateKey, input.version, input.activatedAt]);
      if (!inserted.rows[0]) {
        const existing = await this.db.execute<{ template_key: string; version: number }>("select template_key,version from crm_notifications.template_activation_history where activation_id=$1", [input.activationId]);
        const row = existing.rows[0];
        if (row === undefined || row.template_key !== input.templateKey || row.version !== input.version) throw new NotificationError("NOTIFICATION_CONFLICT");
      }
      await this.db.execute(`insert into crm_notifications.current_template_release (template_key,version,activation_id,activated_at) values ($1,$2,$3,$4) on conflict (template_key) do update set version=excluded.version,activation_id=excluded.activation_id,activated_at=excluded.activated_at`, [input.templateKey, input.version, input.activationId, input.activatedAt]);
    });
  }

  public async getActiveTemplate(templateKey: string): Promise<TemplateRelease | undefined> {
    const result = await this.db.execute<TemplateRow>(`select r.* from crm_notifications.current_template_release c join crm_notifications.template_releases r on r.template_key=c.template_key and r.version=c.version where c.template_key=$1`, [templateKey]);
    return result.rows[0] ? template(result.rows[0]) : undefined;
  }

  public async findIntent(producer: string, key: string): Promise<StoredIntent | undefined> {
    const result = await this.db.execute<IntentRow>("select * from crm_notifications.notification_intents where producer=$1 and idempotency_key=$2", [producer, key]);
    return result.rows[0] ? stored(result.rows[0]) : undefined;
  }

  public acceptIntent(input: { readonly intent: StoredIntent; readonly notifications: readonly InAppNotification[] }): Promise<{ status: "created" | "duplicate"; result: StoredIntent["result"] }> {
    return this.db.withTransaction(async () => {
      await this.db.execute("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${input.intent.producer}:${input.intent.idempotencyKey}`]);
      const existing = await this.findIntent(input.intent.producer, input.intent.idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== input.intent.fingerprint) throw new NotificationError("NOTIFICATION_CONFLICT");
        return { status: "duplicate", result: existing.result };
      }
      await this.db.execute("insert into crm_notifications.notification_intents (intent_id,producer,idempotency_key,fingerprint,result_json,created_at) values ($1,$2,$3,$4,$5::jsonb,$6)", [input.intent.intentId, input.intent.producer, input.intent.idempotencyKey, input.intent.fingerprint, JSON.stringify(input.intent.result), input.intent.createdAt]);
      for (const item of input.notifications) {
        await this.db.execute(`insert into crm_notifications.in_app_notifications (notification_id,intent_id,principal_id,recipient_reference,resolution_reference,resolution_version,template_key,template_version,notification_type,title,summary,body,body_format,content_digest,state_version,source_type,source_id,deep_link,preference_decision,preference_reason,preference_version,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22)`, [item.notificationId, item.intentId, item.principalId, item.recipientReference, item.resolutionReference, item.resolutionVersion, item.templateKey, item.templateVersion, item.notificationType, item.title, item.summary, item.body, item.bodyFormat, item.contentDigest ?? null, item.stateVersion, item.sourceType, item.sourceId, JSON.stringify(item.deepLink), item.preferenceDecision, item.preferenceReason, item.preferenceVersion, item.createdAt]);
        if (item.preferenceDecision === "deliver") await this.changes?.record(item);
      }
      return { status: "created", result: input.intent.result };
    });
  }

  public async get(principalId: string, id: string): Promise<InAppNotification | undefined> {
    const result = await this.db.execute<NotificationRow>("select * from crm_notifications.in_app_notifications where principal_id=$1 and notification_id=$2 and preference_decision='deliver'", [principalId, id]);
    return result.rows[0] ? notification(result.rows[0]) : undefined;
  }

  public async list(input: { readonly principalId: string; readonly limit: number; readonly cursor?: string; readonly includeArchived: boolean }): Promise<NotificationPage> {
    let cursorAt: string | null = null;
    let cursorId: string | null = null;
    if (input.cursor !== undefined) {
      const split = input.cursor.split("\u0000");
      if (split.length !== 2 || split[0] === undefined || split[1] === undefined) throw new NotificationError("NOTIFICATION_INPUT_INVALID");
      [cursorAt, cursorId] = split;
    }
    const result = await this.db.execute<NotificationRow>(`select * from crm_notifications.in_app_notifications where principal_id=$1 and preference_decision='deliver' and ($2::boolean or archived_at is null) and ($3::timestamptz is null or (created_at,notification_id)<($3::timestamptz,$4::uuid)) order by created_at desc,notification_id desc limit $5`, [input.principalId, input.includeArchived, cursorAt, cursorId, input.limit + 1]);
    const items = result.rows.slice(0, input.limit).map(notification);
    const last = items.at(-1);
    return { items, ...(result.rows.length > input.limit && last ? { nextCursor: `${last.createdAt}\u0000${last.notificationId}` } : {}) };
  }

  public async unreadCount(principalId: string): Promise<number> {
    const result = await this.db.execute<{ count: string }>("select count(*)::text count from crm_notifications.in_app_notifications where principal_id=$1 and preference_decision='deliver' and read_at is null and archived_at is null", [principalId]);
    return Number(result.rows[0]?.count ?? 0);
  }

  public async markRead(principalId: string, id: string, at: string): Promise<InAppNotification | undefined> {
    return this.db.withTransaction(async () => {
      const result = await this.db.execute<NotificationRow>("update crm_notifications.in_app_notifications set state_version=state_version+case when read_at is null then 1 else 0 end,read_at=coalesce(read_at,$3) where principal_id=$1 and notification_id=$2 and preference_decision='deliver' returning *", [principalId, id, at]);
      const item = result.rows[0] ? notification(result.rows[0]) : undefined;
      if (item) await this.changes?.record(item);
      return item;
    });
  }

  public async archive(principalId: string, id: string, at: string): Promise<InAppNotification | undefined> {
    return this.db.withTransaction(async () => {
      const result = await this.db.execute<NotificationRow>("update crm_notifications.in_app_notifications set state_version=state_version+case when archived_at is null then 1 else 0 end,archived_at=coalesce(archived_at,$3) where principal_id=$1 and notification_id=$2 and preference_decision='deliver' returning *", [principalId, id, at]);
      const item = result.rows[0] ? notification(result.rows[0]) : undefined;
      if (item) await this.changes?.record(item);
      return item;
    });
  }
}

export const createPrismaNotificationStore = (runtime: NotificationPersistenceRuntime, changes?: NotificationChangeRecorder): NotificationStore => new PrismaNotificationStore(runtime, changes);
/** @deprecated Use createPrismaNotificationStore. */
export const createPostgresNotificationStore = createPrismaNotificationStore;
