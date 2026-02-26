import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(__dirname, '../../packages/ui/public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // In dev mode, resolve @adieuu/ui to source files for instant HMR
      // More specific paths MUST come before less specific ones
      '@adieuu/ui/styles.scss': path.resolve(__dirname, '../../packages/ui/src/styles.scss'),
      '@adieuu/ui/i18n': path.resolve(__dirname, '../../packages/ui/src/i18n/index.ts'),
      '@adieuu/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
