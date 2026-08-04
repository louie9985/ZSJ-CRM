import { createHash } from "node:crypto";

import type { BusinessConfigurationService, ConfigurationActor, ResolvedParameter } from "@ai-crm/platform-business-configuration";

export const PC_SESSION_LIMIT_KEY = "platform.authentication.pc-session.concurrent-limit";
export const PC_SESSION_REVOCATION_TARGET_KEY = "platform.authentication.pc-session.revocation-target-seconds";
const GLOBAL_SCOPE = Object.freeze({ scopeReference: "pc-web", scopeType: "application" });

export interface PcSessionPolicy {
  readonly concurrentLimit: number;
  readonly revocationTargetSeconds: number;
}

export interface PcSessionPolicyPort {
  get(input: { readonly actor: ConfigurationActor; readonly at?: string }): Promise<PcSessionPolicy>;
  update(input: { readonly actor: ConfigurationActor; readonly concurrentLimit: number; readonly operationId: string; readonly reason: string; readonly revocationTargetSeconds: number; readonly traceId: string }): Promise<PcSessionPolicy>;
}

function operationId(base: string, suffix: string): string {
  const hex = createHash("sha256").update(`${base}\0${suffix}`).digest("hex").slice(0, 32);
  const variants = ["8", "9", "a", "b"] as const;
  const variant = variants[Number.parseInt(hex.charAt(16), 16) % variants.length] ?? "8";
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function integer(result: ResolvedParameter, minimum: number, maximum: number): number {
  if (typeof result.value !== "number" || !Number.isSafeInteger(result.value) || result.value < minimum || result.value > maximum) throw new Error("pc_session_policy_invalid");
  return result.value;
}

export function createPcSessionPolicyPort(configuration: BusinessConfigurationService, transaction: <T>(work: () => Promise<T>) => Promise<T>, clock: () => Date = () => new Date(), onLimitReduced?: (limit: number, input: Parameters<PcSessionPolicyPort["update"]>[0]) => Promise<void>): PcSessionPolicyPort {
  const get = async (input: { readonly actor: ConfigurationActor; readonly at?: string }): Promise<PcSessionPolicy> => {
    const at = input.at ?? clock().toISOString();
    const scopes = [GLOBAL_SCOPE];
    const [limit, target] = await Promise.all([
      configuration.resolveParameter({ actor: input.actor, at, parameterKey: PC_SESSION_LIMIT_KEY, scopes }),
      configuration.resolveParameter({ actor: input.actor, at, parameterKey: PC_SESSION_REVOCATION_TARGET_KEY, scopes }),
    ]);
    return Object.freeze({ concurrentLimit: integer(limit, 1, 5), revocationTargetSeconds: integer(target, 5, 60) });
  };
  const updateOne = async (input: Parameters<PcSessionPolicyPort["update"]>[0], parameterKey: string, value: number, suffix: string): Promise<void> => {
    const now = clock().toISOString();
    const current = await configuration.resolveParameter({ actor: input.actor, at: now, parameterKey, scopes: [GLOBAL_SCOPE] });
    const release = await configuration.publishParameterValue({ actor: input.actor, operationId: operationId(input.operationId, `${suffix}:publish`), parameterKey, reason: input.reason, traceId: input.traceId, value });
    if (release.replayed && current.source === "activation" && current.valueVersion === release.release.valueVersion) return;
    if (current.activationId !== undefined) await configuration.terminateParameterActivation({ activationId: current.activationId, actor: input.actor, effectiveTo: now, operationId: operationId(input.operationId, `${suffix}:terminate`), parameterKey, reason: input.reason, terminationId: operationId(input.operationId, `${suffix}:termination`), traceId: input.traceId });
    await configuration.activateParameter({ activationId: operationId(input.operationId, `${suffix}:activation`), actor: input.actor, effectiveFrom: now, operationId: operationId(input.operationId, `${suffix}:activate`), parameterKey, reason: input.reason, scope: GLOBAL_SCOPE, traceId: input.traceId, valueVersion: release.release.valueVersion });
  };
  const port: PcSessionPolicyPort = {
    get,
    async update(input: Parameters<PcSessionPolicyPort["update"]>[0]) {
      if (!Number.isSafeInteger(input.concurrentLimit) || input.concurrentLimit < 1 || input.concurrentLimit > 5 || !Number.isSafeInteger(input.revocationTargetSeconds) || input.revocationTargetSeconds < 5 || input.revocationTargetSeconds > 60) throw new Error("pc_session_policy_invalid");
      const before = await get({ actor: input.actor });
      await transaction(async () => {
        await updateOne(input, PC_SESSION_LIMIT_KEY, input.concurrentLimit, "limit");
        await updateOne(input, PC_SESSION_REVOCATION_TARGET_KEY, input.revocationTargetSeconds, "target");
      });
      if (input.concurrentLimit < before.concurrentLimit) await onLimitReduced?.(input.concurrentLimit, input);
      return get({ actor: input.actor });
    },
  };
  return Object.freeze(port);
}
