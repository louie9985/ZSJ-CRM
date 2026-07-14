import type {ComponentType} from "react";

import {
  ArrowRightFromSquare,
  ChartPie,
  CircleQuestion,
  CreditCard,
  Gear,
  House,
  Percent,
  Receipt,
} from "@gravity-ui/icons";

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: ComponentType<{className?: string}>;
  readonly badge?: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {href: "/", icon: House, label: "财务概览"},
  {href: "/portfolio", icon: ChartPie, label: "投资组合"},
  {href: "/spending", icon: CreditCard, label: "支出"},
  {href: "/transactions", icon: Receipt, label: "交易记录"},
  {badge: "新", href: "/earn", icon: Percent, label: "收益"},
  {href: "/settings", icon: Gear, label: "设置"},
] as const;

export const FOOTER_ITEMS: readonly NavItem[] = [
  {href: "/help", icon: CircleQuestion, label: "帮助与信息"},
  {href: "/logout", icon: ArrowRightFromSquare, label: "退出登录"},
] as const;
