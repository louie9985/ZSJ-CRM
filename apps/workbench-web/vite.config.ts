import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const bffTarget = process.env["AI_CRM_WORKBENCH_BFF_ORIGIN"] ?? "http://127.0.0.1:13001";

function vendorChunk(id: string): string | undefined {
  const path = id.replaceAll("\\", "/");
  if (!path.includes("/node_modules/")) return undefined;
  if (/\/(?:react|react-dom|react-is|react-router|react-router-dom|scheduler)\//u.test(path)) return "vendor-react";
  if (path.includes("/@tanstack/")) return "vendor-query";
  if (path.includes("/@ant-design/pro-components")) return "vendor-pro-layout";
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/auth": { changeOrigin: true, target: bffTarget },
      "/authentication": { changeOrigin: true, target: bffTarget },
      "/files": { changeOrigin: true, target: bffTarget },
      "/form-definitions": { changeOrigin: true, target: bffTarget },
      "/notifications": { changeOrigin: true, target: bffTarget },
      "/notification-templates": { changeOrigin: true, target: bffTarget },
      "/realtime": { changeOrigin: true, target: bffTarget, ws: true },
      "/tasks": { changeOrigin: true, target: bffTarget },
      "/workbench": { changeOrigin: true, target: bffTarget },
      "/workforce-administration": { changeOrigin: true, target: bffTarget },
    },
    strictPort: true,
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
        onlyExplicitManualChunks: true,
      },
    },
  },
});
