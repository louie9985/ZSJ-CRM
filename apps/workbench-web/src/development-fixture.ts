import type { BootstrapResult, PlatformCollection, WorkforceAdministrationSnapshot, WorkbenchPort } from "./workbench-port";

function collection(title: string, prefix: string, statuses: string[]): PlatformCollection {
  return {
    title,
    fixture: true,
    statuses,
    items: Array.from({ length: 7 }, (_, index) => ({
      id: `fixture-${prefix}-${String(index + 1).padStart(2, "0")}`,
      title: `合成${title} ${String(index + 1)}`,
      status: statuses[index % statuses.length] ?? "可用",
      summary: "仅用于验证平台壳层、URL 状态与主从视图。",
      tab: index < 5 ? "active" : "history",
    })),
  };
}

const fixture: BootstrapResult & { kind: "ready" } = {
  kind: "ready",
  fixture: true,
  context: { accountKind: "system_administrator", displayName: "ZSJ系统管理员", sessionScope: "fixture-session-01" },
  counts: { tasks: 7, notifications: 7, forms: 7, files: 7 },
  collections: {
    tasks: collection("任务", "task", ["待处理", "处理中", "已关闭"]),
    notifications: collection("通知", "notification", ["未读", "已读"]),
    forms: collection("表单", "form", ["可填写", "已停用"]),
    files: collection("文件引用", "file", ["可用", "处理中"]),
  },
};

const workforceFixture: WorkforceAdministrationSnapshot = Object.freeze({
  accounts: Object.freeze([
    Object.freeze({
      accountId: "22222222-2222-4222-8222-222222222222",
      allowedActions: Object.freeze([]),
      crmAdministrator: true,
      departmentId: "33333333-3333-4333-8333-333333333333",
      departmentName: "AI应用部",
      legalName: "CRM系统管理员",
      phone: "+8613800000000",
      releasablePhones: Object.freeze([]),
      positionId: "44444444-4444-4444-8444-444444444444",
      positionName: "系统管理岗",
      revision: 1,
      status: "active" as const,
      username: "crm.admin",
    }),
  ]),
  departments: Object.freeze([
    Object.freeze({ allowedActions: Object.freeze([]), departmentId: "11111111-1111-4111-8111-111111111111", name: "ZSJ", revision: 1, status: "active" as const }),
    Object.freeze({ allowedActions: Object.freeze(["edit"] as const), departmentId: "33333333-3333-4333-8333-333333333333", name: "AI应用部", parentDepartmentId: "11111111-1111-4111-8111-111111111111", revision: 1, status: "active" as const }),
  ]),
  positions: Object.freeze([
    Object.freeze({ allowedActions: Object.freeze(["edit"] as const), departmentId: "33333333-3333-4333-8333-333333333333", name: "系统管理岗", positionId: "44444444-4444-4444-8444-444444444444", revision: 1, status: "active" as const }),
  ]),
  systemAccount: Object.freeze({
    accountId: "11111111-2222-4111-8111-111111111111",
    allowedActions: Object.freeze(["edit"] as const),
    crmAdministrator: false,
    legalName: "ZSJ系统管理员",
    releasablePhones: Object.freeze([]),
    revision: 1,
    status: "active" as const,
    username: "zsj.admin",
  }),
});

export const developmentFixturePort: WorkbenchPort = {
  beginLogin: () => undefined,
  bootstrap: () => Promise.resolve(fixture),
  logout: () => Promise.resolve({ kind: "logged-out" }),
  workforceAdministration: {
    execute: (command) => Promise.resolve(command.kind === "create_account" || command.kind === "reset_password" || command.kind === "reactivate_account"
      ? { credentialRedirectUrl: "/auth/credential-ceremony/fixture" }
      : {}),
    listAccounts: (query) => Promise.resolve({ items: workforceFixture.accounts.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), page: query.page, pageSize: query.pageSize, total: workforceFixture.accounts.length }),
    load: () => Promise.resolve(workforceFixture),
  },
};
