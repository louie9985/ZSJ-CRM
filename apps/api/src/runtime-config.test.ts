import { describe, expect, it } from "vitest";
import { loadApiRuntimeConfiguration } from "./runtime-config.js";

describe("API runtime configuration", () => {
  it("uses the reviewed container defaults", async () => {
    await expect(loadApiRuntimeConfiguration({ env: {} })).resolves.toEqual({
      environment: "development", host: "0.0.0.0", instanceId: "api-local", port: 3000, release: "development",
      shutdownTimeoutMs: 30_000, startupTimeoutMs: 30_000, trustedProxyCidrs: [],
    });
  });

  it("rejects an invalid bind address and port", async () => {
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_API_HOST: "public.example", AI_CRM_API_PORT: "65536" } })).rejects.toThrow();
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_API_PORT: "0" } })).rejects.toThrow("api_ephemeral_port_test_only");
  });

  it("fails closed when production release or container binding is missing", async () => {
    await expect(loadApiRuntimeConfiguration({ env: { NODE_ENV: "production" } })).rejects.toThrow("api_release_required");
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_API_HOST: "127.0.0.1", AI_CRM_INSTANCE_ID: "api-1", AI_CRM_RELEASE: "2026.07.27.1", NODE_ENV: "production" } })).rejects.toThrow("api_production_bind_invalid");
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_RELEASE: "2026.07.27.1", NODE_ENV: "production" } })).rejects.toThrow("api_instance_id_required");
  });

  it("requires an explicit reverse-proxy CIDR allowlist in production", async () => {
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_INSTANCE_ID: "api-1", AI_CRM_RELEASE: "2026.08.04.1", NODE_ENV: "production" } }))
      .rejects.toThrow("api_production_trusted_proxy_required");
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_API_TRUSTED_PROXY_CIDRS: "172.30.0.0/24", AI_CRM_INSTANCE_ID: "api-1", AI_CRM_RELEASE: "2026.08.04.1", NODE_ENV: "production" } }))
      .resolves.toMatchObject({ trustedProxyCidrs: ["172.30.0.0/24"] });
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_API_TRUSTED_PROXY_CIDRS: "0.0.0.0/0", AI_CRM_INSTANCE_ID: "api-1", AI_CRM_RELEASE: "2026.08.04.1", NODE_ENV: "production" } }))
      .rejects.toThrow("api_trusted_proxy_cidrs_invalid");
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_API_TRUSTED_PROXY_CIDRS: "0.0.0.0/00", AI_CRM_INSTANCE_ID: "api-1", AI_CRM_RELEASE: "2026.08.04.1", NODE_ENV: "production" } }))
      .rejects.toThrow("api_trusted_proxy_cidrs_invalid");
    await expect(loadApiRuntimeConfiguration({ env: { AI_CRM_API_TRUSTED_PROXY_CIDRS: "0:0:0:0:0:0:0:0/0", AI_CRM_INSTANCE_ID: "api-1", AI_CRM_RELEASE: "2026.08.04.1", NODE_ENV: "production" } }))
      .rejects.toThrow("api_trusted_proxy_cidrs_invalid");
  });
});
