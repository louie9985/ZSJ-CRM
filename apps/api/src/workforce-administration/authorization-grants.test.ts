import { describe, expect, it, vi } from "vitest";

import type { AuthorizationPolicySnapshot } from "@ai-crm/platform-authorization";
import { createAuthorizationGrantPort } from "./authorization-grants.js";

const personId = "11111111-1111-4111-8111-111111111111";
const assignmentId = "22222222-2222-4222-8222-222222222222";
const roleId = "33333333-3333-4333-8333-333333333333";
const operationId = "44444444-4444-4444-8444-444444444444";

function policy(grants: AuthorizationPolicySnapshot["grants"] = []): AuthorizationPolicySnapshot {
  return { grants, permissions: [{ action: "manage", applicationId: "crm", code: "crm.workforce:manage", resource: "crm.workforce", scopeDimensions: [] }], roles: [{ displayName: "CRM系统管理员", permissions: [{ permissionCode: "crm.workforce:manage", scope: { terms: [{ kind: "all" }], version: 1 } }], roleId, roleKey: "crm.system-administrator" }], schemaVersion: 2, superAdministratorGrants: [{ grantId: "55555555-5555-4555-8555-555555555555", validFrom: "2026-08-01T00:00:00.000Z", workforcePersonId: personId }], version: "current" };
}

function fixture(initial = policy()) {
  const publisher = { publish: vi.fn().mockResolvedValue({}) };
  return {
    port: createAuthorizationGrantPort({ clock: () => new Date("2026-08-02T00:00:00.000Z"), publisher, resolveActiveAssignmentIds: vi.fn().mockResolvedValue([assignmentId]), store: { currentVersion: vi.fn().mockResolvedValue("current"), load: vi.fn().mockResolvedValue(initial) } }),
    publisher,
  };
}

describe("authorization grant port", () => {
  it("reads independent super administrator grants", async () => {
    await expect(fixture().port.isSuperAdministrator(personId)).resolves.toBe(true);
  });

  it("publishes an assignment-bound CRM grant with an exact previous version", async () => {
    const { port, publisher } = fixture();
    await port.setGrant({ actor: { actorId: "subject:opaque", actorType: "authenticated_subject" }, assignmentId, enabled: true, operationId, traceId: "1".repeat(32), workforcePersonId: personId });
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    const command = publisher.publish.mock.calls[0]?.[0] as { contractVersion?: string; expectedPreviousVersion?: string; snapshot?: AuthorizationPolicySnapshot } | undefined;
    expect(command?.contractVersion).toBe("authorization-policy.v2");
    expect(command?.expectedPreviousVersion).toBe("current");
    expect(command?.snapshot?.version).toBe(operationId);
    expect(command?.snapshot?.grants).toEqual([expect.objectContaining({ roleId, subject: { assignmentId, kind: "assignment" } })]);
  });

  it("closes the active grant instead of deleting history", async () => {
    const existing = { grantId: "66666666-6666-4666-8666-666666666666", roleId, subject: { assignmentId, kind: "assignment" as const }, validFrom: "2026-08-01T00:00:00.000Z" };
    const { port, publisher } = fixture(policy([existing]));
    await port.setGrant({ actor: { actorId: "subject:opaque", actorType: "authenticated_subject" }, assignmentId, enabled: false, operationId, traceId: "1".repeat(32), workforcePersonId: personId });
    const command = publisher.publish.mock.calls[0]?.[0] as { snapshot?: AuthorizationPolicySnapshot } | undefined;
    expect(command?.snapshot?.grants[0]).toEqual({ ...existing, validTo: "2026-08-02T00:00:00.000Z" });
  });
});
