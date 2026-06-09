#!/usr/bin/env node
/**
 * Ensure the Electron binary is present under node_modules/electron/dist.
 * Falls back to unzip when electron's install.js leaves a partial extract.
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/desktop/package.json'));

function platformPath() {
  switch (process.platform) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'win32':
      return 'electron.exe';
    default:
      return 'electron';
  }
}

function getElectronDir() {
  return path.dirname(require.resolve('electron/package.json'));
}

function isReady(electronDir) {
  const { version } = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'));
  const executable = platformPath();

  try {
    const installedVersion = fs
      .readFileSync(path.join(electronDir, 'dist', 'version'), 'utf8')
      .replace(/^v/, '');
    const pathTxt = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim();
    if (installedVersion !== version || pathTxt !== executable) {
      return false;
    }
  } catch {
    return false;
  }

  return fs.existsSync(path.join(electronDir, 'dist', executable));
}

function runInstallScript(electronDir) {
  const result = spawnSync(process.execPath, ['install.js'], {
    cwd: electronDir,
    stdio: 'inherit',
  });
  return result.status === 0;
}

function findCachedZip(version) {
  const cacheRoot = path.join(os.homedir(), '.cache', 'electron');
  if (!fs.existsSync(cacheRoot)) {
    return null;
  }

  const zipName = `electron-v${version}-${process.platform}-${process.arch}.zip`;
  for (const entry of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(cacheRoot, entry, zipName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractWithUnzip(electronDir, zipPath) {
  const distDir = path.join(electronDir, 'dist');
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const result = spawnSync('unzip', ['-q', '-o', zipPath, '-d', distDir], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`unzip failed with exit code ${result.status ?? 'unknown'}`);
  }

  fs.writeFileSync(path.join(electronDir, 'path.txt'), platformPath());
}

function main() {
  const electronDir = getElectronDir();

  if (isReady(electronDir)) {
    return;
  }

  runInstallScript(electronDir);
  if (isReady(electronDir)) {
    return;
  }

  const { version } = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'));
  const zipPath = findCachedZip(version);
  if (!zipPath) {
    throw new Error(
      'Electron binary is missing. Re-run pnpm install, then retry. ' +
        'If the problem persists, clear ~/.cache/electron and install again.',
    );
  }

  extractWithUnzip(electronDir, zipPath);

  if (!isReady(electronDir)) {
    throw new Error('Electron binary is still missing after unzip fallback.');
  }

  console.log(`[ensure-electron] Installed Electron ${version} from cache`);
}

main();
