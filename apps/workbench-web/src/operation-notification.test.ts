import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Dirent } from "node:fs";
import type { NotificationInstance } from "antd/es/notification/interface";
import { describe, expect, it, vi } from "vitest";
import { notifyOperation } from "./operation-notification";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries: Dirent[] = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

describe("operation notification", () => {
  it("uses a top-right operation notification with an extended error duration", () => {
    const error = vi.fn();
    const api = { error } as unknown as NotificationInstance;

    notifyOperation(api, "error", "操作未完成", "服务器未确认成功，请重试。");

    expect(error).toHaveBeenCalledWith(expect.objectContaining({
      className: "operation-notification",
      description: "服务器未确认成功，请重试。",
      duration: 8,
      placement: "topRight",
      title: "操作未完成",
    }));
  });

  it("does not use Message or result-style Alerts for operation feedback", async () => {
    const files = await sourceFiles(resolve(process.cwd(), "src"));
    const sources = await Promise.all(files.map(async (file) => ({ file, source: await readFile(file, "utf8") })));

    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/\bmessage\.(?:success|error|warning|info|open)\s*\(/u);
      if (!file.endsWith("App.tsx") && !file.endsWith("login-page.tsx")) expect(source, file).not.toMatch(/<Alert[\s\S]{0,240}?type="(?:success|error|warning)"/u);
    }
  });
});
