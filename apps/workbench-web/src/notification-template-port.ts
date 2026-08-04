export interface NotificationTemplateVariable {
  readonly description: string;
  readonly example: string | number | boolean | null;
  readonly key: string;
  readonly label: string;
  readonly ownerModule: string;
  readonly privacy: "internal" | "personal";
  readonly source: string;
  readonly type: "boolean" | "date-time" | "integer" | "number" | "string";
}

export interface NotificationTemplateRelease {
  readonly bodyTemplate: string;
  readonly contentDigest: string;
  readonly publishedAt: string;
  readonly summaryTemplate?: string;
  readonly titleTemplate: string;
  readonly version: number;
}

export interface NotificationTemplateAdministration {
  readonly currentVersion?: number;
  readonly definition: {
    readonly allowedVariables: readonly NotificationTemplateVariable[];
    readonly enabled: boolean;
    readonly notificationType: string;
    readonly ownerModule: string;
    readonly templateKey: string;
    readonly variableCatalogVersion: number;
  };
  readonly draft?: { readonly bodyTemplate: string; readonly revision: number; readonly summaryTemplate: string; readonly titleTemplate: string; readonly updatedAt: string };
  readonly releases: readonly NotificationTemplateRelease[];
}

export interface NotificationTemplatePort {
  activate(templateKey: string, version: number): Promise<void>;
  get(templateKey: string): Promise<NotificationTemplateAdministration>;
  list(): Promise<readonly NotificationTemplateAdministration[]>;
  preview(templateKey: string, content: TemplateContent): Promise<TemplatePreview>;
  publish(templateKey: string): Promise<NotificationTemplateRelease>;
  save(templateKey: string, expectedRevision: number, content: TemplateContent): Promise<void>;
}

export interface TemplateContent { readonly bodyTemplate: string; readonly summaryTemplate: string; readonly titleTemplate: string }
export interface TemplatePreview { readonly body: string; readonly summary: string; readonly title: string }

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function json<T>(response: Response, code: string): Promise<T> {
  if (!response.ok) throw new Error(`${code}_${String(response.status)}`);
  return await response.json() as T;
}

async function mutationSecurity(fetchPort: FetchPort): Promise<Readonly<Record<string, string>>> {
  const response = await fetchPort("/auth/pc/session", { credentials: "same-origin", headers: { Accept: "application/json" }, method: "GET" });
  const session = await json<{ readonly csrfToken?: unknown }>(response, "notification_template_session_unavailable");
  if (typeof session.csrfToken !== "string" || session.csrfToken.length < 32) throw new Error("notification_template_session_invalid");
  return { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-CSRF-Token": session.csrfToken };
}

export function createNotificationTemplatePort(fetchPort: FetchPort = globalThis.fetch): NotificationTemplatePort {
  const port: NotificationTemplatePort = {
    list: async () => json<readonly NotificationTemplateAdministration[]>(await fetchPort("/notification-templates", { credentials: "same-origin", headers: { Accept: "application/json" } }), "notification_templates_unavailable"),
    get: async (templateKey: string) => json<NotificationTemplateAdministration>(await fetchPort(`/notification-templates/${encodeURIComponent(templateKey)}`, { credentials: "same-origin", headers: { Accept: "application/json" } }), "notification_template_unavailable"),
    async save(templateKey: string, expectedRevision: number, content: TemplateContent) {
      await json(await fetchPort(`/notification-templates/${encodeURIComponent(templateKey)}/draft`, { credentials: "same-origin", method: "PUT", headers: await mutationSecurity(fetchPort), body: JSON.stringify({ expectedRevision, ...content }) }), "notification_template_save_failed");
    },
    preview: async (templateKey: string, content: TemplateContent) => json<TemplatePreview>(await fetchPort(`/notification-templates/${encodeURIComponent(templateKey)}/preview`, { credentials: "same-origin", method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(content) }), "notification_template_preview_failed"),
    publish: async (templateKey: string) => json<NotificationTemplateRelease>(await fetchPort(`/notification-templates/${encodeURIComponent(templateKey)}/publish`, { credentials: "same-origin", method: "POST", headers: await mutationSecurity(fetchPort), body: "{}" }), "notification_template_publish_failed"),
    async activate(templateKey: string, version: number) {
      const response = await fetchPort(`/notification-templates/${encodeURIComponent(templateKey)}/activate`, { credentials: "same-origin", method: "POST", headers: await mutationSecurity(fetchPort), body: JSON.stringify({ version }) });
      if (!response.ok) throw new Error(`notification_template_activate_failed_${String(response.status)}`);
    },
  };
  return Object.freeze(port);
}
