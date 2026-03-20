import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

export default defineConfig({
  main: {
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
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
        // In dev mode, resolve @adieuu/ui to source files for instant HMR
        // More specific paths MUST come before less specific ones
        '@adieuu/ui/styles.scss': path.resolve(__dirname, '../../packages/ui/src/styles.scss'),
        '@adieuu/ui/i18n': path.resolve(__dirname, '../../packages/ui/src/i18n/index.ts'),
        '@adieuu/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      },
    },
    // Inject static app version; endpoint defaults are handled in renderer config.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  },
});
