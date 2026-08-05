import { describe, expect, it } from "vitest";

import { createWorkforceAuthorizationContext } from "./workforce-authorization-context.js";

const workforcePersonId = "10000000-0000-4000-8000-000000000001";
const assignmentId = "10000000-0000-4000-8000-000000000002";

describe("workforce authorization context", () => {
  it("selects the sole active Assignment for a workforce administrator", () => {
    expect(createWorkforceAuthorizationContext({
      activeAssignmentIds: [assignmentId],
      systemAdministrator: false,
      workforcePersonId,
    })).toEqual({ activeAssignmentIds: [assignmentId], selectedAssignmentId: assignmentId, workforcePersonId });
  });

  it("selects the sole active Assignment even when the account also has a global role", () => {
    expect(createWorkforceAuthorizationContext({
      activeAssignmentIds: [assignmentId],
      systemAdministrator: true,
      workforcePersonId,
    })).toEqual({ activeAssignmentIds: [assignmentId], selectedAssignmentId: assignmentId, workforcePersonId });
  });

  it("fails closed without selecting one of multiple active Assignments", () => {
    expect(createWorkforceAuthorizationContext({
      activeAssignmentIds: [assignmentId, "10000000-0000-4000-8000-000000000003"],
      systemAdministrator: false,
      workforcePersonId,
    })).toEqual({
      activeAssignmentIds: [assignmentId, "10000000-0000-4000-8000-000000000003"],
      workforcePersonId,
    });
  });

  it("rejects an explicitly selected inactive Assignment instead of falling back", () => {
    expect(() => createWorkforceAuthorizationContext({
      activeAssignmentIds: [assignmentId],
      selectedAssignmentId: "10000000-0000-4000-8000-000000000099",
      systemAdministrator: true,
      workforcePersonId,
    })).toThrow("authorization_selected_assignment_inactive");
  });
});
