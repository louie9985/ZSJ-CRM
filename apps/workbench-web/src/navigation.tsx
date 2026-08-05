import {
  AuditOutlined,
  BellOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  ExportOutlined,
  FileOutlined,
  FormOutlined,
  GlobalOutlined,
  HomeOutlined,
  InboxOutlined,
  MailOutlined,
  ScheduleOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export interface NavigationItem {
  key: string;
  label: string;
  icon: ReactNode;
  navigationId?: string;
  children?: NavigationItem[];
}

export const workforceAdministrationNavigation: NavigationItem = { icon: <TeamOutlined />, key: "/crm/workforce-administration", label: "员工账号管理", navigationId: "crm.workforce-administration" };
export const notificationTemplateNavigation: NavigationItem = { icon: <FormOutlined />, key: "/crm/notifications/templates", label: "通知模板", navigationId: "crm.notification-templates" };

const workspaceItems: readonly NavigationItem[] = [
  { key: "/crm/workspace", label: "工作概览", icon: <HomeOutlined />, navigationId: "crm.workspace.unconfigured" },
];

const administrationWorkspaceItems: readonly NavigationItem[] = [
  workforceAdministrationNavigation,
];

const publicNavigation: readonly NavigationItem[] = [
  {
    key: "/crm/calendar", label: "日历", icon: <CalendarOutlined />, children: [
      { key: "/crm/calendar/schedule", label: "我的日程", icon: <ScheduleOutlined />, navigationId: "crm.calendar.schedule" },
      { key: "/crm/calendar/interview-plan", label: "采访排期", icon: <ClockCircleOutlined />, navigationId: "crm.calendar.interview-plan" },
    ],
  },
  {
    key: "/crm/approvals", label: "审批", icon: <AuditOutlined />, children: [
      { key: "/crm/approvals/mine", label: "我发起的", icon: <ExportOutlined />, navigationId: "crm.approvals.mine" },
      { key: "/crm/approvals/todo", label: "待我审批", icon: <CheckSquareOutlined />, navigationId: "crm.approvals.todo" },
      { key: "/crm/approvals/all", label: "全部审批", icon: <UnorderedListOutlined />, navigationId: "crm.approvals.all" },
    ],
  },
  {
    key: "/crm/notifications", label: "通知", icon: <BellOutlined />, children: [
      { key: "/crm/notifications/all", label: "全部通知", icon: <BellOutlined />, navigationId: "crm.notifications.all" },
      { key: "/crm/notifications/todo", label: "待办提醒", icon: <ClockCircleOutlined />, navigationId: "crm.notifications.todo" },
      { key: "/crm/notifications/system", label: "系统 / 外部", icon: <GlobalOutlined />, navigationId: "crm.notifications.system" },
      notificationTemplateNavigation,
    ],
  },
  {
    key: "/crm/mail", label: "邮件", icon: <MailOutlined />, children: [
      { key: "/crm/mail/inbox", label: "收件箱", icon: <InboxOutlined />, navigationId: "crm.mail.inbox" },
      { key: "/crm/mail/sent", label: "已发送", icon: <SendOutlined />, navigationId: "crm.mail.sent" },
      { key: "/crm/mail/draft", label: "草稿箱", icon: <FileOutlined />, navigationId: "crm.mail.draft" },
    ],
  },
  {
    key: "/crm/settings", label: "设置", icon: <SettingOutlined />, children: [
      { key: "/crm/settings/system", label: "系统设置", icon: <SettingOutlined />, navigationId: "crm.settings.system" },
      { key: "/crm/settings/profile", label: "个人信息", icon: <UserOutlined />, navigationId: "crm.settings.profile" },
    ],
  },
];

function permitted(item: NavigationItem, ids: ReadonlySet<string> | undefined): boolean {
  return ids === undefined || (item.navigationId !== undefined && ids.has(item.navigationId));
}

export function navigationFor(ids?: readonly string[], workspaceNavigationIds: readonly string[] = ["crm.workspace.unconfigured"]): NavigationItem[] {
  const allowed = ids === undefined ? undefined : new Set(ids);
  const profileIds = new Set(workspaceNavigationIds);
  const profileItems = workspaceItems.filter((item) => item.navigationId !== undefined && profileIds.has(item.navigationId) && permitted(item, allowed));
  const administrationItems = administrationWorkspaceItems.filter((item) => permitted(item, allowed));
  const workbenchChildren = [...profileItems, ...administrationItems];
  const primary: NavigationItem[] = workbenchChildren.length === 0 ? [] : [{ key: "/crm/workspace", label: "工作台", icon: <HomeOutlined />, children: [...workbenchChildren] }];
  for (const category of publicNavigation) {
    const children = (category.children ?? []).filter((item) => permitted(item, allowed));
    if (children.length > 0) primary.push({ ...category, children });
  }
  return primary;
}

export const navigation: NavigationItem[] = navigationFor();

export function flattenNavigation(items: NavigationItem[] = navigation): NavigationItem[] {
  return items.flatMap((item) => [item, ...flattenNavigation(item.children ?? [])]);
}

export function matchNavigation(pathname: string, items: NavigationItem[] = navigation): NavigationItem | undefined {
  return flattenNavigation(items).filter((item) => pathname === item.key || pathname.startsWith(`${item.key}/`)).sort((left, right) => right.key.length - left.key.length)[0];
}

export function getNavigationSelection(pathname: string, items: NavigationItem[] = navigation): { openKeys: string[]; selectedKey?: string } {
  const matched = matchNavigation(pathname, items);
  if (matched === undefined) return { openKeys: [] };
  const parent = items.find((item) => item.children?.some((child) => child.key === matched.key));
  return { openKeys: parent === undefined ? [] : [parent.key], selectedKey: matched.key };
}
