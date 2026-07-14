"use client";

import {ArrowDownToLine, ArrowsRotateLeft, Bell, PaperPlane} from "@gravity-ui/icons";
import {Button} from "@heroui/react";
import {AppLayout, Navbar, Sidebar} from "@heroui-pro/react";

import {IconButton} from "./icon-button";

export interface FinancesNavbarProps {
  /** Title rendered in the navbar. Falls back to the home-page greeting. */
  title?: string;
}

export function FinancesNavbar({title = "下午好，Fred"}: FinancesNavbarProps) {
  return (
    <Navbar maxWidth="full">
      <Navbar.Header className="pr-14">
        <AppLayout.MenuToggle />
        <Sidebar.Trigger />
        <h1 className="text-foreground truncate text-xl font-semibold">{title}</h1>
        <Navbar.Spacer />
        <div className="hidden items-center gap-2 md:flex">
          <Button size="sm" variant="tertiary">
            <ArrowsRotateLeft className="size-4" />
            兑换
          </Button>
          <Button size="sm" variant="tertiary">
            <ArrowDownToLine className="size-4" />
            收款
          </Button>
          <Button size="sm">
            <PaperPlane className="size-4" />
            转账
          </Button>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <IconButton label="通知" size="sm" variant="tertiary">
            <Bell className="size-4" />
          </IconButton>
          <Button size="sm">
            <PaperPlane className="size-4" />
            转账
          </Button>
        </div>
      </Navbar.Header>
    </Navbar>
  );
}
