import type {EmailFolder} from "../data/email";

import {Tray} from "@gravity-ui/icons";

export interface EmptyStateProps {
  folder: EmailFolder;
}

export function EmptyState({folder}: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="bg-surface shadow-surface flex size-12 items-center justify-center rounded-2xl">
        <Tray className="text-muted size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-base font-semibold">未打开邮件</h2>
        <p className="text-muted max-w-[320px] text-sm">
          从{folder.label}中选择一封邮件，在这里查看内容。本页面使用 Mock 数据，所有发送与删除操作均不会影响真实邮件。
        </p>
      </div>
    </div>
  );
}
