import type { BrowserWindow } from 'electron';

/**
 * Shared main-process state (replaces module-level `let` in main.ts for clearer imports).
 */
export const runtime = {
  mainWindow: null as BrowserWindow | null,
  pendingDeepLinkPath: null as string | null,
  isPlatformAdminUser: false,
};
