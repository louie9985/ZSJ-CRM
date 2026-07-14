"use client";

import {FileText, Xmark} from "@gravity-ui/icons";
import {Button} from "@heroui/react";

export type ChatAttachmentListItem = {
  id?: string;
  mimeType?: string;
  name: string;
  src?: string;
};

export interface ChatAttachmentListProps {
  attachments: readonly ChatAttachmentListItem[];
  className?: string;
  removeLabel?: string;
  onRemove?: (attachment: ChatAttachmentListItem) => void;
}

function isImageAttachment(attachment: ChatAttachmentListItem) {
  return Boolean(attachment.src && attachment.mimeType?.startsWith("image/"));
}

function composeClassName(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ChatAttachmentList({
  attachments,
  className,
  onRemove,
  removeLabel = "Remove attachment",
}: ChatAttachmentListProps) {
  if (!attachments.length) return null;

  return (
    <div className={composeClassName("flex flex-wrap gap-2", className)}>
      {attachments.map((attachment, index) => (
        <div
          key={attachment.id ?? `${attachment.name}-${index}`}
          className="border-border bg-default/60 text-foreground flex h-10 min-w-0 max-w-64 items-center gap-2 rounded-lg border px-1.5 pr-2"
        >
          {isImageAttachment(attachment) ? (
            <img alt="" className="size-7 shrink-0 rounded-md object-cover" src={attachment.src} />
          ) : (
            <span className="bg-background text-muted flex size-7 shrink-0 items-center justify-center rounded-md">
              <FileText className="size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{attachment.name}</span>
          {onRemove ? (
            <Button
              isIconOnly
              aria-label={`${removeLabel}: ${attachment.name}`}
              className="-mr-1 size-6 min-w-6"
              size="sm"
              variant="ghost"
              onPress={() => onRemove(attachment)}
            >
              <Xmark className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
