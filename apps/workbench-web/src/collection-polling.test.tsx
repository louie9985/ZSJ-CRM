import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { usePolledCollections } from "./collection-polling";
import type { BootstrapResult, WorkbenchPort } from "./workbench-port";

type ReadyCollections = Extract<BootstrapResult, { kind: "ready" }>["collections"];

function collection(title: string, fixture: boolean): ReadyCollections["tasks"] {
  return { fixture, items: [], statuses: ["全部"], title };
}

const initial: ReadyCollections = {
  files: collection("文件引用", true),
  forms: collection("表单", true),
  notifications: collection("通知", true),
  tasks: collection("任务", true),
};

describe("Workbench collection polling", () => {
  it("replaces only Task and Notification collections with observed server facts", async () => {
    const polled = {
      notifications: { ...collection("通知", false), items: [{ id: "notification-1", status: "未读", summary: "来源 tests.synthetic:source-1", tab: "active" as const, title: "结果" }] },
      tasks: { ...collection("任务", false), items: [{ id: "source-1", status: "已完成", summary: "来源 tests.synthetic · 版本 2", tab: "history" as const, title: "source-1" }] },
    };
    const pollCollections = vi.fn(() => Promise.resolve(polled));
    const port: WorkbenchPort = { beginLogin: vi.fn(), bootstrap: vi.fn(), logout: vi.fn(), pollCollections };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
      <QueryClientProvider client={client}>{children as unknown as Parameters<typeof QueryClientProvider>[0]["children"]}</QueryClientProvider>
    );

    const { result } = renderHook(() => usePolledCollections(port, initial, "assignment.synthetic"), { wrapper });

    await waitFor(() => { expect(result.current.tasks.fixture).toBe(false); });
    expect(result.current.tasks.items[0]?.id).toBe("source-1");
    expect(result.current.notifications.items[0]?.summary).toContain("tests.synthetic:source-1");
    expect(result.current.forms).toBe(initial.forms);
    expect(result.current.files).toBe(initial.files);
    expect(pollCollections).toHaveBeenCalledTimes(1);
  });
});
