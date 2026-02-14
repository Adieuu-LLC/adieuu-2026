import { defineConfig } from 'electron-vite';
import path from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist',
      lib: {
        entry: 'src/main.ts',
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist',
      lib: {
        entry: 'src/preload.ts',
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
  },
});
