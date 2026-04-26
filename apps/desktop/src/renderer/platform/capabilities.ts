import type { PlatformCapabilities } from '@adieuu/ui';

// ============================================================================
// Desktop Platform Capabilities
// ============================================================================

/**
 * Encodes a Uint8Array to a base64 string for IPC transfer to the main process.
 */
function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string received from the main process to a Uint8Array.
 */
function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Desktop platform capabilities implementation.
 *
 * Secure storage uses Electron's safeStorage (OS keychain / DPAPI / libsecret)
 * via IPC to the main process. Keys are persisted to a file under userData so
 * they survive browser cache clears. When safeStorage is available, the file
 * contents are additionally encrypted with OS-level keys.
 */
export const desktopCapabilities: PlatformCapabilities = {
  openExternal: async (url: string): Promise<void> => {
    const result = await window.electron.openExternal(url);
    if (!result.ok) {
      throw new Error(result.error);
    }
  },

  // --------------------------------------------------------------------------
  // Secure Storage (safeStorage + local file via IPC)
  // --------------------------------------------------------------------------
  secureStorage: {
    async getKey(keyId: string): Promise<Uint8Array | null> {
      const result = await window.electron.secureStorage.get(keyId);
      if (result === null) return null;
      return base64ToUint8(result);
    },

    async setKey(keyId: string, key: Uint8Array): Promise<void> {
      const base64 = uint8ToBase64(key);
      await window.electron.secureStorage.set(keyId, base64);
    },

    async deleteKey(keyId: string): Promise<void> {
      await window.electron.secureStorage.delete(keyId);
    },

    async hasKey(keyId: string): Promise<boolean> {
      return window.electron.secureStorage.has(keyId);
    },

    async listKeys(prefix: string): Promise<string[]> {
      return window.electron.secureStorage.list(prefix);
    },

    async getStorageStatus() {
      return window.electron.secureStorage.status();
    },
  },

  // --------------------------------------------------------------------------
  // File System
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

        input.oncancel = () => resolve(null);
        input.click();
      });
    },

    async saveFile(data: Uint8Array, suggestedName: string): Promise<boolean> {
      try {
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

    async readLocalFile(_path: string): Promise<Uint8Array | null> {
      console.warn('readLocalFile not yet implemented - add IPC handler');
      return null;
    },

    async writeLocalFile(_path: string, _data: Uint8Array): Promise<void> {
      console.warn('writeLocalFile not yet implemented - add IPC handler');
    },

    async deleteLocalFile(_path: string): Promise<boolean> {
      console.warn('deleteLocalFile not yet implemented - add IPC handler');
      return false;
    },

    async listLocalFiles(_path: string): Promise<string[]> {
      console.warn('listLocalFiles not yet implemented - add IPC handler');
      return [];
    },
  },

  // --------------------------------------------------------------------------
  // Notification sounds (pick path + read bytes in main process)
  // --------------------------------------------------------------------------
  audio: {
    async pickSoundFile(): Promise<{ name: string; path: string } | null> {
      return window.electron.audio.pickSoundFile();
    },
    async loadSoundFromPath(filePath: string): Promise<ArrayBuffer | null> {
      const base64 = await window.electron.audio.loadSoundFile(filePath);
      if (!base64) return null;
      const u8 = base64ToUint8(base64);
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    },
  },

  // --------------------------------------------------------------------------
  // Notifications (Electron native notifications)
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
      return 'Notification' in window && Notification.permission === 'granted';
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
  // WebAuthn bridge (production only — see apps/desktop/src/webauthn-bridge.ts)
  // --------------------------------------------------------------------------
  ...(window.electron?.webauthn ? {
    webauthn: {
      create: (options: unknown) => window.electron.webauthn!.create(options),
      get: (options: unknown) => window.electron.webauthn!.get(options),
    },
  } : {}),

  // --------------------------------------------------------------------------
  // App Window (OS taskbar badge, etc.)
  // --------------------------------------------------------------------------
  appWindow: {
    setBadgeCount(count: number, accentColorHex?: string) {
      window.electron.window.setBadgeCount(count, accentColorHex);
    },
  },

  // --------------------------------------------------------------------------
  // Feature Flags
  // --------------------------------------------------------------------------
  features: {
    hasSecureStorage: true,
    hasLocalFileSystem: true,
    hasSystemTray: true,
    hasBiometrics:
      window.electron?.platform === 'darwin' || window.electron?.platform === 'win32',
    hasNativeWindowControls: true,
    hasDeepLinking: true,
    hasCustomSoundPicker: true,
  },
};
