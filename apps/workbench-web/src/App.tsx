import { AppstoreOutlined, LoginOutlined, LogoutOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Avatar, Button, ConfigProvider, Flex, Result, Spin } from "antd";
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { normalizeReturnTo as normalizeAuthReturnTo, pcLoginUrl } from "./auth-routes";
import { getNavigationSelection, navigationFor } from "./navigation";
import { usePolledCollections } from "./collection-polling";
import { markNotificationRead, resolveNotificationPath } from "./notification-navigation";
import { notifyOperation } from "./operation-notification";
import { runtimeWorkbenchPort } from "./runtime";
import { stateCopy, SystemState } from "./system-state";
import type { BootstrapResult, PlatformCollection, WorkbenchPort } from "./workbench-port";
import { resolveWorkspaceProfile } from "./workspace-profiles";
import "./styles.css";

const CollectionPage = lazy(async () => ({ default: (await import("./pages")).CollectionPage }));
const FeaturePlaceholderPage = lazy(async () => ({ default: (await import("./feature-placeholder-page")).FeaturePlaceholderPage }));
const Overview = lazy(async () => ({ default: (await import("./overview-page")).Overview }));
const SettingsPage = lazy(async () => ({ default: (await import("./settings-page")).SettingsPage }));
const StatusRoutePage = lazy(async () => ({ default: (await import("./status-route-page")).StatusRoutePage }));
const SyntheticFormEvidencePage = lazy(async () => ({ default: (await import("./synthetic-form-evidence-page")).SyntheticFormEvidencePage }));
const WorkforceAdministrationRoute = lazy(async () => ({ default: (await import("./workforce-administration-route")).WorkforceAdministrationRoute }));
const NotificationTemplatePage = lazy(async () => ({ default: (await import("./notification-template-page")).NotificationTemplatePage }));
const RealtimeMergeEvidencePage = lazy(async () => ({ default: (await import("./realtime-merge-evidence-page")).RealtimeMergeEvidencePage }));
const SessionPolicyPage = lazy(async () => ({ default: (await import("./session-policy-page")).SessionPolicyPage }));
const WorkbenchShell = lazy(async () => ({ default: (await import("./workbench-shell")).WorkbenchShell }));

type StateKind = "expired" | "failure" | "forbidden" | "maintenance" | "missing" | "offline";

export class RouteErrorBoundary extends Component<
  { children: ReactNode; onRecover?: () => void },
  { failed: boolean }
> {
  public override state = { failed: false };

  public static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  public override componentDidCatch(): void {
    // Error details are intentionally not rendered or logged from the browser shell.
  }

  public override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const recover = this.props.onRecover ?? (() => { window.location.reload(); });
    return (
      <Result
        status="500"
        title="暂时无法加载"
        subTitle="页面资源加载失败。请重新加载工作台；未完成操作不会被视为成功。"
        extra={<Button type="primary" onClick={recover}>重新加载</Button>}
      />
    );
  }
}

function ConnectivityFrame({ children }: { children: ReactNode }): React.JSX.Element {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const setConnectivity = (): void => {
      const nextOffline = !navigator.onLine;
      document.documentElement.dataset.connectivity = nextOffline ? "offline" : "online";
      setOffline(nextOffline);
    };
    setConnectivity();
    window.addEventListener("online", setConnectivity);
    window.addEventListener("offline", setConnectivity);
    return () => {
      window.removeEventListener("online", setConnectivity);
      window.removeEventListener("offline", setConnectivity);
    };
  }, []);

  return (
    <>
      {offline && <div className="connectivity-alert" role="alert" aria-live="assertive">网络已断开，当前操作不会被视为成功</div>}
      <div className={offline ? "connectivity-content-offline" : undefined}>{children}</div>
    </>
  );
}

function DirectSystemState({ kind, onRetry }: { kind: StateKind; onRetry?: () => void }): React.JSX.Element {
  const copy = stateCopy[kind];
  const action = kind === "expired"
    ? <Button type="primary" href={pcLoginUrl("/applications")}>重新登录</Button>
    : onRetry
      ? <Button type="primary" onClick={onRetry}>重试</Button>
      : <Button type="primary" href="/applications">返回应用选择</Button>;
  return <Result status={copy.status} title={copy.title} subTitle={copy.detail} extra={action} />;
}

export function normalizeReturnTo(candidate: string): string {
  return normalizeAuthReturnTo(candidate);
}

function CollectionRoutes({ path, collection }: { path: string; collection: PlatformCollection }): React.JSX.Element[] {
  return [
    <Route key={path} path={path} element={<CollectionPage collection={collection} />} />,
    <Route key={`${path}/:itemId`} path={`${path}/:itemId`} element={<CollectionPage collection={collection} />} />,
  ];
}

function SyntheticFormEvidenceRoute({ port }: { port: NonNullable<WorkbenchPort["syntheticFormEvidence"]> }): React.JSX.Element {
  const release = useQuery({ queryKey: ["synthetic-form-evidence-release"], queryFn: () => port.loadRelease(), retry: false });
  if (release.isPending) return <Flex className="full-state" align="center" justify="center"><Spin size="large" description="正在加载表单版本" /></Flex>;
  if (release.isError) return <DirectSystemState kind="failure" onRetry={() => { void release.refetch(); }} />;
  return <SyntheticFormEvidencePage fileReference={port.fileReference} port={port} release={release.data} />;
}

interface ApplicationOption {
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

const applicationCatalog: readonly ApplicationOption[] = [{ id: "crm", name: "CRM 系统", description: "内部客户关系管理工作台", path: "/crm/workspace" }];

export function applicationsFor(applicationIds: readonly string[] | undefined): ApplicationOption[] {
  if (applicationIds === undefined) return [];
  const allowed = new Set(applicationIds);
  return applicationCatalog.filter(({ id }) => allowed.has(id));
}

function useSessionLogout(port: WorkbenchPort): Readonly<{
  logoutState: "error" | "idle" | "pending";
  requestLogout: () => void;
}> {
  const { notification } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [logoutState, setLogoutState] = useState<"error" | "idle" | "pending">("idle");
  const requestLogout = (): void => {
    if (logoutState === "pending") return;
    setLogoutState("pending");
    port.logout().then(
      (result) => {
        queryClient.removeQueries({ queryKey: ["workbench-collections"] });
        queryClient.setQueryData(["workbench-bootstrap"], result);
      },
      () => {
        setLogoutState("error");
        notifyOperation(notification, "error", "退出未完成", "当前会话仍保持登录，请重试。");
      },
    );
  };
  return { logoutState, requestLogout };
}

function accountKindLabel(accountKind: "system_administrator" | "workforce" | undefined): string {
  return accountKind === "system_administrator" ? "系统管理员账号" : "内部员工账号";
}

function ApplicationsPage({ data, port }: { data: BootstrapResult & { kind: "ready" }; port: WorkbenchPort }): React.JSX.Element {
  const applications = applicationsFor(data.applicationIds);
  const { logoutState, requestLogout } = useSessionLogout(port);
  return (
    <main className="applications-entry" aria-labelledby="applications-title">
      <section className="applications-panel">
        <div className="application-account">
          <div className="application-account-identity">
            <Avatar size={40}>{data.context.displayName.slice(0, 1)}</Avatar>
            <span>
              <span className="application-account-caption">当前登录账号</span>
              <strong title={data.context.displayName}>{data.context.displayName}</strong>
              <span className="application-account-kind">{accountKindLabel(data.context.accountKind)}</span>
            </span>
          </div>
          <Button
            aria-label="退出登录"
            danger
            type="text"
            icon={<LogoutOutlined />}
            loading={logoutState === "pending"}
            disabled={logoutState === "pending"}
            onClick={requestLogout}
          >退出登录</Button>
        </div>
        <div className="applications-heading">
          <h1 id="applications-title">选择应用</h1>
          <p className="applications-context">进入已授权的工作空间</p>
        </div>
        <div className="application-list">
          {applications.length === 0 ? <Result status="403" title="暂无可访问应用" subTitle="当前账号没有已授权的应用入口。" /> : applications.map((application) => (
            <Link className="application-card" to={application.path} key={application.id}>
              <span className="application-icon" aria-hidden="true"><AppstoreOutlined /></span>
              <span><strong>{application.name}</strong><span>{application.description}</span></span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function loginReturnTo(location: ReturnType<typeof useLocation>): string {
  if (location.pathname === "/" || location.pathname === "/login" || location.pathname.startsWith("/auth/pc/")) {
    return "/applications";
  }
  return normalizeReturnTo(`${location.pathname}${location.search}${location.hash}`);
}

function LoginRedirect({ port }: { port: WorkbenchPort }): React.JSX.Element {
  const location = useLocation();
  const returnTo = loginReturnTo(location);
  useEffect(() => {
    port.beginLogin(returnTo);
  }, [port, returnTo]);
  return <Flex className="full-state" align="center" justify="center"><Spin size="large" description="正在前往统一认证中心" /></Flex>;
}

function LegacyCrmRedirect(): React.JSX.Element {
  const location = useLocation();
  const path = location.pathname === "/workspace"
    ? "/crm/workspace"
    : location.pathname === "/coordination"
      ? "/crm/tasks"
      : location.pathname === "/resources"
        ? "/crm/forms"
        : `/crm${location.pathname}`;
  return <Navigate to={`${path}${location.search}${location.hash}`} replace />;
}

function Shell({ data, port }: { data: BootstrapResult & { kind: "ready" }; port: WorkbenchPort }): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notification } = AntdApp.useApp();
  const { logoutState, requestLogout } = useSessionLogout(port);
  const workspaceProfile = resolveWorkspaceProfile(data.workspaceProfileId);
  const visibleNavigation = navigationFor(data.navigationIds, workspaceProfile.navigationIds);
  const selection = getNavigationSelection(location.pathname, visibleNavigation);
  const selectedPrimary = selection.openKeys[0] ?? selection.selectedKey;
  const primaryItems = visibleNavigation;
  const selectedPrimaryItem = primaryItems.find((item) => item.key === selectedPrimary) ?? primaryItems[0];
  const secondaryItems = selectedPrimaryItem?.children ?? [];
  const openNotification = useCallback((item: import("./workbench-port").PlatformItem): void => {
    notification.open({
      className: "realtime-notification-toast",
      description: item.summary,
      duration: 6,
      title: item.title,
      onClick: () => {
        void resolveNotificationPath(item).then(async (path) => {
          await navigate(path);
          try { await markNotificationRead(item.id); } catch { notifyOperation(notification, "warning", "通知状态未更新", "页面已打开，但通知未能标记为已读。"); }
        }).catch((error: unknown) => {
          const code = error instanceof Error ? error.message : "";
          void navigate(code === "notification_navigation_denied" ? "/status/403" : code === "notification_navigation_missing" ? "/status/404" : "/status/500");
        });
      },
      placement: "topRight",
    });
  }, [navigate, notification]);
  const handleSessionRevoked = useCallback((): void => {
    queryClient.clear();
    void navigate("/status/session-expired", { replace: true });
  }, [navigate, queryClient]);
  const realtimeOptions = useMemo(() => ({ initialUnreadCount: data.counts.notifications, onNotification: openNotification, onSessionRevoked: handleSessionRevoked }), [data.counts.notifications, handleSessionRevoked, openNotification]);
  const realtime = usePolledCollections(port, data.collections, data.context.sessionScope ?? data.context.assignmentReference ?? "current-session", realtimeOptions);
  const collections = realtime.collections;
  const liveData = useMemo(() => ({ ...data, counts: { ...data.counts, notifications: realtime.unreadCount } }), [data, realtime.unreadCount]);
  const authorized = (navigationId: string, element: React.JSX.Element): React.JSX.Element => data.navigationIds === undefined || data.navigationIds.includes(navigationId) ? element : <Navigate to="/status/403" replace />;

  return (
    <WorkbenchShell
      data={liveData}
      logoutState={logoutState}
      onLogout={requestLogout}
      primaryItems={primaryItems}
      secondaryItems={secondaryItems}
      {...(selection.selectedKey === undefined ? {} : { selectedKey: selection.selectedKey })}
      {...(selectedPrimaryItem === undefined ? {} : { selectedPrimaryItem })}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/applications" replace />} />
        <Route path="/login" element={<Navigate to="/applications" replace />} />
        <Route path="/applications" element={<ApplicationsPage data={data} port={port} />} />
        <Route path="/workspace" element={<LegacyCrmRedirect />} />
        <Route path="/coordination" element={<LegacyCrmRedirect />} />
        <Route path="/resources" element={<LegacyCrmRedirect />} />
        <Route path="/tasks" element={<LegacyCrmRedirect />} />
        <Route path="/tasks/:itemId" element={<LegacyCrmRedirect />} />
        <Route path="/notifications" element={<LegacyCrmRedirect />} />
        <Route path="/notifications/:itemId" element={<LegacyCrmRedirect />} />
        <Route path="/forms" element={<LegacyCrmRedirect />} />
        <Route path="/forms/:itemId" element={<LegacyCrmRedirect />} />
        <Route path="/files" element={<LegacyCrmRedirect />} />
        <Route path="/files/:itemId" element={<LegacyCrmRedirect />} />
        <Route path="/settings" element={<LegacyCrmRedirect />} />
        <Route path="/workforce-administration" element={<LegacyCrmRedirect />} />
        <Route path="/crm" element={<Navigate to="/crm/workspace" replace />} />
        <Route path="/crm/coordination" element={<Navigate to="/crm/tasks" replace />} />
        <Route path="/crm/resources" element={<Navigate to="/crm/forms" replace />} />
        <Route path="/crm/administration" element={<Navigate to={port.workforceAdministration === undefined ? "/crm/settings/system" : "/crm/workforce-administration"} replace />} />
        <Route path="/crm/workspace" element={data.workspaceProfileId === undefined ? <Overview collections={collections} data={liveData} /> : authorized(workspaceProfile.navigationIds[0] ?? "", workspaceProfile.render())} />
        {port.workforceAdministration === undefined ? null : <Route path="/crm/workforce-administration" element={authorized("crm.workforce-administration", <WorkforceAdministrationRoute port={port.workforceAdministration} />)} />}
        {CollectionRoutes({ path: "/crm/tasks", collection: collections.tasks })}
        <Route path="/crm/calendar" element={<Navigate to="/crm/calendar/schedule" replace />} />
        <Route path="/crm/calendar/schedule" element={authorized("crm.calendar.schedule", <FeaturePlaceholderPage title="我的日程" />)} />
        <Route path="/crm/calendar/interview-plan" element={authorized("crm.calendar.interview-plan", <FeaturePlaceholderPage title="采访排期" />)} />
        <Route path="/crm/approvals" element={<Navigate to="/crm/approvals/mine" replace />} />
        <Route path="/crm/approvals/mine" element={authorized("crm.approvals.mine", <FeaturePlaceholderPage title="我发起的" />)} />
        <Route path="/crm/approvals/todo" element={authorized("crm.approvals.todo", <FeaturePlaceholderPage title="待我审批" />)} />
        <Route path="/crm/approvals/all" element={authorized("crm.approvals.all", <FeaturePlaceholderPage title="全部审批" />)} />
        <Route path="/crm/notifications" element={<Navigate to="/crm/notifications/all" replace />} />
        <Route path="/crm/notifications/all" element={authorized("crm.notifications.all", <FeaturePlaceholderPage title="全部通知" />)} />
        <Route path="/crm/notifications/todo" element={authorized("crm.notifications.todo", <FeaturePlaceholderPage title="待办提醒" />)} />
        <Route path="/crm/notifications/system" element={authorized("crm.notifications.system", <FeaturePlaceholderPage title="系统 / 外部" />)} />
        {port.notificationTemplates === undefined || data.navigationIds?.includes("crm.notification-templates") !== true ? null : <Route path="/crm/notifications/templates" element={<NotificationTemplatePage port={port.notificationTemplates} />} />}
        {data.fixture ? <Route path="/crm/realtime-merge-evidence" element={<RealtimeMergeEvidencePage />} /> : null}
        {CollectionRoutes({ path: "/crm/notifications", collection: collections.notifications })}
        <Route path="/crm/mail" element={<Navigate to="/crm/mail/inbox" replace />} />
        <Route path="/crm/mail/inbox" element={authorized("crm.mail.inbox", <FeaturePlaceholderPage title="收件箱" />)} />
        <Route path="/crm/mail/sent" element={authorized("crm.mail.sent", <FeaturePlaceholderPage title="已发送" />)} />
        <Route path="/crm/mail/draft" element={authorized("crm.mail.draft", <FeaturePlaceholderPage title="草稿箱" />)} />
        {port.syntheticFormEvidence === undefined ? null : <Route path="/crm/forms/platform.synthetic.task-completion" element={<SyntheticFormEvidenceRoute port={port.syntheticFormEvidence} />} />}
        {CollectionRoutes({ path: "/crm/forms", collection: collections.forms })}
        {CollectionRoutes({ path: "/crm/files", collection: collections.files })}
        <Route path="/crm/settings" element={<Navigate to="/crm/settings/system" replace />} />
        <Route path="/crm/settings/system" element={authorized("crm.settings.system", <FeaturePlaceholderPage title="系统设置" />)} />
        {port.sessionPolicy === undefined || data.navigationIds?.includes("crm.session-policy") !== true ? null : <Route path="/crm/settings/session-policy" element={<SessionPolicyPage port={port.sessionPolicy} />} />}
        <Route path="/crm/settings/profile" element={authorized("crm.settings.profile", <SettingsPage />)} />
        <Route path="/status/403" element={<StatusRoutePage kind="forbidden" />} />
        <Route path="/status/500" element={<StatusRoutePage kind="failure" />} />
        <Route path="/status/offline" element={<StatusRoutePage kind="offline" />} />
        <Route path="/status/session-expired" element={<StatusRoutePage kind="expired" loginUrl={pcLoginUrl("/applications")} />} />
        <Route path="/status/maintenance" element={<StatusRoutePage kind="maintenance" />} />
        <Route path="*" element={<StatusRoutePage kind="missing" />} />
      </Routes>
    </WorkbenchShell>
  );
}

function Workbench({ port }: { port: WorkbenchPort }): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["workbench-bootstrap"], queryFn: () => port.bootstrap(), retry: false });

  const retry = (): void => { query.refetch().catch(() => undefined); };
  const retryStatus = (): void => {
    query.refetch().then(
      (result) => { if (!result.isError) void navigate("/applications", { replace: true }); },
      () => undefined,
    );
  };
  if (location.pathname.startsWith("/status/")) {
    const kindByPath: Record<string, StateKind> = {
      "/status/403": "forbidden",
      "/status/500": "failure",
      "/status/offline": "offline",
      "/status/session-expired": "expired",
      "/status/maintenance": "maintenance",
    };
    const kind = kindByPath[location.pathname] ?? "missing";
    const retryable = kind === "failure" || kind === "maintenance" || kind === "offline";
    if (retryable) {
      const copy = stateCopy[kind];
      return (
        <div className="direct-system-state">
          <Result status={copy.status} title={copy.title} subTitle={copy.detail} />
          <div className="direct-system-state-action"><button className="direct-retry-button" type="button" onClick={retryStatus}>重试</button></div>
        </div>
      );
    }
    return <DirectSystemState kind={kind} />;
  }
  if (query.isPending) return <Flex className="full-state" align="center" justify="center"><Spin size="large" description="正在恢复会话" /></Flex>;
  if (query.isError) return <SystemState kind="failure" retryable onRetry={retry} />;
  if (query.data.kind === "logged-out") {
    return <Result status="success" title="已退出登录" subTitle="当前浏览器会话已结束。" extra={<Button aria-label="重新登录" type="primary" href={pcLoginUrl("/applications")} icon={<LoginOutlined />}>重新登录</Button>} />;
  }
  if (query.data.kind === "signed-out") {
    return <LoginRedirect port={port} />;
  }
  if (query.data.kind === "session-expired") return <SystemState kind="expired" loginUrl={pcLoginUrl(loginReturnTo(location))} />;
  if (query.data.kind === "forbidden") return <SystemState kind="forbidden" />;
  if (query.data.kind === "maintenance") return <SystemState kind="maintenance" retryable onRetry={retry} />;
  if (location.pathname === "/applications") return <ApplicationsPage data={query.data} port={port} />;
  if (location.pathname.startsWith("/crm") && query.data.applicationIds?.includes("crm") !== true) return <SystemState kind="forbidden" />;
  return <Shell data={query.data} port={port} />;
}

export function App({ port = runtimeWorkbenchPort }: { port?: WorkbenchPort }): React.JSX.Element {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#1677ff", borderRadius: 6, fontSize: 14, colorBgLayout: "#f4f6f8" } }}>
      <AntdApp>
        <ConnectivityFrame>
          <RouteErrorBoundary>
            <Suspense fallback={<Flex className="full-state" align="center" justify="center"><Spin size="large" description="正在加载工作区" /></Flex>}>
              <Workbench port={port} />
            </Suspense>
          </RouteErrorBoundary>
        </ConnectivityFrame>
      </AntdApp>
    </ConfigProvider>
  );
}
