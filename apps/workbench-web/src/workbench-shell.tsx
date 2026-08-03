import {
  BellOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Breadcrumb, Button, Dropdown, Input, Layout, Tooltip } from "antd";
import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { NavigationItem } from "./navigation";
import type { BootstrapResult } from "./workbench-port";

const { Content, Header, Sider } = Layout;

type ReadyBootstrap = Extract<BootstrapResult, { kind: "ready" }>;

interface WorkbenchShellProps {
  readonly children: ReactNode;
  readonly data: ReadyBootstrap;
  readonly logoutState: "error" | "idle" | "pending";
  readonly onLogout: () => void;
  readonly primaryItems: NavigationItem[];
  readonly secondaryItems: NavigationItem[];
  readonly selectedKey?: string;
  readonly selectedPrimaryItem?: NavigationItem;
}

export function WorkbenchShell({
  children,
  data,
  logoutState,
  onLogout,
  primaryItems,
  secondaryItems,
  selectedKey,
  selectedPrimaryItem,
}: WorkbenchShellProps): React.JSX.Element {
  const navigate = useNavigate();
  const [primaryCollapsed, setPrimaryCollapsed] = useState(false);
  const [secondaryCollapsed, setSecondaryCollapsed] = useState(false);
  const selectedSecondary = secondaryItems.find((item) => item.key === selectedKey);

  return (
    <Layout className="workbench-frame">
      <Sider
        className="workbench-sider primary-sider"
        width={144}
        collapsedWidth={56}
        collapsed={primaryCollapsed}
        trigger={null}
        theme="light"
        aria-label="一级导航容器"
      >
        <div className="sider-column">
          <button className="workbench-brand" type="button" onClick={() => { void navigate("/crm/workspace"); }}>
            <span className="brand-full">ZSJ AI-CRM</span>
            <span className="brand-compact">CRM</span>
          </button>
          <nav className="primary-nav" aria-label="一级导航">
            {primaryItems.map((item) => (
              <Tooltip key={item.key} title={primaryCollapsed ? item.label : undefined} placement="right">
                <Link
                  className={item.key === selectedPrimaryItem?.key ? "primary-nav-item selected" : "primary-nav-item"}
                  to={item.children?.[0]?.key ?? item.key}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </Link>
              </Tooltip>
            ))}
          </nav>
          <div className="sider-collapse-control">
            <Tooltip title={primaryCollapsed ? "展开一级导航" : "收起一级导航"} placement="right">
              <Button
                block
                type="text"
                aria-label={primaryCollapsed ? "展开一级导航" : "收起一级导航"}
                icon={primaryCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => { setPrimaryCollapsed((value) => !value); }}
              />
            </Tooltip>
          </div>
        </div>
      </Sider>

      <Sider
        className="workbench-sider secondary-sider"
        width={180}
        collapsedWidth={48}
        collapsed={secondaryCollapsed}
        trigger={null}
        theme="light"
        aria-label="二级导航"
      >
        <div className="sider-column">
          <div className="secondary-nav-header">
            {!secondaryCollapsed && <strong title={selectedPrimaryItem?.label}>{selectedPrimaryItem?.label ?? "工作台"}</strong>}
            <Tooltip title={secondaryCollapsed ? "展开二级导航" : "收起二级导航"} placement="right">
              <Button
                type="text"
                size="small"
                aria-label={secondaryCollapsed ? "展开二级导航" : "收起二级导航"}
                icon={secondaryCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => { setSecondaryCollapsed((value) => !value); }}
              />
            </Tooltip>
          </div>
          <nav className="secondary-nav" aria-label="二级导航菜单">
            {secondaryItems.map((item) => (
              <Tooltip key={item.key} title={secondaryCollapsed ? item.label : undefined} placement="right">
                <Link className={item.key === selectedKey ? "secondary-nav-item selected" : "secondary-nav-item"} to={item.key}>
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </Link>
              </Tooltip>
            ))}
          </nav>
        </div>
      </Sider>

      <Layout className="workbench-workspace">
        <Header className="workbench-topbar">
          <div className="topbar-context">
            <Breadcrumb items={[
              { title: selectedPrimaryItem?.label ?? "工作台" },
              { title: selectedSecondary?.label ?? selectedPrimaryItem?.label ?? "工作台首页" },
            ]} />
          </div>
          <div className="topbar-actions">
            <Tooltip title="搜索能力将在正式搜索契约启用后开放">
              <Input
                className="global-search"
                aria-label="搜索任务、通知或文件"
                prefix={<SearchOutlined />}
                placeholder="搜索任务 / 通知 / 文件"
                readOnly
              />
            </Tooltip>
            <Tooltip title="通知中心">
              <Badge count={data.counts.notifications} size="small">
                <Button
                  type="text"
                  aria-label="通知中心"
                  icon={<BellOutlined />}
                  onClick={() => { void navigate("/crm/notifications/all"); }}
                />
              </Badge>
            </Tooltip>
            <Dropdown
              placement="bottomRight"
              trigger={["click"]}
              menu={{
                items: [
                  { key: "identity", label: data.context.displayName, disabled: true },
                  { type: "divider" },
                  { key: "logout", label: logoutState === "pending" ? "正在退出" : "退出当前会话", disabled: logoutState === "pending" },
                ],
                onClick: ({ key }) => { if (key === "logout") onLogout(); },
              }}
            >
              <button className="account-trigger" type="button" aria-label="账号菜单" disabled={logoutState === "pending"}>
                <Avatar>{data.context.displayName.slice(0, 1)}</Avatar>
              </button>
            </Dropdown>
          </div>
        </Header>
        <Content className="workbench-content"><div className="workbench-main">{children}</div></Content>
      </Layout>
    </Layout>
  );
}
