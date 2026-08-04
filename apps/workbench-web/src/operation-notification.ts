import type { NotificationInstance } from "antd/es/notification/interface";

export type OperationNotificationKind = "error" | "info" | "success" | "warning";

export function notifyOperation(
  api: NotificationInstance,
  kind: OperationNotificationKind,
  message: string,
  description: string,
): void {
  api[kind]({
    className: "operation-notification",
    description,
    duration: kind === "error" ? 8 : 5,
    placement: "topRight",
    title: message,
  });
}
