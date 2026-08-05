import { Buffer } from "node:buffer";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadInternalSessionConfiguration } from "./config.js";

const indexPath = resolve(import.meta.dirname, "__synthetic-secrets__", "session-index");
const redisPath = resolve(import.meta.dirname, "__synthetic-secrets__", "redis");
const secrets: Readonly<Record<string, string>> = Object.freeze({
  [indexPath]: Buffer.alloc(32, 9).toString("base64url"),
  [redisPath]: "synthetic-redis-secret",
});
const secretFilePolicy = {
  fileSystem: {
    inspect: (filePath: string) => Promise.resolve({ isFile: filePath in secrets, isSymbolicLink: false, mode: 0o400, size: Buffer.byteLength(secrets[filePath] ?? "", "utf8") }),
    read: (filePath: string) => Promise.resolve(secrets[filePath] ?? ""),
  },
} as const;
const env: NodeJS.ProcessEnv = {
  AI_CRM_INTERNAL_H5_ALLOWED_ORIGIN: "http://127.0.0.1:10086",
  AI_CRM_PC_ALLOWED_ORIGIN: "http://127.0.0.1:3000",
  AI_CRM_REDIS_CONNECT_TIMEOUT_MS: "1000",
  AI_CRM_REDIS_PASSWORD_FILE: redisPath,
  AI_CRM_REDIS_URL: "redis://127.0.0.1:6379",
  AI_CRM_SESSION_INDEX_KEY_FILE: indexPath,
};

describe("internal session configuration", () => {
  it("loads the two browser surfaces and one server-side indexing key", async () => {
    await expect(loadInternalSessionConfiguration({ env, secretFilePolicy })).resolves.toMatchObject({
      internalH5AllowedOrigin: "http://127.0.0.1:10086",
      pcAllowedOrigin: "http://127.0.0.1:3000",
      redisConnectTimeoutMs: 1000,
      redisPassword: "synthetic-redis-secret",
      redisUrl: "redis://127.0.0.1:6379",
    });
    expect((await loadInternalSessionConfiguration({ env, secretFilePolicy })).sessionIndexingKey).toHaveLength(32);
    await expect(loadInternalSessionConfiguration({ env: { ...env, AI_CRM_PC_ALLOWED_ORIGIN: "http://[::1]:3000" }, secretFilePolicy }))
      .resolves.toMatchObject({ pcAllowedOrigin: "http://[::1]:3000" });
  });

  it("rejects non-loopback HTTP origins and malformed indexing keys", async () => {
    await expect(loadInternalSessionConfiguration({ env: { ...env, AI_CRM_PC_ALLOWED_ORIGIN: "http://workbench.example.test" }, secretFilePolicy }))
      .rejects.toMatchObject({ code: "authentication_dependency_unavailable" });
    const malformedPolicy = { fileSystem: { ...secretFilePolicy.fileSystem, read: (path: string) => Promise.resolve(path === indexPath ? "too-short" : secrets[path] ?? "") } } as const;
    await expect(loadInternalSessionConfiguration({ env, secretFilePolicy: malformedPolicy }))
      .rejects.toMatchObject({ code: "authentication_dependency_unavailable" });
  });
});
