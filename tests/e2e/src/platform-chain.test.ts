import { randomUUID } from "node:crypto";
import {
  createApplicationRegistryService,
  createMemoryApplicationRegistryStore,
  type RegistryAudit,
} from "@ai-crm/platform-app-registry";
import {
  createFormSchemaService,
  createMemoryFormSchemaStore,
  type FormAudit,
} from "@ai-crm/platform-form-schema";
import {
  createNotificationCenter,
  InMemoryNotificationStore,
  type NotificationAudit,
  type PublishTemplateCommand,
} from "@ai-crm/platform-notifications";
import { createMemoryOrganizationService } from "@ai-crm/platform-organization";
import {
  createTaskCenter,
  InMemoryTaskCenterStore,
  type TaskAudit,
  type TaskLifecycleEvent,
} from "@ai-crm/platform-task-center";
import { describe, expect, it } from "vitest";

const at = "2026-07-30T00:00:00.000Z";
const traceId = "1234567890abcdef1234567890abcdef";
const ids = {
  assignment: "00000000-0000-4000-8000-000000000007",
  association: "00000000-0000-4000-8000-000000000003",
  employment: "00000000-0000-4000-8000-000000000002",
  person: "00000000-0000-4000-8000-000000000001",
  placement: "00000000-0000-4000-8000-000000000005",
  position: "00000000-0000-4000-8000-000000000006",
  unit: "00000000-0000-4000-8000-000000000004",
} as const;
const subject = {
  issuer: "https://identity.example.test/realms/ai-crm",
  subject: "principal.synthetic",
} as const;

type AuditEvidence = Readonly<{ module: "app-registry" | "form-schema" | "notifications" | "task-center"; record: unknown }>;

describe("business-neutral in-process platform slice", () => {
  it("joins stable public APIs without claiming browser, API, worker, or RabbitMQ E2E", async () => {
    const auditEvidence: AuditEvidence[] = [];
    const organization = createMemoryOrganizationService({ authorize: () => Promise.resolve() });
    const organizationMetadata = () => ({
      actor: { actorId: subject.subject, actorType: "system" as const },
      operationId: randomUUID(),
      reason: "synthetic business-neutral platform slice",
      traceId,
    });

    await organization.createWorkforcePerson({ ...organizationMetadata(), recordedAt: at, workforcePersonId: ids.person });
    await organization.createEmployment({
      ...organizationMetadata(),
      effectiveFrom: at,
      employmentId: ids.employment,
      workforcePersonId: ids.person,
    });
    await organization.createOrganizationUnit({
      ...organizationMetadata(),
      effectiveFrom: at,
      organizationUnitId: ids.unit,
      placementId: ids.placement,
    });
    await organization.createPosition({
      ...organizationMetadata(),
      effectiveFrom: at,
      organizationUnitId: ids.unit,
      positionId: ids.position,
    });
    await organization.createAssignment({
      ...organizationMetadata(),
      assignmentId: ids.assignment,
      effectiveFrom: at,
      employmentId: ids.employment,
      organizationUnitId: ids.unit,
      positionId: ids.position,
      workforcePersonId: ids.person,
    });
    await organization.createSubjectAssociation({
      ...organizationMetadata(),
      ...subject,
      associationId: ids.association,
      effectiveFrom: at,
      workforcePersonId: ids.person,
    });
    const context = await organization.resolveWorkforceContext(subject, at, ids.assignment);
    expect(context).toMatchObject({
      assignments: [{ assignmentId: ids.assignment }],
      employmentIds: [ids.employment],
      workforcePersonId: ids.person,
    });

    const registryActor = {
      actorId: subject.subject,
      actorType: "authenticated_subject" as const,
      assignmentId: ids.assignment,
      workforcePersonId: ids.person,
    };
    const registryAudit: RegistryAudit = {
      record: (record) => {
        auditEvidence.push({ module: "app-registry", record });
        return Promise.resolve();
      },
    };
    const registry = createApplicationRegistryService(
      createMemoryApplicationRegistryStore(),
      { authorize: () => Promise.resolve({ allowed: true, decisionId: randomUUID() }) },
      registryAudit,
    );
    const registryMetadata = () => ({
      actor: registryActor,
      operationId: randomUUID(),
      reason: "synthetic business-neutral registry fixture",
      traceId,
    });
    const application = {
      applicationId: "platform.synthetic",
      audience: "internal" as const,
      enabled: true,
      permissionCode: "platform.synthetic:view",
    };
    const route = {
      applicationId: application.applicationId,
      deepLinkSources: ["task", "notification"] as const,
      enabled: true,
      path: "/platform/synthetic/:resource_reference",
      permissionCode: "platform.synthetic:open",
      routeId: "platform.synthetic.detail",
    };
    await registry.mutate({ ...registryMetadata(), application, kind: "register_application" });
    await registry.mutate({ ...registryMetadata(), kind: "register_route", route });
    await registry.mutate({
      ...registryMetadata(),
      kind: "register_navigation",
      navigation: {
        applicationId: application.applicationId,
        enabled: true,
        navigationId: "platform.synthetic.navigation",
        order: 10,
        routeId: route.routeId,
      },
    });
    await expect(registry.loadRegistry({ actor: registryActor, audience: "internal" })).resolves.toMatchObject({
      applications: [application],
      navigation: [{ routeId: route.routeId }],
      routes: [route],
    });

    const formAudit: FormAudit = {
      record: (record) => {
        auditEvidence.push({ module: "form-schema", record });
        return Promise.resolve();
      },
    };
    const form = createFormSchemaService(
      createMemoryFormSchemaStore(),
      { authorize: () => Promise.resolve({ allowed: true, decisionId: randomUUID() }) },
      formAudit,
      { clock: () => new Date(at), id: randomUUID },
    );
    const formActor = {
      actorId: registryActor.actorId,
      actorType: registryActor.actorType,
      assignmentId: registryActor.assignmentId,
    };
    const formMetadata = () => ({
      actor: formActor,
      operationId: randomUUID(),
      reason: "synthetic business-neutral form fixture",
      traceId,
    });
    const jsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
      properties: { synthetic_value: { maxLength: 20, minLength: 2, type: "string" } },
      required: ["synthetic_value"],
      type: "object",
    };
    const uiSchema = {
      fields: [{ component: "input" as const, field: "synthetic_value", order: 1 }],
      layout: "vertical" as const,
      version: 1 as const,
    };
    await form.saveDraft({
      ...formMetadata(),
      definitionId: "platform.synthetic.form",
      expectedRevision: 0,
      jsonSchema,
      ownerModule: "platform.synthetic",
      uiSchema,
    });
    const published = await form.publish({
      ...formMetadata(),
      definitionId: "platform.synthetic.form",
      expectedRevision: 1,
    });
    expect(published.reference).toMatchObject({ definitionId: "platform.synthetic.form", releaseVersion: 1 });
    await expect(form.validateSubmission({
      actor: formActor,
      data: { synthetic_value: "accepted" },
      definitionId: "platform.synthetic.form",
      releaseVersion: 1,
    })).resolves.toMatchObject({ errors: [], valid: true });

    const taskAudit: TaskAudit = {
      record: (record) => {
        auditEvidence.push({ module: "task-center", record });
        return Promise.resolve();
      },
    };
    const task = createTaskCenter({
      audit: taskAudit,
      authorization: {
        authorize: ({ actor, operation, task: target }) => Promise.resolve({
          allowed: !(actor.principalId === "principal.denied" && operation === "task_detail" && target?.sourceTaskId === "task.synthetic"),
          decisionId: randomUUID(),
        }),
      },
      router: { complete: () => Promise.reject(new Error("blocked source routing contract was not invoked")) },
      sourceReader: { get: () => Promise.reject(new Error("blocked source reconciliation contract was not invoked")) },
      store: new InMemoryTaskCenterStore(),
    });
    const taskEvent: TaskLifecycleEvent = {
      assigneeReference: ids.assignment,
      deepLink: { appId: application.applicationId, routeId: route.routeId },
      eventId: "00000000-0000-4000-8000-000000000021",
      occurredAt: at,
      sourceTaskId: "task.synthetic",
      sourceType: "platform.synthetic",
      sourceVersion: 1,
      status: "open",
    };
    await expect(task.apply(taskEvent)).resolves.toMatchObject({ status: "applied" });
    await expect(task.apply(taskEvent)).resolves.toMatchObject({ status: "duplicate" });
    const taskActor = { activeAssignmentIds: context.assignments.map(({ assignmentId }) => assignmentId), principalId: subject.subject };
    await expect(task.list({ actor: taskActor })).resolves.toMatchObject({ items: [{ sourceTaskId: taskEvent.sourceTaskId }] });
    await expect(task.get({ principalId: "principal.denied" }, taskEvent)).rejects.toMatchObject({ code: "TASK_OPERATION_DENIED" });
    await expect(registry.resolveDeepLink({
      actor: registryActor,
      audience: "internal",
      link: {
        applicationId: taskEvent.deepLink.appId,
        resourceReference: taskEvent.sourceTaskId,
        routeId: taskEvent.deepLink.routeId,
        source: "task",
        version: 1,
      },
    })).resolves.toMatchObject({ path: route.path, resourceReference: taskEvent.sourceTaskId });

    const notificationAudit: NotificationAudit = {
      record: (record) => {
        auditEvidence.push({ module: "notifications", record });
        return Promise.resolve();
      },
    };
    const notificationActor = { activeAssignmentIds: taskActor.activeAssignmentIds, principalId: subject.subject };
    let recipientResolutionCalls = 0;
    const notification = createNotificationCenter({
      audit: notificationAudit,
      authorization: { authorize: () => Promise.resolve({ allowed: true, decisionId: randomUUID() }) },
      now: () => new Date(at),
      preference: { evaluate: () => Promise.resolve({ decision: "deliver", reason: "synthetic-default", version: "synthetic-v1" }) },
      resolver: {
        resolve: () => {
          recipientResolutionCalls += 1;
          return Promise.resolve([{
            principalId: subject.subject,
            recipientReference: ids.person,
            resolutionReference: ids.assignment,
            resolutionVersion: "organization-synthetic-v1",
          }]);
        },
      },
      store: new InMemoryNotificationStore(),
    });
    const template: PublishTemplateCommand = {
      actor: notificationActor,
      bodyTemplate: "Open {{subject}} for current details.",
      notificationType: "platform.synthetic",
      ownerReference: "platform.synthetic",
      publishedAt: at,
      templateKey: "platform.synthetic.notice",
      titleTemplate: "Update: {{subject}}",
      variableSchema: {
        additionalProperties: false,
        properties: { subject: { maxLength: 100, minLength: 1, type: "string" } },
        required: ["subject"],
        type: "object",
      },
      version: 1,
    };
    await notification.publishTemplate(template);
    const notificationIntent = {
      deepLink: {
        applicationId: application.applicationId,
        resourceId: "resource.synthetic",
        resourceType: "synthetic-resource",
        routeId: route.routeId,
      },
      idempotencyKey: "platform-slice-notice-1",
      intentId: "00000000-0000-4000-8000-000000000031",
      producer: "platform.synthetic",
      selectors: [{ referenceId: ids.assignment, selectorType: "assignment" }],
      sourceId: "resource.synthetic",
      sourceType: "synthetic-resource",
      templateKey: template.templateKey,
      templateVersion: template.version,
      variables: { subject: "synthetic record" },
    };
    const firstNotification = await notification.submitIntent(notificationActor, notificationIntent);
    await expect(notification.submitIntent({ principalId: "principal.synthetic-retry" }, notificationIntent)).resolves.toEqual(firstNotification);
    expect(recipientResolutionCalls).toBe(1);
    await expect(notification.get(notificationActor, firstNotification.notificationIds[0] ?? "")).resolves.toMatchObject({
      sourceId: "resource.synthetic",
      templateVersion: 1,
      title: "Update: synthetic record",
    });
    await expect(registry.resolveDeepLink({
      actor: registryActor,
      audience: "internal",
      link: {
        applicationId: notificationIntent.deepLink.applicationId,
        resourceReference: notificationIntent.deepLink.resourceId,
        routeId: notificationIntent.deepLink.routeId,
        source: "notification",
        version: 1,
      },
    })).resolves.toMatchObject({ path: route.path, resourceReference: notificationIntent.deepLink.resourceId });

    expect(new Set(auditEvidence.map(({ module }) => module))).toEqual(new Set([
      "app-registry",
      "form-schema",
      "notifications",
      "task-center",
    ]));
    expect(auditEvidence.some(({ module, record }) => module === "task-center"
      && typeof record === "object"
      && record !== null
      && "errorCode" in record
      && record.errorCode === "TASK_OPERATION_DENIED"
      && "phase" in record
      && record.phase === "failed")).toBe(true);
  });
});
