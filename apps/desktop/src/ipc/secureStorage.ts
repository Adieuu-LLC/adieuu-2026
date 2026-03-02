import { app, ipcMain, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

const SECURE_KEYS_DIR = 'secure-keys';

const VALID_KEY_ID = /^[a-zA-Z0-9_-]+$/;

function getKeyFilePath(keyId: string): string {
  if (!VALID_KEY_ID.test(keyId)) {
    throw new Error('Invalid key ID');
  }
  return path.join(app.getPath('userData'), SECURE_KEYS_DIR, `${keyId}.enc`);
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

interface StorageEnvelope {
  v: 1;
  tee: boolean;
  data: string;
}

export interface StorageStatus {
  teeAvailable: boolean;
  teeFailed: boolean;
  lastError: string | null;
}

let lastTeeError: string | null = null;
let teeFailed = false;

/**
 * Registers IPC handlers for secure key storage.
 *
 * On disk, each key is stored as a JSON envelope:
 *   { v: 1, tee: boolean, data: string }
 *
 * When safeStorage (OS keychain / DPAPI / libsecret) is available, `data`
 * holds the base64-encoded output of safeStorage.encryptString(payload).
 * Otherwise `data` holds the raw payload (already passphrase-encrypted
 * by the renderer).
 *
 * If safeStorage.encryptString throws at runtime, we fall back to writing
 * without TEE and record the failure so the UI can warn the user.
 */
export function registerSecureStorageIpc(): void {
  ipcMain.handle(
    'secure-storage:set',
    async (_event, keyId: string, payloadBase64: string): Promise<void> => {
      const filePath = getKeyFilePath(keyId);
      await ensureDir(filePath);

      let envelope: StorageEnvelope;

      if (safeStorage.isEncryptionAvailable()) {
        try {
          const encrypted = safeStorage.encryptString(payloadBase64);
          envelope = { v: 1, tee: true, data: encrypted.toString('base64') };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown safeStorage error';
          console.error('[SecureStorage] safeStorage.encryptString failed, falling back:', msg);
          teeFailed = true;
          lastTeeError = msg;
          envelope = { v: 1, tee: false, data: payloadBase64 };
        }
      } else {
        envelope = { v: 1, tee: false, data: payloadBase64 };
      }

      const content = JSON.stringify(envelope);
      await fs.writeFile(filePath, content, { encoding: 'utf-8', mode: 0o600 });
    }
  );

  ipcMain.handle(
    'secure-storage:get',
    async (_event, keyId: string): Promise<string | null> => {
      const filePath = getKeyFilePath(keyId);

      let raw: string;
      try {
        raw = await fs.readFile(filePath, 'utf-8');
      } catch {
        return null;
      }

      let envelope: StorageEnvelope;
      try {
        envelope = JSON.parse(raw) as StorageEnvelope;
      } catch {
        throw new Error('Corrupt key storage file: invalid JSON');
      }

      if (envelope.tee) {
        if (!safeStorage.isEncryptionAvailable()) {
          const msg = 'Key file was encrypted with OS keychain but safeStorage is no longer available. '
            + 'Check that your system keyring (KWallet, GNOME Keyring, etc.) is running.';
          teeFailed = true;
          lastTeeError = msg;
          throw new Error(msg);
        }
        try {
          return safeStorage.decryptString(Buffer.from(envelope.data, 'base64'));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown safeStorage decryption error';
          teeFailed = true;
          lastTeeError = `Failed to decrypt keys from OS keychain: ${msg}`;
          throw new Error(lastTeeError);
        }
      }

      return envelope.data;
    }
  );

  ipcMain.handle(
    'secure-storage:delete',
    async (_event, keyId: string): Promise<void> => {
      const filePath = getKeyFilePath(keyId);
      try {
        await fs.unlink(filePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err;
        }
      }
    }
  );

  ipcMain.handle(
    'secure-storage:has',
    async (_event, keyId: string): Promise<boolean> => {
      const filePath = getKeyFilePath(keyId);
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    }
  );

  ipcMain.handle(
    'secure-storage:list',
    async (_event, prefix: string): Promise<string[]> => {
      const dir = path.join(app.getPath('userData'), SECURE_KEYS_DIR);
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        return [];
      }
      return entries
        .filter((f) => f.endsWith('.enc'))
        .map((f) => f.slice(0, -4))
        .filter((id) => id.startsWith(prefix));
    }
  );

  ipcMain.handle(
    'secure-storage:isAvailable',
    (): boolean => {
      return safeStorage.isEncryptionAvailable();
    }
  );

  ipcMain.handle(
    'secure-storage:status',
    (): StorageStatus => {
      return {
        teeAvailable: safeStorage.isEncryptionAvailable(),
        teeFailed,
        lastError: lastTeeError,
      };
    }
  );
}
