import { createHash } from "node:crypto";

import type { FixedRoleGrantStore, FixedRoleKey } from "@ai-crm/crm-authorization";

export interface FixedRoleAdministrationGrantPort {
  grantApplicationUser(input: Readonly<{ assignmentId: string; operationId: string; workforcePersonId: string }>): Promise<void>;
  hasCrmAdministrator(workforcePersonId: string, assignmentId?: string): Promise<boolean>;
  isSystemAdministrator(workforcePersonId: string): Promise<boolean>;
  moveApplicationUser(input: Readonly<{ assignmentId: string; closeAssignmentIds: readonly string[]; operationId: string; workforcePersonId: string }>): Promise<void>;
  setCrmAdministrator(input: Readonly<{ assignmentId: string; enabled: boolean; operationId: string; workforcePersonId: string }>): Promise<void>;
}

function uuid(source: string): string {
  const hex = createHash("sha256").update(source).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function createFixedRoleAdministrationGrantPort(
  store: FixedRoleGrantStore,
  clock: () => Date = () => new Date(),
): Readonly<FixedRoleAdministrationGrantPort> {
  const now = (): string => {
    const value = clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error("authorization_grant_clock_invalid");
    return value.toISOString();
  };
  const active = (workforcePersonId: string, at: string) => store.listActive(workforcePersonId, at);
  const grant = async (input: Readonly<{ assignmentId?: string; operationId: string; roleKey: FixedRoleKey; workforcePersonId: string }>, at: string): Promise<void> => {
    await store.grant({
      ...(input.assignmentId === undefined ? {} : { assignmentId: input.assignmentId }),
      grantId: uuid(`${input.operationId}:${input.roleKey}:${input.assignmentId ?? "global"}`),
      grantedAt: at,
      operationId: input.operationId,
      roleKey: input.roleKey,
      workforcePersonId: input.workforcePersonId,
    });
  };
  const revoke = async (workforcePersonId: string, roleKey: FixedRoleKey, assignmentIds: ReadonlySet<string>, at: string): Promise<void> => {
    const matches = (await active(workforcePersonId, at)).filter((item) => item.roleKey === roleKey && item.assignmentId !== undefined && assignmentIds.has(item.assignmentId));
    await Promise.all(matches.map(({ grantId }) => store.revoke({ grantId, revokedAt: at })));
  };
  return Object.freeze({
    async grantApplicationUser(input: Parameters<FixedRoleAdministrationGrantPort["grantApplicationUser"]>[0]) {
      await grant({ ...input, roleKey: "application_user" }, now());
    },
    async hasCrmAdministrator(workforcePersonId: string, assignmentId?: string) {
      const at = now();
      return (await active(workforcePersonId, at)).some((item) => item.roleKey === "crm_administrator" && (assignmentId === undefined || item.assignmentId === assignmentId));
    },
    async isSystemAdministrator(workforcePersonId: string) {
      const at = now();
      return (await active(workforcePersonId, at)).some(({ roleKey }) => roleKey === "system_administrator");
    },
    async moveApplicationUser(input: Parameters<FixedRoleAdministrationGrantPort["moveApplicationUser"]>[0]) {
      const at = now();
      await revoke(input.workforcePersonId, "application_user", new Set(input.closeAssignmentIds), at);
      await grant({ assignmentId: input.assignmentId, operationId: input.operationId, roleKey: "application_user", workforcePersonId: input.workforcePersonId }, at);
    },
    async setCrmAdministrator(input: Parameters<FixedRoleAdministrationGrantPort["setCrmAdministrator"]>[0]) {
      const at = now();
      const matching = (await active(input.workforcePersonId, at)).filter((item) => item.roleKey === "crm_administrator" && item.assignmentId === input.assignmentId);
      if (input.enabled) {
        if (matching.length === 0) await grant({ assignmentId: input.assignmentId, operationId: input.operationId, roleKey: "crm_administrator", workforcePersonId: input.workforcePersonId }, at);
      } else {
        await Promise.all(matching.map(({ grantId }) => store.revoke({ grantId, revokedAt: at })));
      }
    },
  });
}
