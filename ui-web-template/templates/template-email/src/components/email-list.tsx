"use client";

import type {EmailFolder, EmailThread} from "../data/email";

import {ScrollShadow, SearchField} from "@heroui/react";
import {AppLayout} from "@heroui-pro/react";

import {EmailListItem} from "./email-list-item";

export interface EmailListProps {
  folder: EmailFolder;
  threads: readonly EmailThread[];
  basePath: string;
  disableNavigation?: boolean;
  currentThreadId?: string;
}

export function EmailList({
  basePath,
  currentThreadId,
  disableNavigation = false,
  folder,
  threads,
}: EmailListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-clip px-2 pb-2 pt-4">
      <div className="flex items-center gap-2 pr-11">
        <AppLayout.MenuToggle className="ml-0" />
        <SearchField
          aria-label={`搜索${folder.label}`}
          className="flex-1"
          name="folder-search"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="搜索..." />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      <ScrollShadow hideScrollBar className="min-h-0 flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <p className="text-foreground text-sm font-medium">这里还没有邮件</p>
            <p className="text-muted max-w-[220px] text-xs">
              新邮件进入{folder.label}后会显示在这里。
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {threads.map((thread) => (
              <EmailListItem
                key={thread.id}
                disableNavigation={disableNavigation}
                href={`${basePath}/${folder.id}/${thread.id}`}
                isActive={thread.id === currentThreadId}
                thread={thread}
              />
            ))}
          </ul>
        )}
      </ScrollShadow>
    </div>
  );
}
