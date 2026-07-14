"use client";

import type {ChatNavItem, ChatNavItemId, ChatThread} from "../data/chat";

import {Comment} from "@gravity-ui/icons";
import {Avatar, Kbd} from "@heroui/react";
import {Sidebar} from "@heroui-pro/react";

import {CHAT_NAV_ITEMS, DEFAULT_CHAT_THREAD_ID, resolveChatActivePage} from "../data/chat";

export interface ChatSidebarProps {
  threads: readonly ChatThread[];
  pathname: string;
  basePath: string;
  disableNavigation?: boolean;
  onAction?: (id: ChatNavItemId) => void;
}

export function ChatSidebar({
  basePath,
  disableNavigation = false,
  onAction,
  pathname,
  threads,
}: ChatSidebarProps) {
  const contentProps = {
    basePath,
    disableNavigation,
    onAction,
    pathname,
    threads,
  };

  return (
    <>
      <Sidebar>
        <SidebarContents {...contentProps} />
        <Sidebar.Rail />
      </Sidebar>
      <Sidebar.Mobile>
        <SidebarContents {...contentProps} idPrefix="mobile-" />
      </Sidebar.Mobile>
    </>
  );
}

interface SidebarContentsProps extends ChatSidebarProps {
  idPrefix?: string;
}

function SidebarContents({
  basePath,
  disableNavigation,
  idPrefix = "",
  onAction,
  pathname,
  threads,
}: SidebarContentsProps) {
  const activePage = resolveChatActivePage(pathname, basePath);

  return (
    <>
      <Sidebar.Header>
        <div className="flex items-center gap-3 px-1 py-1">
          <Avatar className="size-9">
            <Avatar.Image alt={threads[0]?.user.name ?? "User"} src={threads[0]?.user.avatar} />
            <Avatar.Fallback>DH</Avatar.Fallback>
          </Avatar>
          <div className="flex min-w-0 flex-col" data-sidebar="label">
            <span className="text-foreground text-sm font-medium leading-tight">
              {threads[0]?.user.name ?? "Darnell Howe"}
            </span>
            <span className="text-muted text-xs font-medium leading-tight">
              {threads[0]?.user.email ?? "darnell@email.com"}
            </span>
          </div>
        </div>
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
          <Sidebar.Menu aria-label="对话操作">
            {CHAT_NAV_ITEMS.map((item) => (
              <ChatSidebarActionItem
                key={item.id}
                activePageKind={activePage.kind}
                basePath={basePath}
                disableNavigation={disableNavigation ?? false}
                idPrefix={idPrefix}
                item={item}
                onAction={onAction}
              />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
        <Sidebar.Separator />
        <Sidebar.Group>
          <Sidebar.GroupLabel>最近对话</Sidebar.GroupLabel>
          <Sidebar.Menu aria-label="最近对话">
            {threads.map((thread) => (
              <ChatSidebarThreadItem
                key={thread.id}
                basePath={basePath}
                disableNavigation={disableNavigation ?? false}
                idPrefix={idPrefix}
                pathname={pathname}
                thread={thread}
              />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>
    </>
  );
}

interface ChatSidebarActionItemProps {
  activePageKind: ReturnType<typeof resolveChatActivePage>["kind"];
  basePath: string;
  disableNavigation: boolean;
  idPrefix: string;
  item: ChatNavItem;
  onAction?: (id: ChatNavItemId) => void;
}

function ChatSidebarActionItem({
  activePageKind,
  basePath,
  disableNavigation,
  idPrefix,
  item,
  onAction,
}: ChatSidebarActionItemProps) {
  const Icon = item.icon;
  const fullHref = item.href ? basePath + item.href : undefined;
  const isCurrent = activePageKind !== "thread" && item.id === activePageKind;

  const handlePress = () => {
    if (disableNavigation) return;
    onAction?.(item.id);
  };

  return (
    <Sidebar.MenuItem
      href={item.href && !disableNavigation ? fullHref : undefined}
      id={`${idPrefix}${item.id}`}
      isCurrent={Boolean(isCurrent)}
      textValue={item.label}
      onPress={handlePress}
    >
      <Sidebar.MenuIcon>
        <Icon className="size-4" />
      </Sidebar.MenuIcon>
      <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
      {item.shortcut ? (
        <Sidebar.MenuChip>
          <Kbd className="text-[11px]">{item.shortcut}</Kbd>
        </Sidebar.MenuChip>
      ) : null}
    </Sidebar.MenuItem>
  );
}

interface ChatSidebarThreadItemProps {
  basePath: string;
  disableNavigation: boolean;
  idPrefix: string;
  pathname: string;
  thread: ChatThread;
}

function ChatSidebarThreadItem({
  basePath,
  disableNavigation,
  idPrefix,
  pathname,
  thread,
}: ChatSidebarThreadItemProps) {
  const fullHref = `${basePath}/${thread.id}`;
  const isCurrent =
    pathname === fullHref ||
    pathname === thread.id ||
    pathname === `/${thread.id}` ||
    (thread.id === DEFAULT_CHAT_THREAD_ID &&
      (pathname === basePath || pathname === `${basePath}/` || pathname === "/"));

  return (
    <Sidebar.MenuItem
      href={disableNavigation ? undefined : fullHref}
      id={`${idPrefix}${thread.id}`}
      isCurrent={isCurrent}
      textValue={thread.title}
    >
      <Sidebar.MenuIcon>
        <Comment className="size-4" />
      </Sidebar.MenuIcon>
      <Sidebar.MenuLabel>{thread.title}</Sidebar.MenuLabel>
    </Sidebar.MenuItem>
  );
}
