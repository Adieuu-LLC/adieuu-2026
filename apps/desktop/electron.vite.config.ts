import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';
import { cspPlugin } from '../../packages/shared/src/csp/vite-plugin-csp';
import { cspManifest, devCspExtras } from './src/csp';

export default defineConfig({
  main: {
    // Load `.env` from apps/desktop so main-process code can read ADIEUU_* at dev time.
    envDir: __dirname,
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: 'src/main.ts',
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: 'src/preload.ts',
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    // Load VITE_* vars from apps/desktop/.env (not src/renderer/.env)
    envDir: __dirname,
    publicDir: path.resolve(__dirname, '../../packages/ui/public'),
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html'),
        external: [
          'lib-jitsi-meet',
          /^@jitsi\//,
        ],
      },
    },
    optimizeDeps: {
      include: ['lib-jitsi-meet'],
    },
    plugins: [
      react(),
      cspPlugin({
        manifests: [
          cspManifest,
          // Jitsi origins for local dev -- kept in manifests (not just
          // devExtras) so Vite 6's CSP re-processing preserves them.
          // Includes WS for XMPP and HTTPS for Jitsi's keep-alive fetch.
          ...(process.env.NODE_ENV !== 'production'
            ? [{ 'connect-src': ['ws://localhost:*', 'wss://localhost:*', 'wss://localhost', 'https://localhost', 'https://localhost:*'] }]
            : []),
        ],
        devExtras: devCspExtras,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
        // In dev mode, resolve @adieuu/ui to source files for instant HMR
        // More specific paths MUST come before less specific ones
        '@adieuu/ui/styles.scss': path.resolve(__dirname, '../../packages/ui/src/styles.scss'),
        '@adieuu/ui/icons/registry': path.resolve(__dirname, '../../packages/ui/src/icons/registry.ts'),
        '@adieuu/ui/i18n': path.resolve(__dirname, '../../packages/ui/src/i18n/index.ts'),
        '@adieuu/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
        'lib-jitsi-meet': path.resolve(__dirname, '../../packages/ui/node_modules/lib-jitsi-meet/dist/umd/lib-jitsi-meet.min.js'),
      },
    },
    // Inject static app version; endpoint defaults are handled in renderer config.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DOWNLOADS_BASE_URL__: JSON.stringify(
        process.env.VITE_DOWNLOADS_BASE_URL || 'https://downloads.adieuu.com',
      ),
    },
  },
});
