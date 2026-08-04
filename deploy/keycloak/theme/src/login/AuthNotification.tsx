import { App } from "antd";
import { useEffect } from "react";

export function AuthNotification(props: { description: string; notificationKey: string; title: string }) {
    const { notification } = App.useApp();

    useEffect(() => {
        notification.error({
            className: "auth-operation-notification",
            description: props.description,
            duration: false,
            key: props.notificationKey,
            placement: "topRight",
            title: props.title
        });
    }, [notification, props.description, props.notificationKey, props.title]);

    return null;
}
