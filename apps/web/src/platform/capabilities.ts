import type { PlatformCapabilities } from '@adieuu/ui';

// ============================================================================
// IndexedDB Helper for Key Storage
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
// Web Platform Capabilities
// ============================================================================

/**
 * Web platform capabilities implementation.
 * Uses browser APIs (IndexedDB, File API, Notification API).
 */
export const webCapabilities: PlatformCapabilities = {
  // --------------------------------------------------------------------------
  // Secure Storage (IndexedDB - not truly secure, but best available on web)
  // --------------------------------------------------------------------------
  secureStorage: {
    async getKey(keyId: string): Promise<Uint8Array | null> {
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
        console.error('Failed to get key from IndexedDB:', error);
        return null;
      }
    },

    async setKey(keyId: string, key: Uint8Array): Promise<void> {
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
      const key = await webCapabilities.secureStorage.getKey(keyId);
      return key !== null;
    },
  },

  // --------------------------------------------------------------------------
  // File System (Limited browser APIs)
  // --------------------------------------------------------------------------
  fileSystem: {
    async pickFile(options?: { accept?: string[] }): Promise<{ name: string; data: Uint8Array } | null> {
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

        // Handle cancel
        input.oncancel = () => resolve(null);

        input.click();
      });
    },

    async saveFile(data: Uint8Array, suggestedName: string): Promise<boolean> {
      try {
        // Convert to ArrayBuffer slice to ensure compatibility
        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        const blob = new Blob([buffer]);

        // Try to use File System Access API if available
        if ('showSaveFilePicker' in window) {
          const handle = await (window as unknown as { showSaveFilePicker: (options: { suggestedName: string }) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
            suggestedName,
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        }

        // Fallback to download link
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

    async readLocalFile(): Promise<Uint8Array | null> {
      // Not available on web
      console.warn('Local file system access is not available on web platform');
      return null;
    },

    async writeLocalFile(): Promise<void> {
      // Not available on web
      console.warn('Local file system access is not available on web platform');
    },

    async deleteLocalFile(): Promise<boolean> {
      // Not available on web
      console.warn('Local file system access is not available on web platform');
      return false;
    },

    async listLocalFiles(): Promise<string[]> {
      // Not available on web
      console.warn('Local file system access is not available on web platform');
      return [];
    },
  },

  // --------------------------------------------------------------------------
  // Notifications (Web Notification API)
  // --------------------------------------------------------------------------
  notifications: {
    async requestPermission(): Promise<boolean> {
      if (!('Notification' in window)) {
        return false;
      }
      const result = await Notification.requestPermission();
      return result === 'granted';
    },

    hasPermission(): boolean {
      if (!('Notification' in window)) {
        return false;
      }
      return Notification.permission === 'granted';
    },

    getPermissionState(): NotificationPermission {
      if (!('Notification' in window)) {
        return 'denied';
      }
      return Notification.permission;
    },

    show(title: string, body: string, options?: { onClick?: () => void; tag?: string }): void {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
      }
      const notification = new Notification(title, {
        body,
        tag: options?.tag,
      });
      if (options?.onClick) {
        notification.onclick = options.onClick;
      }
    },
  },

  // --------------------------------------------------------------------------
  // Feature Flags
  // --------------------------------------------------------------------------
  features: {
    hasSecureStorage: false, // IndexedDB isn't OS-level secure
    hasLocalFileSystem: false, // No direct file system access
    hasSystemTray: false, // Not available in browser
    hasBiometrics: 'PublicKeyCredential' in window, // WebAuthn support
    hasNativeWindowControls: false, // Browser controls the window
    hasDeepLinking: true, // URL-based routing
    hasCustomSoundPicker: false,
  },
};
