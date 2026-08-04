import type { BusinessConfigurationService, ResolvedParameter } from "@ai-crm/platform-business-configuration";
import { describe, expect, it, vi } from "vitest";

import { createPcSessionPolicyPort, PC_SESSION_LIMIT_KEY, PC_SESSION_REVOCATION_TARGET_KEY } from "./session-policy.js";

const actor = Object.freeze({ actorId: "00000000-0000-4000-8000-000000000001", actorType: "authenticated_subject" as const });

describe("PC Session policy", () => {
  it("publishes and activates both bounded parameters atomically and enforces a reduced limit once on replay", async () => {
    const values = new Map([[PC_SESSION_LIMIT_KEY, 3], [PC_SESSION_REVOCATION_TARGET_KEY, 20]]);
    const versions = new Map([[PC_SESSION_LIMIT_KEY, 0], [PC_SESSION_REVOCATION_TARGET_KEY, 0]]);
    const activeVersions = new Map<string, number>();
    const receipts = new Map<string, number>();
    const transactionCalls = vi.fn();
    const transaction = async <T>(work: () => Promise<T>): Promise<T> => { transactionCalls(); return work(); };
    const reduced = vi.fn(() => Promise.resolve());
    const activateParameter = vi.fn((input: { readonly parameterKey: string; readonly valueVersion: number }) => { activeVersions.set(input.parameterKey, input.valueVersion); return Promise.resolve({ replayed: false }); });
    const service = {
      resolveParameter: vi.fn(({ parameterKey }: { readonly parameterKey: string }): Promise<ResolvedParameter> => Promise.resolve(activeVersions.has(parameterKey)
        ? { activationId: `00000000-0000-4000-8000-${parameterKey === PC_SESSION_LIMIT_KEY ? "000000000011" : "000000000012"}`, definitionVersion: 1, effectiveFrom: "2026-08-03T00:00:00.000Z", parameterKey, scope: { scopeReference: "pc-web", scopeType: "application" }, source: "activation", value: values.get(parameterKey) ?? 0, valueVersion: activeVersions.get(parameterKey) ?? 0, version: 1 }
        : { definitionVersion: 1, parameterKey, source: "default", value: values.get(parameterKey) ?? 0, valueVersion: 0, version: 1 })),
      publishParameterValue: vi.fn((input: { readonly operationId: string; readonly parameterKey: string; readonly value: number }) => {
        const prior = receipts.get(input.operationId);
        const next = prior ?? ((versions.get(input.parameterKey) ?? 0) + 1);
        receipts.set(input.operationId, next);
        versions.set(input.parameterKey, next);
        values.set(input.parameterKey, input.value);
        return Promise.resolve({ release: { contentDigest: "a".repeat(64), parameterKey: input.parameterKey, publishedAt: "2026-08-03T00:00:00.000Z", value: input.value, valueVersion: next, version: 1 as const }, replayed: prior !== undefined });
      }),
      activateParameter,
      terminateParameterActivation: vi.fn(() => Promise.resolve({ replayed: false, termination: {} })),
    } as unknown as BusinessConfigurationService;
    const port = createPcSessionPolicyPort(service, transaction, () => new Date("2026-08-03T00:00:00.000Z"), reduced);
    const command = { actor, concurrentLimit: 1, operationId: "00000000-0000-4000-8000-000000000020", reason: "test", revocationTargetSeconds: 5, traceId: "1".repeat(32) };

    await expect(port.update(command)).resolves.toEqual({ concurrentLimit: 1, revocationTargetSeconds: 5 });
    await expect(port.update(command)).resolves.toEqual({ concurrentLimit: 1, revocationTargetSeconds: 5 });
    expect(transactionCalls).toHaveBeenCalledTimes(2);
    expect(activateParameter).toHaveBeenCalledTimes(2);
    expect(reduced).toHaveBeenCalledOnce();
    await expect(port.update({ ...command, concurrentLimit: 0 })).rejects.toThrow("pc_session_policy_invalid");
  });
});
