"use client";

import type {EmailFolder, EmailLabel} from "../data/email";

import {PencilToLine} from "@gravity-ui/icons";
import {Avatar, Button, Chip} from "@heroui/react";
import {Sidebar} from "@heroui-pro/react";

import {FOLDERS, FOLDER_UNREAD_COUNTS, LABELS} from "../data/email";

const LABEL_TONE_CLASS: Record<EmailLabel["tone"], string> = {
  accent: "bg-accent",
  danger: "bg-danger",
  default: "bg-muted",
  success: "bg-success",
  warning: "bg-warning",
};

export interface EmailSidebarProps {
  pathname: string;
  basePath: string;
  disableNavigation?: boolean;
  onCompose?: () => void;
}

export function EmailSidebar({
  basePath,
  disableNavigation = false,
  onCompose,
  pathname,
}: EmailSidebarProps) {
  return (
    <>
      <Sidebar>
        <SidebarContents
          basePath={basePath}
          disableNavigation={disableNavigation}
          pathname={pathname}
          onCompose={onCompose}
        />
      </Sidebar>
      <Sidebar.Mobile>
        <SidebarContents
          basePath={basePath}
          disableNavigation={disableNavigation}
          idPrefix="mobile-"
          pathname={pathname}
          onCompose={onCompose}
        />
      </Sidebar.Mobile>
    </>
  );
}

interface SidebarContentsProps {
  basePath: string;
  disableNavigation: boolean;
  pathname: string;
  idPrefix?: string;
  onCompose?: () => void;
}

function SidebarContents({
  basePath,
  disableNavigation,
  idPrefix = "",
  onCompose,
  pathname,
}: SidebarContentsProps) {
  return (
    <>
      <Sidebar.Header>
        <div className="flex items-center gap-3 px-1 py-1">
          <Avatar className="size-9">
            <Avatar.Image
              alt="我"
              src="https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/blue-light.jpg"
            />
            <Avatar.Fallback>Y</Avatar.Fallback>
          </Avatar>
          <div className="flex min-w-0 flex-col" data-sidebar="label">
            <span className="text-foreground text-sm font-medium leading-tight">我</span>
            <span className="text-muted text-xs font-medium leading-tight">you@heroui.dev</span>
          </div>
        </div>
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
          <Sidebar.Menu aria-label="邮件文件夹">
            {FOLDERS.map((folder) => (
              <FolderMenuItem
                key={folder.id}
                basePath={basePath}
                disableNavigation={disableNavigation}
                folder={folder}
                idPrefix={idPrefix}
                pathname={pathname}
              />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
        <Sidebar.Separator />
        <Sidebar.Group>
          <Sidebar.GroupLabel>标签</Sidebar.GroupLabel>
          <div className="flex flex-col gap-0.5 px-2 py-1">
            {LABELS.map((label) => (
              <div
                key={label.id}
                className="flex min-h-8 items-center gap-2 px-2 text-sm"
                data-sidebar="label"
              >
                <span className={`size-2 shrink-0 rounded-full ${LABEL_TONE_CLASS[label.tone]}`} />
                <span className="text-foreground">{label.label}</span>
              </div>
            ))}
          </div>
        </Sidebar.Group>
      </Sidebar.Content>
      <Sidebar.Footer>
        <div className="px-2 pb-1">
          <Button fullWidth size="sm" onPress={onCompose}>
            <PencilToLine className="size-4" />
            新邮件
          </Button>
        </div>
      </Sidebar.Footer>
    </>
  );
}

interface FolderMenuItemProps {
  basePath: string;
  disableNavigation: boolean;
  folder: EmailFolder;
  idPrefix: string;
  pathname: string;
}

function FolderMenuItem({
  basePath,
  disableNavigation,
  folder,
  idPrefix,
  pathname,
}: FolderMenuItemProps) {
  const Icon = folder.icon;
  const fullHref = `${basePath}/${folder.id}`;
  const isCurrent =
    pathname === fullHref ||
    pathname === `${fullHref}/` ||
    pathname.startsWith(`${fullHref}/`) ||
    (folder.id === "inbox" &&
      (pathname === basePath || pathname === `${basePath}/` || pathname === "/"));
  const unreadCount = FOLDER_UNREAD_COUNTS[folder.id];

  return (
    <Sidebar.MenuItem
      href={disableNavigation ? undefined : fullHref}
      id={`${idPrefix}${folder.id}`}
      isCurrent={isCurrent}
      textValue={folder.label}
    >
      <Sidebar.MenuIcon>
        <Icon className="size-4" />
      </Sidebar.MenuIcon>
      <Sidebar.MenuLabel>{folder.label}</Sidebar.MenuLabel>
      {unreadCount > 0 ? (
        <Sidebar.MenuChip>
          <Chip size="sm" variant="soft">
            {unreadCount}
          </Chip>
        </Sidebar.MenuChip>
      ) : null}
    </Sidebar.MenuItem>
  );
}
