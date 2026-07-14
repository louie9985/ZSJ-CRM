"use client";

import {Bell, Magnifier, PersonPlus} from "@gravity-ui/icons";
import {Button} from "@heroui/react";
import {AppLayout, Navbar, Sidebar} from "@heroui-pro/react";

import {IconButton} from "./icon-button";

export interface DashboardNavbarProps {
  /** Title rendered in the navbar. Falls back to the home-page greeting. */
  title?: string;
}

export function DashboardNavbar({title = "早上好，Kate"}: DashboardNavbarProps) {
  return (
    <Navbar maxWidth="full">
      <Navbar.Header className="pr-14">
        <AppLayout.MenuToggle />
        <Sidebar.Trigger />
        <h1 className="text-foreground truncate text-xl font-semibold">{title}</h1>
        <Navbar.Spacer />
        <div className="flex items-center gap-2">
          <IconButton label="搜索" size="sm" variant="tertiary">
            <Magnifier className="size-4" />
          </IconButton>
          <IconButton label="通知" size="sm" variant="tertiary">
            <Bell className="size-4" />
          </IconButton>
          <Button size="sm">
            <PersonPlus className="size-4" />
            邀请
          </Button>
        </div>
      </Navbar.Header>
    </Navbar>
  );
}
