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
import { fileURLToPath, pathToFileURL } from 'node:url';

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

export function getElectronCacheRoot() {
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, 'electron');
  }
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Caches', 'electron');
    case 'win32':
      return path.join(process.env.LOCALAPPDATA || os.homedir(), 'electron', 'Cache');
    default:
      return path.join(os.homedir(), '.cache', 'electron');
  }
}

function findCachedZip(version) {
  const cacheRoot = getElectronCacheRoot();
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

function extractFromZip(electronDir, zipPath) {
  const distDir = path.join(electronDir, 'dist');
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const result =
    process.platform === 'win32'
      ? spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${distDir.replace(/'/g, "''")}' -Force`,
          ],
          { stdio: 'inherit' },
        )
      : spawnSync('unzip', ['-q', '-o', zipPath, '-d', distDir], {
          stdio: 'inherit',
        });

  if (result.status !== 0) {
    const tool = process.platform === 'win32' ? 'Expand-Archive' : 'unzip';
    throw new Error(`${tool} failed with exit code ${result.status ?? 'unknown'}`);
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
        `If the problem persists, clear ${getElectronCacheRoot()} and install again.`,
    );
  }

  extractFromZip(electronDir, zipPath);

  if (!isReady(electronDir)) {
    throw new Error('Electron binary is still missing after cache extract fallback.');
  }

  console.log(`[ensure-electron] Installed Electron ${version} from cache`);
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main();
}
