"use client";

import type {EmailMessage, EmailThread} from "../data/email";

import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowShapeTurnUpLeft,
  CaretDown,
  ChevronLeft,
  EllipsisVertical,
  SquareExclamation,
  Star,
  TrashBin,
  Xmark,
} from "@gravity-ui/icons";
import {Avatar, Button, CloseButton, ScrollShadow, Separator} from "@heroui/react";
import Link from "next/link";

export interface EmailDetailProps {
  thread: EmailThread;
  /**
   * URL to navigate back to the list column. When provided, a mobile back
   * button appears in the toolbar and the close button collapses to desktop
   * only. Storybook previews omit this prop to keep the toolbar inert.
   */
  backHref?: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}

export function EmailDetail({backHref, thread}: EmailDetailProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-clip lg:py-4 lg:pl-0.5 lg:pr-4">
      <div className="lg:bg-surface lg:shadow-surface flex max-h-full flex-1 flex-col gap-6 overflow-clip p-4 lg:rounded-2xl">
        <Toolbar backHref={backHref} messageCount={thread.messages.length} />

        <ScrollShadow hideScrollBar className="min-h-0 flex-1 overflow-y-auto lg:px-6">
          <div className="flex flex-col gap-8 pb-5">
            <h1 className="text-foreground text-base font-semibold leading-normal">
              {thread.subject}
            </h1>

            {thread.messages.map((message, index) => (
              <div key={message.id} className="flex flex-col gap-6">
                {index > 0 ? <Separator /> : null}
                <ThreadMessage message={message} />
              </div>
            ))}
          </div>
        </ScrollShadow>
      </div>
    </div>
  );
}

interface ToolbarProps {
  backHref?: string;
  messageCount: number;
}

function Toolbar({backHref, messageCount}: ToolbarProps) {
  return (
    <div className="flex items-center justify-between pr-11">
      <div className="flex items-center gap-4">
        {backHref ? (
          <>
            <BackButton href={backHref} />
            <CloseLink href={backHref} />
          </>
        ) : (
          <CloseButton />
        )}
        <div className="flex items-center">
          <Button
            isIconOnly
            aria-label="删除"
            className="text-muted hover:text-foreground"
            size="sm"
            variant="ghost"
          >
            <TrashBin className="size-4" />
          </Button>
          <Button
            isIconOnly
            aria-label="标记为垃圾邮件"
            className="text-muted hover:text-foreground"
            size="sm"
            variant="ghost"
          >
            <SquareExclamation className="size-4" />
          </Button>
          <Button
            isIconOnly
            aria-label="归档"
            className="text-muted hover:text-foreground"
            size="sm"
            variant="ghost"
          >
            <Archive className="size-4" />
          </Button>
          <Button
            isIconOnly
            aria-label="更多操作"
            className="text-muted hover:text-foreground"
            size="sm"
            variant="ghost"
          >
            <EllipsisVertical className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 px-2">
        <span className="text-muted text-xs tabular-nums">第 1 封，共 {messageCount} 封</span>
        <div className="flex items-center">
          <Button
            isIconOnly
            aria-label="上一封"
            className="text-muted hover:text-foreground"
            size="sm"
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Button
            isIconOnly
            aria-label="下一封"
            className="text-muted hover:text-foreground"
            size="sm"
            variant="ghost"
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThreadMessage({message}: {message: EmailMessage}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <Avatar className="size-9 shrink-0">
            <Avatar.Image alt={message.from.name} src={message.from.avatar} />
            <Avatar.Fallback>{getInitials(message.from.name)}</Avatar.Fallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-foreground text-sm font-medium leading-tight">
              {message.from.name}
            </span>
            <span className="text-muted text-xs font-medium leading-tight">
              {message.from.email}
            </span>
            <div className="text-muted flex items-center gap-0.5 text-xs font-medium leading-tight">
              <p>发送给我</p>
              <CaretDown className="text-muted size-3" />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 px-2">
          <span className="text-muted whitespace-nowrap text-xs">{message.receivedAt}</span>
          <div className="flex items-center">
            <Button
              isIconOnly
              aria-label="回复"
              className="text-muted hover:text-foreground"
              variant="ghost"
            >
              <ArrowShapeTurnUpLeft className="size-4" />
            </Button>
            <Button
              isIconOnly
              aria-label="加星标"
              className="text-muted hover:text-foreground"
              variant="ghost"
            >
              <Star className="size-4" />
            </Button>
            <Button
              isIconOnly
              aria-label="更多"
              className="text-muted hover:text-foreground"
              variant="ghost"
            >
              <EllipsisVertical className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
        {message.body.join("\n\n")}
      </div>
    </div>
  );
}

function BackButton({href}: {href: string}) {
  return (
    <Link
      aria-label="返回列表"
      className="border-border text-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-full border transition-colors lg:hidden"
      href={href}
    >
      <ChevronLeft className="size-4" />
    </Link>
  );
}

function CloseLink({href}: {href: string}) {
  return (
    <Link
      aria-label="关闭"
      className="bg-default text-muted hover:bg-default-hover hidden size-6 shrink-0 items-center justify-center rounded-xl transition-colors lg:inline-flex"
      href={href}
    >
      <Xmark className="size-4" />
    </Link>
  );
}
