export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface NotificationActor {
  readonly activeAssignmentIds?: readonly string[];
  readonly principalId: string;
  readonly selectedAssignmentId?: string;
  /** Current organization-resolved identity; never derived from principalId. */
  readonly workforcePersonId?: string;
}

export interface NotificationDeepLink {
  readonly applicationId: string;
  readonly routeId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

export interface RecipientSelector { readonly selectorType: string; readonly referenceId: string }
export interface ResolvedRecipient {
  readonly principalId: string;
  readonly recipientReference: string;
  readonly resolutionReference: string;
  readonly resolutionVersion: string;
  readonly workforcePersonId?: string;
}

export type TemplateVariableType = "boolean" | "date-time" | "integer" | "number" | "string";
export interface TemplateVariableDefinition {
  readonly description: string;
  readonly example: JsonPrimitive;
  readonly key: string;
  readonly label: string;
  readonly maximumLength?: number;
  readonly ownerModule: string;
  readonly privacy: "internal" | "personal";
  readonly source: "domain" | "notification.owner" | "notification.sender" | "notification.time";
  readonly type: TemplateVariableType;
}

export interface NotificationTemplateDefinition {
  readonly allowedVariables: readonly TemplateVariableDefinition[];
  readonly definitionVersion: number;
  readonly enabled: boolean;
  readonly notificationType: string;
  readonly ownerModule: string;
  readonly systemSenderName: string;
  readonly templateKey: string;
  readonly variableCatalogVersion: number;
}

export interface NotificationTemplateDraft {
  readonly bodyTemplate: string;
  readonly revision: number;
  readonly summaryTemplate: string;
  readonly templateKey: string;
  readonly titleTemplate: string;
  readonly updatedAt: string;
}

export interface TemplateRelease {
  readonly templateKey: string;
  readonly version: number;
  readonly ownerReference: string;
  readonly notificationType: string;
  readonly variableSchema: Readonly<Record<string, unknown>>;
  readonly variableCatalogVersion?: number;
  readonly titleTemplate: string;
  readonly summaryTemplate?: string;
  readonly bodyTemplate: string;
  readonly bodyFormat?: "plain-text" | "restricted-markdown";
  readonly contentDigest: string;
  readonly publishedAt: string;
}

export interface PublishTemplateCommand extends Omit<TemplateRelease, "contentDigest" | "publishedAt"> {
  readonly actor: NotificationActor;
  readonly publishedAt: string;
}

export interface NotificationIntent {
  readonly intentId: string;
  readonly producer: string;
  readonly idempotencyKey: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly selectors: readonly RecipientSelector[];
  readonly variables: Readonly<Record<string, JsonValue>>;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly deepLink: NotificationDeepLink;
}

export interface NotificationIntentV2 extends Omit<NotificationIntent, "templateVersion"> {
  readonly version: 2;
  readonly sender:
    | { readonly kind: "system" }
    | { readonly kind: "workforce_person"; readonly workforcePersonId: string };
}

export interface NotificationIntentResult { readonly intentId: string; readonly notificationIds: readonly string[]; readonly status: "accepted" }
export type PreferenceDecision = "deliver" | "suppress";
export interface NotificationPreference { evaluate(input: { readonly notificationType: string; readonly recipient: ResolvedRecipient }): Promise<{ readonly decision: PreferenceDecision; readonly reason: string; readonly version: string }> }

export interface InAppNotification {
  readonly notificationId: string;
  readonly intentId: string;
  readonly principalId: string;
  readonly recipientReference: string;
  readonly resolutionReference: string;
  readonly resolutionVersion: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly notificationType: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly bodyFormat: "plain-text" | "restricted-markdown";
  readonly contentDigest?: string;
  readonly stateVersion: number;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly deepLink: NotificationDeepLink;
  readonly preferenceDecision: PreferenceDecision;
  readonly preferenceReason: string;
  readonly preferenceVersion: string;
  readonly createdAt: string;
  readonly readAt?: string;
  readonly archivedAt?: string;
}

export interface NotificationQuery { readonly actor: NotificationActor; readonly limit?: number; readonly cursor?: string; readonly includeArchived?: boolean }
export interface NotificationPage { readonly items: readonly InAppNotification[]; readonly nextCursor?: string }
export interface ArchiveNotificationCommand { readonly actor: NotificationActor; readonly notificationId: string }
export type NotificationOperation =
  | "notification_archive" | "notification_detail" | "notification_intent_submit"
  | "notification_list" | "notification_mark_read" | "notification_template_activate"
  | "notification_template_manage" | "notification_template_publish" | "notification_template_read"
  | "notification_unread_count";
export interface NotificationAuthorization { authorize(input: { readonly actor: NotificationActor; readonly operation: NotificationOperation; readonly notificationId?: string; readonly ownerReference?: string; readonly producerReference?: string }): Promise<{ readonly allowed: boolean; readonly decisionId: string }> }
export interface NotificationAudit { record(input: { readonly actor: NotificationActor; readonly operation: NotificationOperation; readonly phase: "attempted" | "failed" | "succeeded"; readonly decisionId: string; readonly referenceId: string; readonly errorCode?: string }): Promise<void> }
export interface NotificationObserver { record(input: { readonly operation: NotificationOperation; readonly outcome: "completed" | "denied" | "duplicate" | "failed"; readonly durationMs: number }): void }
export interface NotificationRecipientResolver { resolve(selectors: readonly RecipientSelector[]): Promise<readonly ResolvedRecipient[]> }
export interface NotificationVariableResolver { displayName(workforcePersonId: string): Promise<{ readonly displayName: string; readonly resolutionVersion: string }> }

export interface StoredIntent { readonly intentId: string; readonly producer: string; readonly idempotencyKey: string; readonly fingerprint: string; readonly result: NotificationIntentResult; readonly createdAt: string }
export interface NotificationTemplateSummary {
  readonly currentVersion?: number;
  readonly definition: NotificationTemplateDefinition;
  readonly draft?: NotificationTemplateDraft;
  readonly releases: readonly TemplateRelease[];
}

export interface NotificationStore {
  registerTemplateDefinition(definition: NotificationTemplateDefinition): Promise<"created" | "duplicate">;
  getTemplateDefinition(templateKey: string): Promise<NotificationTemplateDefinition | undefined>;
  listTemplateDefinitions(): Promise<readonly NotificationTemplateDefinition[]>;
  saveTemplateDraft(input: { readonly draft: Omit<NotificationTemplateDraft, "revision">; readonly expectedRevision: number; readonly operationId: string }): Promise<NotificationTemplateDraft>;
  getTemplateDraft(templateKey: string): Promise<NotificationTemplateDraft | undefined>;
  publishTemplate(release: TemplateRelease): Promise<"published" | "duplicate">;
  publishAndActivateTemplate(input: { readonly activatedAt: string; readonly activationId: string; readonly release: TemplateRelease }): Promise<"published" | "duplicate">;
  getTemplate(templateKey: string, version: number): Promise<TemplateRelease | undefined>;
  listTemplateReleases(templateKey: string): Promise<readonly TemplateRelease[]>;
  activateTemplate(input: { readonly activatedAt: string; readonly activationId: string; readonly templateKey: string; readonly version: number }): Promise<void>;
  getActiveTemplate(templateKey: string): Promise<TemplateRelease | undefined>;
  findIntent(producer: string, idempotencyKey: string): Promise<StoredIntent | undefined>;
  acceptIntent(input: { readonly intent: StoredIntent; readonly notifications: readonly InAppNotification[] }): Promise<{ readonly status: "created" | "duplicate"; readonly result: NotificationIntentResult }>;
  get(principalId: string, notificationId: string): Promise<InAppNotification | undefined>;
  list(input: { readonly principalId: string; readonly limit: number; readonly cursor?: string; readonly includeArchived: boolean }): Promise<NotificationPage>;
  unreadCount(principalId: string): Promise<number>;
  markRead(principalId: string, notificationId: string, at: string): Promise<InAppNotification | undefined>;
  archive(principalId: string, notificationId: string, at: string): Promise<InAppNotification | undefined>;
}

export interface NotificationCenter {
  registerTemplateDefinition(actor: NotificationActor, definition: NotificationTemplateDefinition): Promise<NotificationTemplateDefinition>;
  listTemplateDefinitions(actor: NotificationActor): Promise<readonly NotificationTemplateSummary[]>;
  getTemplateAdministration(actor: NotificationActor, templateKey: string): Promise<NotificationTemplateSummary>;
  saveTemplateDraft(command: { readonly actor: NotificationActor; readonly bodyTemplate: string; readonly expectedRevision: number; readonly operationId: string; readonly summaryTemplate: string; readonly templateKey: string; readonly titleTemplate: string; readonly updatedAt: string }): Promise<NotificationTemplateDraft>;
  previewTemplate(command: { readonly actor: NotificationActor; readonly bodyTemplate: string; readonly exampleVariables?: Readonly<Record<string, JsonPrimitive>>; readonly summaryTemplate: string; readonly templateKey: string; readonly titleTemplate: string }): Promise<{ readonly body: string; readonly summary: string; readonly title: string }>;
  publishTemplateDraft(command: { readonly actor: NotificationActor; readonly activationId: string; readonly publishedAt: string; readonly templateKey: string }): Promise<TemplateRelease>;
  activateTemplate(command: { readonly actor: NotificationActor; readonly activatedAt: string; readonly activationId: string; readonly templateKey: string; readonly version: number }): Promise<void>;
  publishTemplate(command: PublishTemplateCommand): Promise<TemplateRelease>;
  submitIntent(actor: NotificationActor, intent: NotificationIntent | NotificationIntentV2): Promise<NotificationIntentResult>;
  get(actor: NotificationActor, notificationId: string): Promise<InAppNotification>;
  list(query: NotificationQuery): Promise<NotificationPage>;
  unreadCount(actor: NotificationActor): Promise<number>;
  markRead(command: ArchiveNotificationCommand): Promise<InAppNotification>;
  archive(command: ArchiveNotificationCommand): Promise<InAppNotification>;
}
