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
      },
    },
  },
  renderer: {
    root: 'src/renderer',
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
      },
    },
  },
});
