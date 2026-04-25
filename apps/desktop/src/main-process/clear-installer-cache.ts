import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { type App } from 'electron';

/**
 * Default when `app-update.yml` is missing. Must match electron-builder's
 * `appInfo.updaterCacheDirName` for this app (`@adieuu/desktop` in package.json).
 * Do not use `app.getName()` here: in dev, `app.name` is set to "Adieuu-Dev" in main.ts
 * and would point at the wrong directory.
 */
export const DEFAULT_UPDATER_CACHE_DIR_NAME = '@adieuudesktop-updater';

/**
 * Resolves the directory electron-updater uses for NSIS/zip blockmaps and
 * pending installer files, matching getOrCreateDownloadHelper in
 * electron-updater (AppUpdater.getOrCreateDownloadHelper).
 */
export function getBaseCachePath(): string {
  const homedir = os.homedir();
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
  }
  if (process.platform === 'darwin') {
    return path.join(homedir, 'Library', 'Caches');
  }
  return process.env.XDG_CACHE_HOME || path.join(homedir, '.cache');
}

/** Parse `updaterCacheDirName` from app-update.yml (or dev-app-update.yml) content. */
export function parseUpdaterCacheDirNameFromYml(yml: string): string | null {
  const m = yml.match(/^\s*updaterCacheDirName:\s*(.+?)\s*$/m);
  const raw = m?.[1];
  if (raw == null) return null;
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v || null;
}

/**
 * Rejects paths that would delete the base cache root or escape it (e.g. via `..`).
 */
export function assertUpdaterCachePathIsSafe(
  baseCache: string,
  fullPath: string,
): void {
  const resolvedBase = path.resolve(baseCache);
  const resolvedTarget = path.resolve(fullPath);
  if (resolvedTarget === resolvedBase) {
    throw new Error('Refusing to remove the cache root directory');
  }
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Refusing to remove a path outside the application cache');
  }
}

/**
 * Sanitize directory segment from yml: non-empty, no path traversal.
 */
function normalizeCacheDirName(raw: string | null, fallback: string): string {
  const candidate = (raw ?? fallback).trim();
  if (candidate.length === 0 || candidate === '.' || candidate === '..') {
    return fallback;
  }
  const norm = path.normalize(candidate);
  if (norm.includes('..') || path.isAbsolute(norm) || norm === '.' || norm === '..') {
    return fallback;
  }
  return candidate;
}

/**
 * Full path to the updater cache (contains `pending/` and `current.blockmap`).
 * Matches path.join(getBaseCachePath(), dirName) where dirName comes from yml
 * or `DEFAULT_UPDATER_CACHE_DIR_NAME` (same as electron-updater when yml is present).
 */
export async function resolveUpdaterCacheDirectory(electronApp: App): Promise<string> {
  const ymlPath = electronApp.isPackaged
    ? path.join(process.resourcesPath, 'app-update.yml')
    : path.join(electronApp.getAppPath(), 'dev-app-update.yml');

  let fromYml: string | null = null;
  try {
    const fileContent = await fs.readFile(ymlPath, 'utf-8');
    fromYml = parseUpdaterCacheDirNameFromYml(fileContent);
  } catch {
    // no dev yml in local dev: use default
  }

  const baseCache = getBaseCachePath();
  const dirName = normalizeCacheDirName(fromYml, DEFAULT_UPDATER_CACHE_DIR_NAME);
  const full = path.join(baseCache, dirName);
  assertUpdaterCachePathIsSafe(baseCache, full);
  return full;
}

export async function removeUpdaterCacheDirectory(absolutePath: string): Promise<void> {
  try {
    await fs.rm(absolutePath, { recursive: true, force: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

export type ClearInstallerCacheResult = { ok: true } | { ok: false; error: string };
