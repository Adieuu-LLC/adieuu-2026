import type { PlatformCapabilities } from '@adieuu/ui';

// ============================================================================
// IndexedDB Helper for Key Storage (temporary until secure storage IPC is added)
// TODO: Replace with Electron safeStorage or OS keychain via IPC
// ============================================================================

const DB_NAME = 'adieuu-keys';
const STORE_NAME = 'keys';

function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// ============================================================================
// Desktop Platform Capabilities
// ============================================================================

/**
 * Desktop platform capabilities implementation.
 * Uses Electron APIs via IPC where available.
 * 
 * NOTE: This is a starter implementation. As you add more IPC handlers
 * in preload.ts and main.ts, update these methods to use them.
 * 
 * Future enhancements:
 * - Use electron's safeStorage for secure key storage
 * - Use dialog.showOpenDialog/showSaveDialog for file operations
 * - Use Electron's Notification module for native notifications
 */
export const desktopCapabilities: PlatformCapabilities = {
  // --------------------------------------------------------------------------
  // Secure Storage
  // TODO: Implement using Electron's safeStorage or keytar via IPC
  // For now, using IndexedDB (same as web) as a placeholder
  // --------------------------------------------------------------------------
  secureStorage: {
    async getKey(keyId: string): Promise<Uint8Array | null> {
      // TODO: Replace with IPC call to main process using safeStorage
      // Example: return window.electron.invoke('secure-storage:get', keyId);
      try {
        const db = await openKeyDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(keyId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result ?? null);
        });
      } catch (error) {
        console.error('Failed to get key:', error);
        return null;
      }
    },

    async setKey(keyId: string, key: Uint8Array): Promise<void> {
      // TODO: Replace with IPC call to main process using safeStorage
      const db = await openKeyDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(key, keyId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async deleteKey(keyId: string): Promise<void> {
      // TODO: Replace with IPC call to main process
      const db = await openKeyDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(keyId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async hasKey(keyId: string): Promise<boolean> {
      const key = await desktopCapabilities.secureStorage.getKey(keyId);
      return key !== null;
    },
  },

  // --------------------------------------------------------------------------
  // File System
  // TODO: Implement using Electron's dialog and fs modules via IPC
  // --------------------------------------------------------------------------
  fileSystem: {
    async pickFile(options?: { accept?: string[] }): Promise<{ name: string; data: Uint8Array } | null> {
      // TODO: Replace with IPC call using dialog.showOpenDialog
      // Example: return window.electron.invoke('file-system:pick-file', options);

      // Fallback to browser file input for now
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = options?.accept?.join(',') ?? '';

        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          try {
            const arrayBuffer = await file.arrayBuffer();
            resolve({
              name: file.name,
              data: new Uint8Array(arrayBuffer),
            });
          } catch {
            resolve(null);
          }
        };

        input.oncancel = () => resolve(null);
        input.click();
      });
    },

    async saveFile(data: Uint8Array, suggestedName: string): Promise<boolean> {
      // TODO: Replace with IPC call using dialog.showSaveDialog
      // Example: return window.electron.invoke('file-system:save-file', { data, suggestedName });

      // Fallback to download for now
      try {
        // Convert to ArrayBuffer slice to ensure compatibility
        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      } catch {
        return false;
      }
    },

    async readLocalFile(path: string): Promise<Uint8Array | null> {
      // TODO: Implement via IPC
      // Example: return window.electron.invoke('file-system:read-local', path);
      console.warn('readLocalFile not yet implemented - add IPC handler');
      return null;
    },

    async writeLocalFile(path: string, data: Uint8Array): Promise<void> {
      // TODO: Implement via IPC
      // Example: return window.electron.invoke('file-system:write-local', { path, data });
      console.warn('writeLocalFile not yet implemented - add IPC handler');
    },

    async deleteLocalFile(path: string): Promise<boolean> {
      // TODO: Implement via IPC
      console.warn('deleteLocalFile not yet implemented - add IPC handler');
      return false;
    },

    async listLocalFiles(path: string): Promise<string[]> {
      // TODO: Implement via IPC
      console.warn('listLocalFiles not yet implemented - add IPC handler');
      return [];
    },
  },

  // --------------------------------------------------------------------------
  // Notifications (Electron native notifications)
  // --------------------------------------------------------------------------
  notifications: {
    async requestPermission(): Promise<boolean> {
      // Electron apps always have notification permission
      return true;
    },

    hasPermission(): boolean {
      return true;
    },

    show(title: string, body: string, options?: { onClick?: () => void }): void {
      // TODO: Replace with IPC call for native Electron notifications
      // Example: window.electron.invoke('notifications:show', { title, body });

      // For now, use web notification API which works in Electron renderer
      if ('Notification' in window) {
        const notification = new Notification(title, { body });
        if (options?.onClick) {
          notification.onclick = options.onClick;
        }
      }
    },
  },

  // --------------------------------------------------------------------------
  // Feature Flags
  // --------------------------------------------------------------------------
  features: {
    // Mark as true since we CAN implement it, even if placeholder for now
    hasSecureStorage: true, // Will use safeStorage once IPC is added
    hasLocalFileSystem: true, // Will use fs via IPC once added
    hasSystemTray: true, // Can be implemented
    hasBiometrics:
      window.electron?.platform === 'darwin' || window.electron?.platform === 'win32',
    hasNativeWindowControls: true,
    hasDeepLinking: true,
  },
};
