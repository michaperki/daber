import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Vite + Preact dev server. /api is proxied to the Fastify server on :3000 in
// dev. Production builds are served statically by apps/api.
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  css: {
    modules: {
      // Human-readable classnames in dev for easier debugging.
      generateScopedName: '[name]__[local]__[hash:base64:5]',
    },
  },
});
