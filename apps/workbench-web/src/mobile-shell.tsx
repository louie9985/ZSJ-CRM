import { Button, Empty, List, Space, Typography } from "antd";
import { useLocation, useNavigate } from "react-router-dom";

import type { BootstrapResult, WorkbenchPort } from "./workbench-port";

type ReadyBootstrap = Extract<BootstrapResult, { kind: "ready" }>;

const sections = [
  { label: "工作概览", path: "/mobile/workspace" },
  { label: "我的任务", path: "/mobile/tasks" },
  { label: "通知", path: "/mobile/notifications" },
] as const;

function sectionFor(pathname: string): (typeof sections)[number] {
  return sections.find((section) => pathname === section.path || pathname.startsWith(`${section.path}/`)) ?? sections[0];
}

export function MobileShell({ data, port }: { readonly data: ReadyBootstrap; readonly port: WorkbenchPort }): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const section = sectionFor(location.pathname);
  const collection = section.path.endsWith("tasks") ? data.collections.tasks : section.path.endsWith("notifications") ? data.collections.notifications : undefined;
  const logout = (): void => {
    void port.logout().then(() => { void navigate("/login", { replace: true }); });
  };

  return (
    <main className="mobile-workspace" aria-labelledby="mobile-workspace-title">
      <header className="mobile-workspace-header">
        <div>
          <Typography.Title id="mobile-workspace-title" level={3}>CRM</Typography.Title>
          <Typography.Text type="secondary">{data.context.displayName}</Typography.Text>
        </div>
        <Button onClick={logout}>退出</Button>
      </header>
      <nav className="mobile-workspace-nav" aria-label="CRM 移动入口">
        {sections.map((item) => <Button key={item.path} type={item.path === section.path ? "primary" : "default"} onClick={() => { void navigate(item.path); }}>{item.label}</Button>)}
      </nav>
      <section className="mobile-workspace-content">
        <Typography.Title level={4}>{section.label}</Typography.Title>
        {collection === undefined ? (
          <Space orientation="vertical" size="middle">
            <Typography.Paragraph>当前工作台已就绪。</Typography.Paragraph>
            <Typography.Text type="secondary">员工移动入口与 PC 共用当前 CRM Session 和授权。</Typography.Text>
          </Space>
        ) : collection.items.length === 0 ? (
          <Empty description={`暂无${section.label}`} />
        ) : (
          <List bordered dataSource={collection.items} renderItem={(item) => <List.Item><List.Item.Meta title={item.title} description={item.summary} /></List.Item>} />
        )}
      </section>
    </main>
  );
}
