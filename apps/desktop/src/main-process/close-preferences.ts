import path from 'path';
import fs from 'fs/promises';
import { app } from 'electron';

export type CloseBehavior = 'close' | 'minimize-to-tray';

export interface ClosePreferences {
  behavior: CloseBehavior;
  hasBeenAsked: boolean;
}

export const DEFAULT_CLOSE_PREFS: ClosePreferences = {
  behavior: 'minimize-to-tray',
  hasBeenAsked: false,
};

const CLOSE_PREFS_FILE = 'close-preferences.json';

const VALID_BEHAVIORS: ReadonlySet<string> = new Set(['close', 'minimize-to-tray']);

export function normalizeClosePreferences(
  parsed: Partial<ClosePreferences>,
  defaults: ClosePreferences = DEFAULT_CLOSE_PREFS,
): ClosePreferences {
  return {
    behavior:
      typeof parsed.behavior === 'string' && VALID_BEHAVIORS.has(parsed.behavior)
        ? (parsed.behavior as CloseBehavior)
        : defaults.behavior,
    hasBeenAsked:
      typeof parsed.hasBeenAsked === 'boolean'
        ? parsed.hasBeenAsked
        : defaults.hasBeenAsked,
  };
}

/** In-memory cache so the `close` event handler can read synchronously. */
let cached: ClosePreferences = { ...DEFAULT_CLOSE_PREFS };

export function getCachedClosePreferences(): ClosePreferences {
  return cached;
}

export async function readClosePreferences(): Promise<ClosePreferences> {
  try {
    const filePath = path.join(app.getPath('userData'), CLOSE_PREFS_FILE);
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ClosePreferences>;
    cached = normalizeClosePreferences(parsed);
  } catch {
    cached = { ...DEFAULT_CLOSE_PREFS };
  }
  return cached;
}

export async function writeClosePreferences(prefs: ClosePreferences): Promise<void> {
  cached = normalizeClosePreferences(prefs);
  const filePath = path.join(app.getPath('userData'), CLOSE_PREFS_FILE);
  await fs.writeFile(filePath, JSON.stringify(cached, null, 2), 'utf-8');
}
