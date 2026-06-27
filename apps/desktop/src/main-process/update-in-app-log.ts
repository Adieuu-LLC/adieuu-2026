import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

const RELATIVE_DIR = 'logs';
const LOG_FILENAME = 'update.log';

/**
 * In-app (electron-updater) diagnostics — all desktop platforms, next to
 * `userData` (e.g. ~/.config/.../logs/update.log on Linux).
 */
export function getInAppUpdateLogPath(): string {
  return path.join(app.getPath('userData'), RELATIVE_DIR, LOG_FILENAME);
}

/**
 * Appends a single ISO-timestamped line. Never throws to callers; failures
 * are logged to stderr only.
 */
export async function appendInAppUpdateLog(message: string): Promise<void> {
  const filePath = getInAppUpdateLogPath();
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, line, 'utf-8');
  } catch (err) {
    console.error('[InAppUpdateLog] write failed:', err);
  }
}

/**
 * If the file is missing, create it with a short header so shell.openPath can
 * open it (e.g. first open from the Updates page before any update run).
 */
export async function ensureInAppUpdateLogFileForOpen(): Promise<void> {
  const filePath = getInAppUpdateLogPath();
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      const header = `${new Date().toISOString()} In-app update log (no update events yet; checks, downloads, and errors are logged here.)\n`;
      await fs.writeFile(filePath, header, 'utf-8');
    }
  } catch (err) {
    console.error('[InAppUpdateLog] ensure file failed:', err);
    throw err;
  }
}
