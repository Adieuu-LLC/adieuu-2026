import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import pkg from './package.json';
import { cspPlugin } from '../../packages/shared/src/csp/vite-plugin-csp';
import { cspManifest } from './src/csp';

function versionJsonPlugin(): Plugin {
  return {
    name: 'version-json',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'version.json'),
        JSON.stringify({ version: pkg.version }) + '\n',
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    cspPlugin({
      manifests: [cspManifest],
      devExtras: {
        'connect-src': ['ws://localhost:*', 'wss://localhost:*'],
      },
    }),
    versionJsonPlugin(),
  ],
  publicDir: path.resolve(__dirname, '../../packages/ui/public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // In dev mode, resolve @adieuu/ui to source files for instant HMR
      // More specific paths MUST come before less specific ones
      '@adieuu/ui/styles.scss': path.resolve(__dirname, '../../packages/ui/src/styles.scss'),
      '@adieuu/ui/icons/registry': path.resolve(__dirname, '../../packages/ui/src/icons/registry.ts'),
      '@adieuu/ui/i18n': path.resolve(__dirname, '../../packages/ui/src/i18n/index.ts'),
      '@adieuu/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    hmr: {
      protocol: 'wss',
      host: 'localhost',
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __DOWNLOADS_BASE_URL__: JSON.stringify(
      process.env.VITE_DOWNLOADS_BASE_URL || 'https://downloads.adieuu.com',
    ),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: [
        'lib-jitsi-meet',
        /^@jitsi\//,
      ],
    },
  },
  optimizeDeps: {
    exclude: ['lib-jitsi-meet'],
  },
});
