import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default {
  base: './',
  resolve: {
    alias: {
      react: path.join(repoRoot, 'node_modules/react'),
      'react-dom': path.join(repoRoot, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 4178,
  },
};
