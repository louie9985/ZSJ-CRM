import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// dev proxy：把 /api/v1 转发到本地 server（对齐全局前缀 api/v1）。
// shared-core 直连 TS 源码：Vite/esbuild 原生编译，免 CJS interop、免构建顺序依赖。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@zsj/shared-core': fileURLToPath(
        new URL('../shared-core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
