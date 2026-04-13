import path from 'path';
import { existsSync } from 'fs';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';

export function getMainDirname(importMetaUrl: string): string {
  return path.dirname(fileURLToPath(importMetaUrl));
}

/**
 * dist/main -> ../../.env ; src (rare) -> ../.env — avoid loading repo-root .env by mistake
 */
export function loadDesktopEnvIfPresent(mainDirname: string): void {
  const desktopEnvPath = mainDirname.endsWith(`${path.sep}src`)
    ? path.resolve(mainDirname, '../.env')
    : path.resolve(mainDirname, '../../.env');
  if (existsSync(desktopEnvPath)) {
    loadDotenv({ path: desktopEnvPath });
  }
}
