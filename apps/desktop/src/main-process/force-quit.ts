import { app, BrowserWindow } from 'electron';
import { runtime } from './runtime';
import { clearUpdateCheckTimer } from './auto-updater';
import { destroyBridgeWindow } from '../webauthn-bridge';

const FORCE_EXIT_TIMEOUT_MS = 5_000;

/**
 * Forcefully terminate the application, bypassing `beforeunload` handlers
 * and other close interceptors. Used by tray "Quit" and `app:quit` IPC to
 * ensure the process always exits on Linux/KDE where graceful `app.quit()`
 * can stall if a BrowserWindow blocks its `close` event.
 */
export function forceQuitApp(): void {
  runtime.isQuitting = true;

  clearUpdateCheckTimer();
  destroyBridgeWindow();

  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch {
      // ignore teardown races
    }
  }

  const timeout = setTimeout(() => {
    console.error('[Main] forceQuitApp: graceful quit timed out, forcing exit');
    process.exit(0);
  }, FORCE_EXIT_TIMEOUT_MS);
  timeout.unref();

  app.quit();
}
