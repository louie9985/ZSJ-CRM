"use client";

import type {EmailThread} from "../data/email";

import {Star, StarFill} from "@gravity-ui/icons";
import {Avatar, Description} from "@heroui/react";
import Link from "next/link";

export interface EmailListItemProps {
  thread: EmailThread;
  href: string;
  isActive: boolean;
  disableNavigation?: boolean;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}

export function EmailListItem({
  disableNavigation = false,
  href,
  isActive,
  thread,
}: EmailListItemProps) {
  const firstSender = thread.participants[0];
  const senderName = firstSender?.name ?? "Unknown";
  const senderAvatar = firstSender?.avatar;

  const className = `relative flex items-start gap-3 rounded-2xl p-3 transition-colors ${
    isActive ? "bg-surface shadow-surface" : "hover:bg-default/60"
  }`;

  const content = (
    <>
      <Avatar className="size-9 shrink-0">
        <Avatar.Image alt={senderName} src={senderAvatar} />
        <Avatar.Fallback>{getInitials(senderName)}</Avatar.Fallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span
            className={`truncate text-sm leading-tight ${
              !thread.isRead ? "text-foreground font-medium" : "text-foreground"
            }`}
          >
            {senderName}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`whitespace-nowrap text-xs leading-tight ${
                !thread.isRead ? "text-foreground font-medium" : "text-muted"
              }`}
            >
              {thread.updatedAt}
            </span>
            {!thread.isRead ? (
              <span aria-hidden className="bg-accent size-1.5 shrink-0 rounded-full" />
            ) : null}
          </div>
        </div>

        <Description
          className={`truncate text-xs leading-tight ${
            !thread.isRead ? "text-foreground font-medium" : "text-muted"
          }`}
        >
          {thread.subject}
        </Description>

        <Description className="text-muted truncate pr-8 text-xs leading-tight">
          {thread.preview}
        </Description>

        <div className="absolute bottom-3 right-3">
          {thread.isStarred ? (
            <StarFill className="text-warning size-4 opacity-90" />
          ) : (
            <Star className="text-muted size-4 opacity-40" />
          )}
        </div>
      </div>
    </>
  );

  return (
    <li>
      {disableNavigation ? (
        <a
          aria-current={isActive ? "page" : undefined}
          className={className}
          href={href}
          onClick={(event) => event.preventDefault()}
        >
          {content}
        </a>
      ) : (
        <Link aria-current={isActive ? "page" : undefined} className={className} href={href}>
          {content}
        </Link>
      )}
    </li>
  );
}
