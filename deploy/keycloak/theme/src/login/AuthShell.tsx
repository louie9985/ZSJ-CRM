import { App, ConfigProvider, Typography } from "antd";
import type { ReactNode } from "react";

export function AuthShell(props: { title: string; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: "#1677ff",
                    borderRadius: 6,
                    fontSize: 14,
                    colorBgLayout: "#f4f6f8"
                }
            }}
        >
            <App>
                <main className="auth-page">
                    <section className="auth-panel" aria-labelledby="auth-title">
                        <Typography.Text className="auth-brand">ZSJ CRM</Typography.Text>
                        <Typography.Title id="auth-title" level={2} className="auth-title">
                            {props.title}
                        </Typography.Title>
                        {props.children}
                    </section>
                </main>
            </App>
        </ConfigProvider>
    );
}
