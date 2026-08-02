import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, normalizeReturnTo, pcLoginUrl, RouteErrorBoundary } from "./App";
import { developmentFixturePort } from "./development-fixture";
import { WorkforceAdministrationPage } from "./workforce-administration-page";
import type { BootstrapResult, WorkbenchPort, WorkforceAdministrationPort } from "./workbench-port";

vi.mock("@ant-design/pro-components", () => ({
  PageContainer: ({ title, children }: { title?: ReactNode; children?: ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  ProLayout: ({
    avatarProps,
    children,
    location,
    menuProps,
    openKeys,
  }: {
    avatarProps?: { render?: (props: object, dom: ReactNode, layout: object) => ReactNode };
    children?: ReactNode;
    location?: { pathname?: string };
    menuProps?: { selectedKeys?: string[] };
    openKeys?: string[];
  }) => (
    <div
      data-testid="pro-layout"
      data-selected={menuProps?.selectedKeys?.join(",")}
      data-open={openKeys?.join(",")}
      data-location={location?.pathname}
    >
      {avatarProps?.render?.({}, <span>session avatar</span>, {})}
      {children}
    </div>
  ),
}));

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderApp(entry: string, port: WorkbenchPort = developmentFixturePort): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}><LocationProbe /><App port={port} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderWorkforceAdministration(port: Omit<WorkforceAdministrationPort, "listAccounts"> & Partial<Pick<WorkforceAdministrationPort, "listAccounts">>, entry = "/workforce-administration"): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let snapshotPromise: ReturnType<WorkforceAdministrationPort["load"]> | undefined;
  const load = (): ReturnType<WorkforceAdministrationPort["load"]> => {
    snapshotPromise ??= port.load();
    return snapshotPromise;
  };
  const resolved: WorkforceAdministrationPort = {
    ...port,
    listAccounts: port.listAccounts ?? (async (query) => {
      const snapshot = await load();
      return { items: snapshot.accounts.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), page: query.page, pageSize: query.pageSize, total: snapshot.accounts.length };
    }),
    load,
  };
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><LocationProbe /><WorkforceAdministrationPage port={resolved} /></MemoryRouter></QueryClientProvider>);
}

const longText = "synthetic-platform-reference-with-a-deliberately-long-unbroken-value-0123456789";
const syntheticFileReference = Object.freeze({
  contentVersionId: "f11ec1a5-0000-4000-8000-000000000004",
  displayName: "synthetic-clamav-fixture.txt",
  fileId: "f11ec1a5-0000-4000-8000-000000000003",
  mediaType: "text/plain",
  sizeBytes: 36,
  version: 1 as const,
});
const syntheticRelease = Object.freeze({
  active: true,
  contentDigest: "a".repeat(64),
  definitionId: "platform.synthetic.task-completion",
  jsonSchema: Object.freeze({
    properties: Object.freeze({ content_version_id: {}, file_id: {}, synthetic_value: {} }),
    required: Object.freeze(["synthetic_value", "file_id", "content_version_id"]),
  }),
  releaseVersion: 1,
  uiSchema: Object.freeze({
    fields: Object.freeze([
      Object.freeze({ component: "input", field: "synthetic_value", order: 1 }),
      Object.freeze({ component: "input", field: "file_id", order: 2 }),
      Object.freeze({ component: "input", field: "content_version_id", order: 3 }),
    ]),
    layout: "vertical" as const,
    version: 1 as const,
  }),
});
type ReadyBootstrap = Extract<BootstrapResult, { kind: "ready" }>;
const longReady: ReadyBootstrap = {
  kind: "ready",
  fixture: true,
  context: { displayName: longText, assignmentReference: longText },
  counts: { tasks: 1, notifications: 1, forms: 1, files: 1 },
  collections: Object.fromEntries(["tasks", "notifications", "forms", "files"].map((key) => [key, {
    title: key,
    fixture: true,
    statuses: [longText],
    items: [{ id: longText, title: longText, status: longText, summary: longText, tab: "active" as const }],
  }])) as ReadyBootstrap["collections"],
};

afterEach(() => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  window.dispatchEvent(new Event("online"));
});

describe("workbench shell", () => {
  it("reserves the synthetic form evidence route ahead of the collection detail route", async () => {
    const loadRelease = vi.fn().mockResolvedValue(syntheticRelease);
    renderApp("/forms/platform.synthetic.task-completion", {
      bootstrap: () => developmentFixturePort.bootstrap(),
      logout: () => developmentFixturePort.logout(),
      syntheticFormEvidence: {
        fileReference: syntheticFileReference,
        loadRelease,
        submit: vi.fn(),
      },
    });

    expect(await screen.findByRole("heading", { name: "合成表单验收" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "合成值" })).toBeInTheDocument();
    expect(loadRelease).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("对象不存在")).not.toBeInTheDocument();
  });

  it("normalizes inconsistent tab, filter, page and selection URL state", async () => {
    renderApp("/tasks?tab=history&filter=unknown&page=99&selected=fixture-task-02");

    expect(await screen.findByRole("heading", { name: "任务" }, { timeout: 10_000 })).toBeInTheDocument();
    await waitFor(
      () => expect(screen.getByTestId("location")).toHaveTextContent("/tasks?tab=history&filter=all&page=1&selected=fixture-task-06"),
      { timeout: 10_000 },
    );
    expect(screen.getByText("fixture-task-06")).toBeInTheDocument();
    expect(screen.queryByText("fixture-task-02")).not.toBeInTheDocument();
  }, 15_000);

  it("uses longest-prefix selection in ProLayout and renders a collection deep link", async () => {
    renderApp("/notifications/fixture-notification-06");

    expect(await screen.findByRole("heading", { name: "通知" })).toBeInTheDocument();
    expect(screen.getByTestId("pro-layout")).toHaveAttribute("data-selected", "/notifications");
    expect(screen.getByTestId("pro-layout")).toHaveAttribute("data-open", "/coordination");
    expect(screen.getByTestId("pro-layout")).toHaveAttribute("data-location", "/notifications");
    expect(screen.getByText("fixture-notification-06")).toBeInTheDocument();
    expect(screen.getByTestId("location")).not.toHaveTextContent("selected=");

    fireEvent.click(screen.getByRole("button", { name: /合成通知 7/u }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/notifications/fixture-notification-07"));
    expect(screen.getByTestId("location")).not.toHaveTextContent("selected=");
    expect(screen.getByText("fixture-notification-07")).toBeInTheDocument();
  });

  it.each([
    ["/coordination", "任务", "/tasks"],
    ["/resources", "表单", "/forms"],
  ])("redirects linked parent path %s to a stable child", async (entry, heading, expectedPath) => {
    renderApp(entry);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(expectedPath));
  });

  it("renders an explicit object not-found state for an unknown deep-link id", async () => {
    renderApp("/tasks/fixture-does-not-exist");

    expect(await screen.findByText("对象不存在")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks/fixture-does-not-exist");
    expect(screen.queryByText("fixture-task-01")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回当前集合" })).toHaveAttribute("href", "/tasks");
  });

  it("shows every required runtime state with explicit copy", async () => {
    const cases = [
      ["/status/403", "无权访问"],
      ["/missing", "页面不存在"],
      ["/status/500", "暂时无法加载"],
      ["/status/offline", "网络已断开"],
      ["/status/session-expired", "会话已过期"],
      ["/status/maintenance", "服务维护中"],
    ] as const;

    for (const [entry, title] of cases) {
      const { unmount } = render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={[entry]}><App port={developmentFixturePort} /></MemoryRouter>
        </QueryClientProvider>,
      );
      expect(await screen.findByText(title)).toBeInTheDocument();
      unmount();
    }
  });

  it("uses route-appropriate actions for direct status pages", async () => {
    renderApp("/status/403");
    expect(await screen.findByRole("link", { name: "返回工作概览" })).toHaveAttribute("href", "/workspace");
  });

  it("returns expired-session login to the workspace instead of the expired status URL", async () => {
    renderApp("/status/session-expired");
    expect(await screen.findByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/auth/pc/login?returnTo=%2Fworkspace");
  });

  it("leaves a retryable direct status route after a successful refetch", async () => {
    const bootstrap = vi.fn(() => developmentFixturePort.bootstrap());
    renderApp("/status/500", { bootstrap, logout: () => developmentFixturePort.logout() });
    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    expect(await screen.findByRole("heading", { name: "工作概览" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/workspace");
    expect(bootstrap).toHaveBeenCalled();
  });

  it("fails closed when the runtime adapter reports maintenance", async () => {
    renderApp("/workspace", { bootstrap: vi.fn().mockResolvedValue({ kind: "maintenance" }), logout: vi.fn() });
    expect(await screen.findByText("服务维护中")).toBeInTheDocument();
  });

  it("announces connectivity loss through a semantic live alert", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    renderApp("/workspace");
    await screen.findByRole("heading", { name: "工作概览" });

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    const notice = await screen.findByText("网络已断开，当前操作不会被视为成功");
    expect(notice).toHaveAttribute("role", "alert");
    expect(notice).toHaveAttribute("aria-live", "assertive");
    expect(notice).toHaveTextContent("网络已断开，当前操作不会被视为成功");
    expect(notice.nextElementSibling).toHaveClass("connectivity-content-offline");
  });

  it("contains lazy route failures and exposes an explicit recovery action", async () => {
    const recover = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function FailedRoute(): React.JSX.Element {
      throw new Error("synthetic lazy chunk failure");
    }
    render(<RouteErrorBoundary onRecover={recover}><FailedRoute /></RouteErrorBoundary>);

    expect(await screen.findByText("页面资源加载失败。请重新加载工作台；未完成操作不会被视为成功。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(recover).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("constructs only the fixed same-site login entry with a bounded local returnTo", async () => {
    renderApp("/tasks?tab=history", { bootstrap: vi.fn().mockResolvedValue({ kind: "signed-out" }), logout: vi.fn() });
    const login = await screen.findByRole("link", { name: /登录/u });
    expect(login).toHaveAttribute("href", "/auth/pc/login?returnTo=%2Ftasks%3Ftab%3Dhistory");
    expect(normalizeReturnTo("https://outside.invalid/steal")).toBe("/workspace");
    expect(normalizeReturnTo("//outside.invalid/steal")).toBe("/workspace");
    expect(normalizeReturnTo("/safe\\redirect")).toBe("/workspace");
    expect(pcLoginUrl("https://outside.invalid/steal")).toBe("/auth/pc/login?returnTo=%2Fworkspace");
  });

  it("disables logout while pending and converges the session to signed out on success", async () => {
    let resolveLogout: ((value: { kind: "signed-out" }) => void) | undefined;
    const logout = vi.fn(() => new Promise<{ kind: "signed-out" }>((resolve) => { resolveLogout = resolve; }));
    renderApp("/workspace", { bootstrap: () => Promise.resolve(longReady), logout });
    const button = await screen.findByRole("button", { name: "退出当前会话" });

    fireEvent.mouseOver(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("退出当前会话");
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(logout).toHaveBeenCalledTimes(1);
    resolveLogout?.({ kind: "signed-out" });
    expect(await screen.findByText("登录 ZSJ CRM")).toBeInTheDocument();
  });

  it("keeps the session active and exposes a retry when logout fails", async () => {
    const logout = vi.fn().mockRejectedValue(new Error("synthetic failure"));
    renderApp("/workspace", { bootstrap: () => Promise.resolve(longReady), logout });
    fireEvent.click(await screen.findByRole("button", { name: "退出当前会话" }));

    expect(await screen.findByText("退出未完成")).toBeInTheDocument();
    expect(screen.getByText("当前会话仍保持登录。请重试退出操作。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出当前会话" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "重试退出" })).toBeInTheDocument();
  });

  it("shows an explicit empty workbench for an employee without authorized features", async () => {
    renderApp("/workspace", {
      bootstrap: () => Promise.resolve({ ...longReady, fixture: false, navigationIds: [] }),
      logout: vi.fn(),
    });

    expect(await screen.findByText("暂无可用功能")).toBeInTheDocument();
  });

  it("keeps the workforce administration tab in the URL", async () => {
    renderWorkforceAdministration({
      execute: vi.fn().mockResolvedValue({}),
      load: () => Promise.resolve({ accounts: [], departments: [], positions: [] }),
    }, "/workforce-administration?tab=departments");

    expect(await screen.findByRole("tab", { name: "部门" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "岗位" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/workforce-administration?tab=positions");
    fireEvent.click(screen.getByRole("tab", { name: "员工账号" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/workforce-administration");
  });

  it("requires explicit confirmation before releasing a historical phone", async () => {
    const execute = vi.fn<WorkforceAdministrationPort["execute"]>().mockResolvedValue({});
    renderWorkforceAdministration({
      execute,
      load: () => Promise.resolve({
        accounts: [{
          accountId: "10000000-0000-4000-8000-000000000001",
          allowedActions: ["release_phone"],
          crmAdministrator: false,
          legalName: "测试员工",
          phone: "+8613800000000",
          releasablePhones: ["+8613700000000"],
          revision: 7,
          status: "active",
          username: "employee.one",
        }],
        departments: [],
        positions: [],
      }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "释放旧手机号" }));
    expect(screen.getByText("释放后，该旧手机号可被其他账号使用。此操作不会修改当前登录手机号。")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "选择要释放的旧手机号" })).toBeInTheDocument();
    expect(screen.getByText("+8613700000000")).toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认释放" }));
    await waitFor(() => { expect(execute).toHaveBeenCalledWith({ accountId: "10000000-0000-4000-8000-000000000001", expectedRevision: 7, kind: "release_phone", phone: "+8613700000000" }); });
  }, 20_000);

  it("shows a failed identity synchronization and submits a reference-only retry", async () => {
    const execute = vi.fn<WorkforceAdministrationPort["execute"]>().mockResolvedValue({});
    renderWorkforceAdministration({
      execute,
      load: () => Promise.resolve({
        accounts: [{
          accountId: "10000000-0000-4000-8000-000000000001",
          allowedActions: ["retry_identity_sync"],
          crmAdministrator: false,
          latestIdentitySync: { action: "synchronize_login_identifiers", completedAt: "2026-08-02T00:00:05.000Z", errorCode: "keycloak_administration_unavailable", operationId: "40000000-0000-4000-8000-000000000001", requestedAt: "2026-08-02T00:00:00.000Z", status: "failed" },
          legalName: "测试员工",
          releasablePhones: [],
          revision: 7,
          status: "active",
          username: "employee.one",
        }],
        departments: [],
        positions: [],
      }),
    });

    expect(await screen.findByText("同步失败")).toBeInTheDocument();
    expect(screen.getByText("身份服务暂时不可用")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试同步" }));
    await waitFor(() => { expect(execute).toHaveBeenCalledWith({ accountId: "10000000-0000-4000-8000-000000000001", expectedRevision: 7, failedOperationId: "40000000-0000-4000-8000-000000000001", kind: "retry_identity_sync" }); });
  });

  it("requires reauthentication before exposing the system-account identifier editor", async () => {
    const beginSystemAccountReauthentication = vi.fn<NonNullable<WorkforceAdministrationPort["beginSystemAccountReauthentication"]>>().mockResolvedValue();
    renderWorkforceAdministration({
      beginSystemAccountReauthentication,
      execute: vi.fn().mockResolvedValue({}),
      load: () => Promise.resolve({
        accounts: [], departments: [], positions: [],
        systemAccount: { accountId: "10000000-0000-4000-8000-000000000009", allowedActions: [], crmAdministrator: false, legalName: "ZSJ系统管理员", phone: "+8613800000000", releasablePhones: [], revision: 4, status: "active", username: "system.admin" },
      }),
    });

    expect(await screen.findByText("ZSJ系统管理员")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑登录标识" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新认证后编辑" }));
    await waitFor(() => { expect(beginSystemAccountReauthentication).toHaveBeenCalledTimes(1); });
  });

  it("submits only system-account login identifiers after server-computed reauthentication", async () => {
    const execute = vi.fn<WorkforceAdministrationPort["execute"]>().mockResolvedValue({});
    renderWorkforceAdministration({
      execute,
      load: () => Promise.resolve({
        accounts: [], departments: [], positions: [],
        systemAccount: { accountId: "10000000-0000-4000-8000-000000000009", allowedActions: ["edit"], crmAdministrator: false, legalName: "ZSJ系统管理员", phone: "+8613800000000", releasablePhones: [], revision: 4, status: "active", username: "system.admin" },
      }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "编辑登录标识" }));
    fireEvent.change(screen.getByLabelText("用户名（昵称）"), { target: { value: "system.admin.two" } });
    fireEvent.change(screen.getByLabelText("手机号（可用于登录）"), { target: { value: "+8613900000000" } });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/u }));
    await waitFor(() => { expect(execute).toHaveBeenCalledWith({ accountId: "10000000-0000-4000-8000-000000000009", expectedRevision: 4, kind: "update_system_account", phone: "+8613900000000", username: "system.admin.two" }); });
    expect(JSON.stringify(execute.mock.calls)).not.toMatch(/legalName|department|position/u);
  }, 10_000);

  it.each([320, 360])("keeps dynamic long text in bounded elements at %ipx", async (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    renderApp("/tasks", { bootstrap: () => Promise.resolve(longReady), logout: vi.fn() });

    const title = (await screen.findAllByTitle(longText)).find((element) => element.classList.contains("truncate-text"));
    expect(title).toBeDefined();
    expect(title).toHaveClass("truncate-text");
    expect(screen.getAllByText(longText).some((element) => element.classList.contains("break-text"))).toBe(true);
    expect(screen.getByRole("button", { name: "退出当前会话" })).toHaveAccessibleName("退出当前会话");
  });
});
