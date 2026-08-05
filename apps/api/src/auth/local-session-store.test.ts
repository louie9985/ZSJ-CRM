import { describe, expect, it, vi } from "vitest";

import { createRedisAccessSessionStore } from "./local-session-store.js";

const credential = "a".repeat(43);
const nextCredential = "b".repeat(43);
const accountId = "10000000-0000-4000-8000-000000000001";
const session = Object.freeze({ absoluteExpiresAtMs: 30_000, accountId, authenticatedAtMs: 1_000, createdAtMs: 1_000, csrfToken: "c".repeat(43), securityRevision: 2, sessionId: "d".repeat(43), surface: "pc" as const, workforcePersonId: "10000000-0000-4000-8000-000000000002" });

describe("Redis access session store", () => {
  it("uses keyed digests for credentials and account indexes", async () => {
    const commands: string[][] = [];
    const sendCommand = vi.fn((arguments_: readonly string[]) => { commands.push([...arguments_]); return Promise.resolve(1); });
    const store = createRedisAccessSessionStore({ sendCommand }, new Uint8Array(32).fill(7));
    await store.create("pc", credential, session, 10_000);
    const keys = JSON.stringify(commands[0]?.slice(3, 5));
    const command = JSON.stringify(commands[0]);
    expect(keys).not.toContain(credential);
    expect(keys).not.toContain(accountId);
    expect(command).not.toContain("passwordHash");
  });

  it("touches a valid session and rejects a failed atomic rotation", async () => {
    const sendCommand = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(session))
      .mockResolvedValueOnce(0);
    const store = createRedisAccessSessionStore({ sendCommand }, new Uint8Array(32).fill(3));
    await expect(store.get("pc", credential, 10_000, 2_000)).resolves.toEqual(session);
    await expect(store.rotate("pc", credential, nextCredential, session, 10_000, 2_000)).rejects.toMatchObject({ code: "authentication_required" });
  });

  it("reads liveness without extending the idle TTL", async () => {
    const sendCommand = vi.fn().mockResolvedValueOnce([JSON.stringify(session), "7000"]);
    const store = createRedisAccessSessionStore({ sendCommand }, new Uint8Array(32).fill(4));
    await expect(store.peek("pc", credential, 2_000)).resolves.toEqual({ idleExpiresAtMs: 9_000, session });
    const command = sendCommand.mock.calls[0]?.[0] as readonly string[];
    expect(command.join("\n")).not.toContain("PEXPIRE");
    expect(command.at(-1)).toBe("2000");
  });

  it("rejects a non-positive rotation TTL before deleting the old credential", async () => {
    const sendCommand = vi.fn();
    const store = createRedisAccessSessionStore({ sendCommand }, new Uint8Array(32).fill(8));
    await expect(store.rotate("pc", credential, nextCredential, session, 0, 2_000)).rejects.toMatchObject({ code: "authentication_required" });
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it("rejects an invalid Session or derived account TTL before invoking Lua", async () => {
    const sendCommand = vi.fn();
    const store = createRedisAccessSessionStore({ sendCommand }, new Uint8Array(32).fill(8));
    await expect(store.create("pc", credential, { ...session, absoluteExpiresAtMs: Number.NaN }, 10_000))
      .rejects.toMatchObject({ code: "authentication_required" });
    await expect(store.rotate("pc", credential, nextCredential, { ...session, surface: "internal-h5" }, 10_000, 2_000))
      .rejects.toMatchObject({ code: "authentication_required" });
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it("deletes only the exact session value observed before the Lua mutation", async () => {
    const raw = JSON.stringify(session);
    const sendCommand = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(1);
    const store = createRedisAccessSessionStore({ sendCommand }, new Uint8Array(32).fill(6));
    await store.delete("pc", credential);
    const command = sendCommand.mock.calls[1]?.[0] as readonly string[];
    expect(command).toContain(raw);
    expect(command.join("\n")).toContain("value~=ARGV[1]");
  });

  it("atomically reserves attempts and enforces failure thresholds", async () => {
    const sendCommand = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const store = createRedisAccessSessionStore({ sendCommand }, new Uint8Array(32).fill(5));
    await expect(store.admitLoginAttempt("user", "192.0.2.1", 0)).resolves.toBe(true);
    await expect(store.admitLoginAttempt("other", "192.0.2.1", 0)).resolves.toBe(false);
    const command = sendCommand.mock.calls[0]?.[0] as readonly string[];
    expect(command.join("\n")).toContain("currentA>=tonumber(ARGV[2])");
  });

  it("clears the successful identifier without erasing prior source failures", async () => {
    const sendCommand = vi.fn().mockResolvedValue(1);
    const store = createRedisAccessSessionStore({ sendCommand }, new Uint8Array(32).fill(5));

    await store.recordLoginSuccess("user", "192.0.2.1");

    const command = sendCommand.mock.calls[0]?.[0] as readonly string[];
    expect(command[0]).toBe("EVAL");
    expect(command[1]).toContain("redis.call('DEL',KEYS[1])");
    expect(command[1]).toContain("redis.call('DECR',KEYS[2])");
    expect(command[1]).not.toContain("redis.call('DEL',KEYS[1],KEYS[2])");
  });
});
