import { app, Menu, Tray } from 'electron';
import { runtime } from './runtime';
import { createTintedIcon, createTintedDotIcon } from './taskbar-badge';

let tray: Tray | null = null;
let storedIconPath: string | null = null;
let lastUnreadState = false;

export function isTrayActive(): boolean {
  return tray !== null && !tray.isDestroyed();
}

export function createTray(iconPath: string): void {
  if (isTrayActive()) return;

  storedIconPath = iconPath;
  tray = new Tray(iconPath);
  tray.setToolTip('Adieuu');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Adieuu',
      click: () => restoreFromTray(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        destroyTray();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => restoreFromTray());
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
}

export function hideToTray(iconPath: string): void {
  const win = runtime.mainWindow;
  if (!win || win.isDestroyed()) return;

  createTray(iconPath);

  const icon = lastUnreadState
    ? createTintedDotIcon(iconPath)
    : createTintedIcon(iconPath);
  if (icon) tray!.setImage(icon);

  win.hide();

  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
}

export function restoreFromTray(): void {
  const win = runtime.mainWindow;
  if (!win || win.isDestroyed()) return;

  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();

  if (process.platform === 'darwin') {
    app.dock?.show();
  }
}

/**
 * Whether the main window is currently hidden in the tray
 * (window exists but is not visible).
 */
export function isHiddenInTray(): boolean {
  const win = runtime.mainWindow;
  return isTrayActive() && win !== null && !win.isDestroyed() && !win.isVisible();
}

/**
 * Updates the tray icon to show (or hide) an unread dot indicator.
 * The icon is always tinted to the user's accent colour; the dot uses
 * the secondary accent colour.
 */
export function setTrayBadge(hasUnread: boolean): void {
  lastUnreadState = hasUnread;
  if (!isTrayActive() || !storedIconPath) return;

  const icon = hasUnread
    ? createTintedDotIcon(storedIconPath)
    : createTintedIcon(storedIconPath);
  if (icon) tray!.setImage(icon);
}

export function getTrayUnreadState(): boolean {
  return lastUnreadState;
}
