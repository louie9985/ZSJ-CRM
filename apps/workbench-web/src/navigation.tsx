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
  children?: NavigationItem[];
}

export const workforceAdministrationNavigation: NavigationItem = {
  icon: <TeamOutlined />,
  key: "/crm/workforce-administration",
  label: "员工账号管理",
};

const sharedNavigation: NavigationItem[] = [
  {
    key: "/crm/calendar",
    label: "日历",
    icon: <CalendarOutlined />,
    children: [
      { key: "/crm/calendar/schedule", label: "我的日程", icon: <ScheduleOutlined /> },
      { key: "/crm/calendar/interview-plan", label: "采访排期", icon: <ClockCircleOutlined /> },
    ],
  },
  {
    key: "/crm/approvals",
    label: "审批",
    icon: <AuditOutlined />,
    children: [
      { key: "/crm/approvals/mine", label: "我发起的", icon: <ExportOutlined /> },
      { key: "/crm/approvals/todo", label: "待我审批", icon: <CheckSquareOutlined /> },
      { key: "/crm/approvals/all", label: "全部审批", icon: <UnorderedListOutlined /> },
    ],
  },
  {
    key: "/crm/notifications",
    label: "通知",
    icon: <BellOutlined />,
    children: [
      { key: "/crm/notifications/all", label: "全部通知", icon: <BellOutlined /> },
      { key: "/crm/notifications/todo", label: "待办提醒", icon: <ClockCircleOutlined /> },
      { key: "/crm/notifications/system", label: "系统 / 外部", icon: <GlobalOutlined /> },
    ],
  },
  {
    key: "/crm/mail",
    label: "邮件",
    icon: <MailOutlined />,
    children: [
      { key: "/crm/mail/inbox", label: "收件箱", icon: <InboxOutlined /> },
      { key: "/crm/mail/sent", label: "已发送", icon: <SendOutlined /> },
      { key: "/crm/mail/draft", label: "草稿箱", icon: <FileOutlined /> },
    ],
  },
  {
    key: "/crm/settings",
    label: "设置",
    icon: <SettingOutlined />,
    children: [
      { key: "/crm/settings/system", label: "系统设置", icon: <SettingOutlined /> },
      { key: "/crm/settings/profile", label: "个人信息", icon: <UserOutlined /> },
    ],
  },
];

function workbenchNavigation(ids?: readonly string[]): NavigationItem {
  const showPlatformFixtures = ids === undefined;
  const children: NavigationItem[] = [
    { key: "/crm/workspace", label: "工作概览", icon: <HomeOutlined /> },
    ...(showPlatformFixtures
      ? [
        { key: "/crm/tasks", label: "统一任务", icon: <CheckSquareOutlined /> },
        { key: "/crm/forms", label: "表单", icon: <FormOutlined /> },
        { key: "/crm/files", label: "文件", icon: <FileOutlined /> },
      ]
      : []),
    ...(ids?.includes("crm.workforce-administration") === true ? [workforceAdministrationNavigation] : []),
  ];
  return { key: "/crm/workspace", label: "工作台", icon: <HomeOutlined />, children };
}

export const navigation: NavigationItem[] = [workbenchNavigation(), ...sharedNavigation];

export function navigationFor(ids?: readonly string[]): NavigationItem[] {
  return [workbenchNavigation(ids), ...sharedNavigation];
}

export function flattenNavigation(items: NavigationItem[] = navigation): NavigationItem[] {
  return items.flatMap((item) => [item, ...flattenNavigation(item.children ?? [])]);
}

export function matchNavigation(pathname: string, items: NavigationItem[] = navigation): NavigationItem | undefined {
  return flattenNavigation(items)
    .filter((item) => pathname === item.key || pathname.startsWith(`${item.key}/`))
    .sort((left, right) => right.key.length - left.key.length)[0];
}

export function getNavigationSelection(pathname: string, items: NavigationItem[] = navigation): { openKeys: string[]; selectedKey?: string } {
  const matched = matchNavigation(pathname, items);
  if (matched === undefined) return { openKeys: [] };
  const parent = items.find((item) => item.children?.some((child) => child.key === matched.key));
  return {
    openKeys: parent === undefined ? [] : [parent.key],
    selectedKey: matched.key,
  };
}
