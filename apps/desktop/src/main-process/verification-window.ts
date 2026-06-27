/**
 * Opens a sandboxed child BrowserWindow for the VerifyMy hosted verification flow.
 *
 * Strict webPreferences: contextIsolation, no Node, sandbox enabled.
 * The window is destroyed when the user navigates away or closes it.
 */

import { BrowserWindow, ipcMain } from 'electron';

let verificationWindow: BrowserWindow | null = null;

export function registerVerificationWindowIpc(): void {
  ipcMain.handle('open-verification-window', (_event, url: string) => {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      throw new Error('Invalid verification URL');
    }

    if (verificationWindow && !verificationWindow.isDestroyed()) {
      verificationWindow.focus();
      verificationWindow.loadURL(url);
      return;
    }

    verificationWindow = new BrowserWindow({
      width: 600,
      height: 700,
      title: 'Age Verification',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    verificationWindow.loadURL(url);

    verificationWindow.on('closed', () => {
      verificationWindow = null;
    });
  });
}
