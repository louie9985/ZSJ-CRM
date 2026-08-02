import { describe, expect, it, vi } from "vitest";

import { createSameSiteCollectionPollingPort } from "./same-site-collection-port";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });
}

function requestPath(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("same-site durable collection polling", () => {
  it("maps contract task and notification facts without marking them as fixtures", async () => {
    const fetchPort = vi.fn((input: RequestInfo | URL) => Promise.resolve(requestPath(input).startsWith("/tasks")
      ? response({ items: [{ sourceTaskId: "source-task.main-chain-synthetic", sourceType: "tests.walking-skeleton", sourceVersion: 2, status: "completed" }] })
      : response({ items: [{ notificationId: "93000000-0000-4000-8000-000000000001", sourceId: "source-task.main-chain-synthetic", sourceType: "tests.walking-skeleton", title: "Synthetic result" }] })));

    const result = await createSameSiteCollectionPollingPort(fetchPort).pollCollections();

    expect(result.tasks).toMatchObject({ fixture: false, items: [{ id: "source-task.main-chain-synthetic", status: "已完成" }] });
    expect(result.notifications).toMatchObject({ fixture: false, items: [{ status: "未读", summary: "来源 tests.walking-skeleton:source-task.main-chain-synthetic" }] });
    expect(fetchPort).toHaveBeenCalledWith("/tasks?limit=50", expect.objectContaining({ credentials: "same-origin", method: "GET" }));
    expect(fetchPort).toHaveBeenCalledWith("/notifications?limit=50", expect.objectContaining({ credentials: "same-origin", method: "GET" }));
  });

  it("fails closed on unavailable or malformed facts", async () => {
    await expect(createSameSiteCollectionPollingPort(() => Promise.resolve(response({}, 503))).pollCollections()).rejects.toThrow("workbench_tasks_unavailable_503");
    const malformed = vi.fn((input: RequestInfo | URL) => Promise.resolve(requestPath(input).startsWith("/tasks")
      ? response({ items: [{ sourceTaskId: "bad/id", sourceType: "tests.walking-skeleton", sourceVersion: 2, status: "completed" }] })
      : response({ items: [] })));
    await expect(createSameSiteCollectionPollingPort(malformed).pollCollections()).rejects.toThrow("workbench_task_source_invalid");
  });
});
