import { configuration, loadConfiguration, type LoadConfigurationOptions } from "@ai-crm/config";
import { isIP } from "node:net";

const schema = {
  environment: configuration.enumeration("NODE_ENV", ["development", "test", "production"], { default: "development" }),
  host: configuration.string("AI_CRM_API_HOST", { default: "0.0.0.0", pattern: /^(?:0\.0\.0\.0|127\.0\.0\.1|::1)$/u }),
  instanceId: configuration.string("AI_CRM_INSTANCE_ID", { default: "api-local", maxLength: 128, pattern: /^[a-z][a-z0-9_.-]*$/u }),
  port: configuration.integer("AI_CRM_API_PORT", { default: 3000, maximum: 65_535, minimum: 0 }),
  release: configuration.string("AI_CRM_RELEASE", { default: "development", maxLength: 128, pattern: /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u }),
  shutdownTimeoutMs: configuration.integer("AI_CRM_API_SHUTDOWN_TIMEOUT_MS", { default: 30_000, maximum: 300_000, minimum: 1 }),
  startupTimeoutMs: configuration.integer("AI_CRM_API_STARTUP_TIMEOUT_MS", { default: 30_000, maximum: 300_000, minimum: 1 }),
  trustedProxyCidrs: configuration.optionalString("AI_CRM_API_TRUSTED_PROXY_CIDRS", { maxLength: 1024 }),
} as const;

export interface ApiRuntimeConfiguration {
  readonly environment: "development" | "test" | "production";
  readonly host: string;
  readonly instanceId: string;
  readonly port: number;
  readonly release: string;
  readonly shutdownTimeoutMs: number;
  readonly startupTimeoutMs: number;
  readonly trustedProxyCidrs: readonly string[];
}

function parseTrustedProxyCidrs(raw: string | undefined): readonly string[] {
  if (raw === undefined) return Object.freeze([]);
  const values = raw.split(",").map((value) => value.trim());
  if (values.length === 0 || values.some((value) => value.length === 0)) throw new Error("api_trusted_proxy_cidrs_invalid");
  for (const value of values) {
    const [address, prefix, ...extra] = value.split("/");
    const family = address === undefined ? 0 : isIP(address);
    const maximum = family === 4 ? 32 : family === 6 ? 128 : -1;
    const numericPrefix = prefix === undefined || !/^\d+$/u.test(prefix) ? undefined : Number(prefix);
    if (extra.length > 0 || maximum < 0 || prefix !== undefined && (numericPrefix === undefined || numericPrefix > maximum || numericPrefix === 0)) {
      throw new Error("api_trusted_proxy_cidrs_invalid");
    }
  }
  return Object.freeze([...new Set(values)]);
}

export async function loadApiRuntimeConfiguration(options: LoadConfigurationOptions = {}): Promise<Readonly<ApiRuntimeConfiguration>> {
  const value = await loadConfiguration(schema, options);
  const trustedProxyCidrs = parseTrustedProxyCidrs(value.trustedProxyCidrs);
  if (value.port === 0 && value.environment !== "test") throw new Error("api_ephemeral_port_test_only");
  if (value.environment === "production" && value.release === "development") throw new Error("api_release_required");
  if (value.environment === "production" && value.instanceId === "api-local") throw new Error("api_instance_id_required");
  if (value.environment === "production" && (value.host !== "0.0.0.0" || value.port !== 3000)) {
    throw new Error("api_production_bind_invalid");
  }
  if (value.environment === "production" && trustedProxyCidrs.length === 0) throw new Error("api_production_trusted_proxy_required");
  return Object.freeze({ ...value, trustedProxyCidrs });
}
