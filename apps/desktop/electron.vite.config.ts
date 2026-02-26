import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
    // Environment variable defaults - can be overridden via .env file
    define: {
      // Provide fallback for VITE_API_URL if not set in environment
      'import.meta.env.VITE_API_URL': JSON.stringify(
        process.env.VITE_API_URL ?? 'http://localhost:4000'
      ),
    },
  },
});
