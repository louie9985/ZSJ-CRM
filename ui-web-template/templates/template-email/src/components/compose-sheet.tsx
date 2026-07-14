"use client";

import {Paperclip, TrashBin} from "@gravity-ui/icons";
import {Button, Input, Label, TextArea, TextField} from "@heroui/react";
import {Sheet} from "@heroui-pro/react";

export interface ComposeSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComposeSheet({isOpen, onOpenChange}: ComposeSheetProps) {
  return (
    <Sheet isOpen={isOpen} placement="right" onOpenChange={onOpenChange}>
      <Sheet.Backdrop>
        <Sheet.Content className="w-full md:w-[520px]">
          <Sheet.Dialog>
            <Sheet.CloseTrigger />
            <Sheet.Header>
              <Sheet.Heading>新邮件</Sheet.Heading>
            </Sheet.Header>
            <Sheet.Body>
              <form className="flex flex-col gap-4">
                <TextField name="to" type="text">
                  <Label>收件人</Label>
                  <Input placeholder="name@example.com" variant="secondary" />
                </TextField>
                <TextField name="subject" type="text">
                  <Label>主题</Label>
                  <Input placeholder="请输入邮件主题" variant="secondary" />
                </TextField>
                <TextField name="body">
                  <Label>正文</Label>
                  <TextArea
                    className="min-h-[220px]"
                    placeholder="请输入邮件内容..."
                    variant="secondary"
                  />
                </TextField>
              </form>
            </Sheet.Body>
            <Sheet.Footer className="justify-between">
              <div className="flex items-center gap-1">
                <Button isIconOnly aria-label="添加附件" size="sm" variant="ghost">
                  <Paperclip className="size-4" />
                </Button>
                <Button isIconOnly aria-label="删除草稿" size="sm" variant="ghost">
                  <TrashBin className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Sheet.Close>
                  <Button size="sm" variant="tertiary">
                    保存草稿
                  </Button>
                </Sheet.Close>
                <Sheet.Close>
                  <Button size="sm">发送</Button>
                </Sheet.Close>
              </div>
            </Sheet.Footer>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}
