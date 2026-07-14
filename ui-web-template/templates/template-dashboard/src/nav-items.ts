import type {ComponentType} from "react";

import {
  ArrowRightFromSquare,
  ChartColumn,
  CircleQuestion,
  Gear,
  House,
  ListCheck,
  Receipt,
} from "@gravity-ui/icons";

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: ComponentType<{className?: string}>;
  readonly badge?: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {href: "/", icon: House, label: "数据概览"},
  {href: "/orders", icon: Receipt, label: "订单"},
  {badge: "新", href: "/tracker", icon: ListCheck, label: "任务追踪"},
  {href: "/analytics", icon: ChartColumn, label: "数据分析"},
  {href: "/settings", icon: Gear, label: "设置"},
] as const;

export const FOOTER_ITEMS: readonly NavItem[] = [
  {href: "/help", icon: CircleQuestion, label: "帮助与信息"},
  {href: "/logout", icon: ArrowRightFromSquare, label: "退出登录"},
] as const;
