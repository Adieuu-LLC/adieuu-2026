#!/usr/bin/env node
/**
 * Start the desktop app, stripping IDE-injected Electron env vars that break dev.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopDir = path.join(root, 'apps/desktop');

await import('./ensure-electron.mjs');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ATOM_SHELL_INTERNAL_RUN_AS_NODE;

const electronVite = path.join(
  desktopDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite',
);

const result = spawnSync(electronVite, ['dev'], {
  cwd: desktopDir,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
