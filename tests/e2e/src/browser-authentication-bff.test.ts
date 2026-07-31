import { describe, expect, it, vi } from "vitest";

import { closeBrowserAuthenticationBffResources } from "./browser-authentication-bff.js";

describe("browser authentication BFF cleanup", () => {
  it("closes Redis even when application shutdown fails", async () => {
    const stopFailure = new Error("synthetic_application_stop_failure");
    const stop = vi.fn().mockRejectedValue(stopFailure);
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(closeBrowserAuthenticationBffResources({ stop }, { close })).rejects.toMatchObject({
      errors: [stopFailure],
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports both independent cleanup failures", async () => {
    const stopFailure = new Error("synthetic_application_stop_failure");
    const redisFailure = new Error("synthetic_redis_close_failure");

    await expect(closeBrowserAuthenticationBffResources(
      { stop: () => Promise.reject(stopFailure) },
      { close: () => Promise.reject(redisFailure) },
    )).rejects.toMatchObject({ errors: [stopFailure, redisFailure] });
  });
});
