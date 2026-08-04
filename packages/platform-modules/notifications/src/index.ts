export { NOTIFICATION_ERROR_CODES,NotificationError,type NotificationErrorCode } from "./errors.js";
export { InMemoryNotificationStore } from "./memory-store.js";
export { createPostgresNotificationStore,createPrismaNotificationStore,type NotificationChangeRecorder,type NotificationPersistenceRuntime } from "./postgres-store.js";
export { createNotificationCenter } from "./service.js";
export { renderTemplate,validatePlainTemplate,validateRestrictedMarkdown,variableNames,variableSchema } from "./template.js";
export type { ArchiveNotificationCommand,InAppNotification,NotificationActor,NotificationAudit,NotificationAuthorization,NotificationCenter,NotificationDeepLink,NotificationIntent,NotificationIntentResult,NotificationIntentV2,NotificationObserver,NotificationPage,NotificationPreference,NotificationQuery,NotificationRecipientResolver,NotificationStore,NotificationTemplateDefinition,NotificationTemplateDraft,NotificationTemplateSummary,NotificationVariableResolver,PublishTemplateCommand,RecipientSelector,ResolvedRecipient,TemplateRelease,TemplateVariableDefinition,TemplateVariableType } from "./types.js";
export const packageId = "@ai-crm/platform-notifications" as const;
