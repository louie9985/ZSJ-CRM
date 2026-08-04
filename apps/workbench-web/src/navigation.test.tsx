import { describe, expect, it } from "vitest";
import { getNavigationSelection, matchNavigation, navigationFor } from "./navigation";

describe("workbench navigation", () => {
  it("uses the six fixed primary categories but hides empty authorized categories", () => {
    const expected = ["工作台", "日历", "审批", "通知", "邮件", "设置"];
    expect(navigationFor().map((item) => item.label)).toEqual(expected);
    expect(navigationFor([])).toEqual([]);
    expect(navigationFor(["crm.workforce-administration"]).map((item) => item.label)).toEqual(["工作台"]);
    expect(navigationFor(["crm.workforce-administration"])[0]?.children?.map((item) => item.label)).toEqual(["员工账号管理"]);
  });

  it("intersects every public secondary item with server navigation ids", () => {
    const result = navigationFor(["crm.calendar.schedule", "crm.notifications.all", "crm.settings.profile"]);
    expect(result.map(({ label, children }) => ({ label, children: children?.map((child) => child.label) }))).toEqual([
      { label: "日历", children: ["我的日程"] },
      { label: "通知", children: ["全部通知"] },
      { label: "设置", children: ["个人信息"] },
    ]);
  });

  it("combines profile content and authorized administration tools in the workbench", () => {
    expect(navigationFor(["crm.workspace.unconfigured"])[0]?.children?.map((item) => item.label)).toEqual(["工作概览"]);
    expect(navigationFor(["crm.workspace.unconfigured"], ["crm.workspace.unknown"])).toEqual([]);
    expect(navigationFor(["crm.workspace.unconfigured", "crm.workforce-administration"])[0]?.children?.map((item) => item.label)).toEqual(["工作概览", "员工账号管理"]);
    expect(navigationFor(["crm.settings.profile", "crm.workforce-administration"]).find((item) => item.label === "设置")?.children?.map((item) => item.label)).toEqual(["个人信息"]);
  });

  it("matches a nested location using the longest registered prefix", () => {
    expect(matchNavigation("/crm/mail/draft/synthetic-reference")?.key).toBe("/crm/mail/draft");
  });

  it("does not claim an unknown route as the workbench home", () => {
    expect(matchNavigation("/not-registered")).toBeUndefined();
  });

  it("does not match a partial path segment", () => {
    expect(matchNavigation("/crm/mailbox")).toBeUndefined();
  });

  it("returns the selected leaf and its two-level navigation parent", () => {
    expect(getNavigationSelection("/crm/approvals/todo/synthetic-reference")).toEqual({
      openKeys: ["/crm/approvals"],
      selectedKey: "/crm/approvals/todo",
    });
    expect(getNavigationSelection("/crm/workforce-administration", navigationFor(["crm.workforce-administration"]))).toEqual({
      openKeys: ["/crm/workspace"],
      selectedKey: "/crm/workforce-administration",
    });
  });
});
