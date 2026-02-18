import { contextBridge, ipcRenderer } from 'electron';

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
  },

  // IPC communication (add as needed)
  invoke: (channel: string, ...args: unknown[]) => {
    const allowedChannels = ['get-app-version', 'open-external'];
    if (allowedChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Channel "${channel}" is not allowed`);
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowedChannels = ['update-available', 'update-downloaded'];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
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
      };
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}
