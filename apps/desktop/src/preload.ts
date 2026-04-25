import { contextBridge, ipcRenderer } from 'electron';

const webauthnBridgeEnabled = process.argv.includes('--webauthn-bridge-enabled');

interface WebAuthnIpcResponse {
  success: boolean;
  credential?: unknown;
  name?: string;
  message?: string;
}

async function invokeWebAuthn(channel: string, options: unknown): Promise<unknown> {
  const result: WebAuthnIpcResponse = await ipcRenderer.invoke(channel, options);
  if (!result.success) {
    const err = new Error(result.message ?? 'WebAuthn operation failed');
    err.name = result.name ?? 'Error';
    throw err;
  }
  return result.credential;
}

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // App info
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // Window controls (for custom title bar on Windows/Linux)
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    setBadgeCount: (count: number, accentColorHex?: string) =>
      ipcRenderer.invoke('window:setBadgeCount', count, accentColorHex),
  },

  // Secure storage (safeStorage + local file, managed by main process)
  secureStorage: {
    get: (keyId: string) =>
      ipcRenderer.invoke('secure-storage:get', keyId) as Promise<string | null>,
    set: (keyId: string, dataBase64: string) =>
      ipcRenderer.invoke('secure-storage:set', keyId, dataBase64) as Promise<void>,
    delete: (keyId: string) =>
      ipcRenderer.invoke('secure-storage:delete', keyId) as Promise<void>,
    has: (keyId: string) =>
      ipcRenderer.invoke('secure-storage:has', keyId) as Promise<boolean>,
    list: (prefix: string) =>
      ipcRenderer.invoke('secure-storage:list', prefix) as Promise<string[]>,
    isAvailable: () =>
      ipcRenderer.invoke('secure-storage:isAvailable') as Promise<boolean>,
    status: () =>
      ipcRenderer.invoke('secure-storage:status') as Promise<{
        teeAvailable: boolean;
        teeFailed: boolean;
        lastError: string | null;
      }>,
  },

  // Local notification sound file (path on disk; load via main process only)
  audio: {
    pickSoundFile: () =>
      ipcRenderer.invoke('audio:pick-sound-file') as Promise<{ name: string; path: string } | null>,
    loadSoundFile: (filePath: string) =>
      ipcRenderer.invoke('audio:load-sound-file', filePath) as Promise<string | null>,
  },

  // WebAuthn IPC bridge (production only — the packaged app's custom protocol
  // origin cannot satisfy the RP ID check, so the ceremony runs in a hidden
  // BrowserWindow with the correct HTTPS origin).
  ...(webauthnBridgeEnabled ? {
    webauthn: {
      create: (options: unknown) => invokeWebAuthn('webauthn:create', options),
      get: (options: unknown) => invokeWebAuthn('webauthn:get', options),
    },
  } : {}),

  // IPC communication (add as needed)
  invoke: (channel: string, ...args: unknown[]) => {
    const allowedChannels = [
      'install-update', 'download-update',
      'get-pending-deep-link', 'get-update-preferences', 'set-update-preferences',
      'check-for-updates', 'clear-installer-cache', 'open-windows-installer-log', 'open-in-app-update-log',
      'get-in-app-update-log-path', 'restart-app', 'set-platform-admin',
    ];
    if (allowedChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Channel "${channel}" is not allowed`);
  },

  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const allowedChannels = [
      'update-available', 'update-not-available', 'download-progress', 'update-downloaded', 'update-error',
      'installer-cache-cleared', 'deep-link',
    ];
    if (allowedChannels.includes(channel)) {
      const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, wrapper);
      return () => {
        ipcRenderer.removeListener(channel, wrapper);
      };
    }
    return () => {};
  },
});

// Type declaration for the exposed API
declare global {
  interface Window {
    electron: {
      platform: NodeJS.Platform;
      versions: {
        node: string;
        chrome: string;
        electron: string;
      };
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        setBadgeCount: (count: number, accentColorHex?: string) => Promise<void>;
      };
      secureStorage: {
        get: (keyId: string) => Promise<string | null>;
        set: (keyId: string, dataBase64: string) => Promise<void>;
        delete: (keyId: string) => Promise<void>;
        has: (keyId: string) => Promise<boolean>;
        list: (prefix: string) => Promise<string[]>;
        isAvailable: () => Promise<boolean>;
        status: () => Promise<{
          teeAvailable: boolean;
          teeFailed: boolean;
          lastError: string | null;
        }>;
      };
      audio: {
        pickSoundFile: () => Promise<{ name: string; path: string } | null>;
        loadSoundFile: (filePath: string) => Promise<string | null>;
      };
      webauthn?: {
        create: (options: unknown) => Promise<unknown>;
        get: (options: unknown) => Promise<unknown>;
      };
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
  }
}
