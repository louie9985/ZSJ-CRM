import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./lab', import.meta.url)),
  plugins: [react()],
  server: {
    port: 6006,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./lab-dist', import.meta.url)),
    emptyOutDir: true,
  },
});
