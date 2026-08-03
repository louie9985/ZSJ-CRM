import { describe, expect, it } from "vitest";
import { getNavigationSelection, matchNavigation, navigationFor } from "./navigation";

describe("workbench navigation", () => {
  it("keeps the six primary destinations fixed for every authorization view", () => {
    const expected = ["工作台", "日历", "审批", "通知", "邮件", "设置"];
    expect(navigationFor().map((item) => item.label)).toEqual(expected);
    expect(navigationFor([]).map((item) => item.label)).toEqual(expected);
    expect(navigationFor(["crm.workforce-administration"]).map((item) => item.label)).toEqual(expected);
  });

  it("uses the same secondary navigation outside the position-specific workbench", () => {
    const shared = (ids?: readonly string[]) => navigationFor(ids).slice(1).map((item) => ({
      label: item.label,
      children: item.children?.map((child) => child.label),
    }));
    expect(shared([])).toEqual(shared(["crm.workforce-administration"]));
    expect(shared()).toEqual([
      { label: "日历", children: ["我的日程", "采访排期"] },
      { label: "审批", children: ["我发起的", "待我审批", "全部审批"] },
      { label: "通知", children: ["全部通知", "待办提醒", "系统 / 外部"] },
      { label: "邮件", children: ["收件箱", "已发送", "草稿箱"] },
      { label: "设置", children: ["系统设置", "个人信息"] },
    ]);
  });

  it("keeps authorized position-specific capabilities inside the workbench", () => {
    expect(navigationFor([])[0]?.children?.map((item) => item.label)).toEqual(["工作概览"]);
    expect(navigationFor(["crm.workforce-administration"])[0]?.children?.map((item) => item.label)).toEqual(["工作概览", "员工账号管理"]);
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
  });
});
