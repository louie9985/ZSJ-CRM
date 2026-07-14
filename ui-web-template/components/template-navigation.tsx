"use client";

import type {ComponentType} from "react";

import {ChartColumn, CreditCard, LogoTelegram, Tray} from "@gravity-ui/icons";
import {Button, Tooltip} from "@heroui/react";
import {usePathname, useRouter} from "next/navigation";

interface TemplateLink {
  href: string;
  icon: ComponentType<{className?: string}>;
  label: string;
}

const TEMPLATE_LINKS: TemplateLink[] = [
  {href: "/dashboard", icon: ChartColumn, label: "数据看板"},
  {href: "/email", icon: Tray, label: "邮件"},
  {href: "/chat", icon: LogoTelegram, label: "智能助手"},
  {href: "/finances", icon: CreditCard, label: "财务"},
];

export function TemplateNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside
      aria-label="模板导航"
      className="border-separator bg-surface relative z-50 flex h-dvh w-16 shrink-0 flex-col items-center border-r px-2 py-3"
    >
      <div
        aria-label="AI-CRM"
        className="bg-accent text-accent-foreground mb-5 flex size-10 items-center justify-center rounded-xl text-xs font-bold"
      >
        CRM
      </div>
      <nav className="flex w-full flex-col items-center gap-2">
        {TEMPLATE_LINKS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Tooltip key={item.href} delay={0}>
              <Button
                isIconOnly
                aria-label={item.label}
                className="size-10"
                variant={isActive ? "primary" : "ghost"}
                onPress={() => router.push(item.href)}
              >
                <Icon className="size-5" />
              </Button>
              <Tooltip.Content placement="right">{item.label}</Tooltip.Content>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
