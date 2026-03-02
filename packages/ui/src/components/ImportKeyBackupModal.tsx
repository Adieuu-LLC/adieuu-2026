/**
 * Import Key Backup Modal
 *
 * Multi-step flow:
 *   1. Pick a .adieuu-keys file
 *   2. Enter the export password to decrypt
 *   3. If wrapping salts differ, prompt for identity passphrase to re-wrap
 *   4. If device overlap, choose merge strategy
 *   5. Import
 */

import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from './Button';
import { Input } from './Input';
import { Alert } from './Alert';
import { usePlatformCapabilities } from '../config';
import { useIdentity } from '../hooks/useIdentity';
import {
  decryptKeyBackup,
  applyKeyBackupImport,
  KeyBackupError,
  type KeyBackupPayload,
} from '../services/keyBackupService';
import {
  getDeviceKeysForIdentity,
  storePreEncryptedDeviceKeys,
  type StoredDeviceKeys,
} from '../services/deviceKeyStorage';
import {
  deriveEntropyWrappingKey,
  toBase64,
  fromBase64,
  clearBytes,
  constantTimeEqual,
} from '@adieuu/crypto';

type ImportStep = 'file' | 'decrypt' | 'passphrase' | 'merge' | 'importing' | 'done';

export interface ImportKeyBackupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (imported: number, skipped: number) => void;
}

export function ImportKeyBackupModal({
  open,
  onOpenChange,
  onSuccess,
}: ImportKeyBackupModalProps) {
  const { t } = useTranslation();
  const { identity, getWrappingKey, getWrappingSalt } = useIdentity();
  const capabilities = usePlatformCapabilities();

  const [step, setStep] = useState<ImportStep>('file');
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [identityPassphrase, setIdentityPassphrase] = useState('');
  const [payload, setPayload] = useState<KeyBackupPayload | null>(null);
  const [overlapCount, setOverlapCount] = useState(0);
  const [mergeStrategy, setMergeStrategy] = useState<'skip' | 'replace'>('skip');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const backupWrappingKeyRef = useRef<Uint8Array | null>(null);

  const resetState = useCallback(() => {
    setStep('file');
    setFileData(null);
    setFileName('');
    setExportPassword('');
    setIdentityPassphrase('');
    setPayload(null);
    setOverlapCount(0);
    setMergeStrategy('skip');
    setError(null);
    setLoading(false);
    if (backupWrappingKeyRef.current) {
      clearBytes(backupWrappingKeyRef.current);
      backupWrappingKeyRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return;
    resetState();
    onOpenChange(false);
  }, [loading, resetState, onOpenChange]);

  const handlePickFile = async () => {
    const file = await capabilities.fileSystem.pickFile({
      accept: ['.adieuu-keys'],
    });
    if (!file) return;

    setFileData(file.data);
    setFileName(file.name);
    setError(null);
    setStep('decrypt');
  };

  const doImport = async (
    importPayload: KeyBackupPayload,
    strategy: 'skip' | 'replace'
  ) => {
    setStep('importing');
    setLoading(true);

    try {
      const localWK = getWrappingKey();
      const needsRewrap = backupWrappingKeyRef.current !== null;

      const storeRecord = async (record: StoredDeviceKeys) => {
        if (needsRewrap && backupWrappingKeyRef.current && localWK) {
          const rewrapped = await rewrapDeviceKeys(record, backupWrappingKeyRef.current, localWK);
          await storePreEncryptedDeviceKeys(rewrapped);
        } else {
          await storePreEncryptedDeviceKeys(record);
        }
      };

      const result = await applyKeyBackupImport(importPayload, strategy, storeRecord);

      if (backupWrappingKeyRef.current) {
        clearBytes(backupWrappingKeyRef.current);
        backupWrappingKeyRef.current = null;
      }

      resetState();
      onOpenChange(false);
      onSuccess?.(result.imported, result.skipped);
    } catch {
      setError(t('identity.devices.import.errorFailed', 'Failed to import key backup.'));
      setStep('merge');
    } finally {
      setLoading(false);
    }
  };

  const checkOverlapAndImport = async (decryptedPayload: KeyBackupPayload) => {
    const existingKeys = await getDeviceKeysForIdentity(decryptedPayload.identityId);
    const existingIds = new Set(existingKeys.map((k) => k.deviceId));
    const overlap = decryptedPayload.devices.filter((d) => existingIds.has(d.deviceId)).length;

    setOverlapCount(overlap);

    if (overlap > 0) {
      setStep('merge');
      setLoading(false);
    } else {
      await doImport(decryptedPayload, 'skip');
    }
  };

  const handleDecrypt = async () => {
    if (!fileData || !identity) return;
    setError(null);
    setLoading(true);

    try {
      const decrypted = await decryptKeyBackup(fileData, exportPassword);

      if (decrypted.identityId !== identity.id) {
        setError(t('identity.devices.import.identityMismatch', 'This backup is for a different identity. Sign in to the correct identity and try again.'));
        setLoading(false);
        return;
      }

      setPayload(decrypted);

      const localSalt = getWrappingSalt();
      const backupSalt = fromBase64(decrypted.wrappingSalt);
      const saltsMatch = localSalt && constantTimeEqual(localSalt, backupSalt);

      if (!saltsMatch) {
        setStep('passphrase');
        setLoading(false);
        return;
      }

      await checkOverlapAndImport(decrypted);
    } catch (err) {
      if (err instanceof KeyBackupError) {
        const messageMap: Record<string, string> = {
          WRONG_PASSWORD: t('identity.devices.import.errorWrongPassword', 'Incorrect export password. The backup could not be decrypted.'),
          CORRUPT_FILE: t('identity.devices.import.errorCorruptFile', 'The backup file is damaged or not a valid Adieuu key backup.'),
          CORRUPT_PAYLOAD: t('identity.devices.import.errorCorruptFile', 'The backup file is damaged or not a valid Adieuu key backup.'),
          INVALID_FORMAT: t('identity.devices.import.errorCorruptFile', 'The backup file is damaged or not a valid Adieuu key backup.'),
          INVALID_PAYLOAD: t('identity.devices.import.errorCorruptFile', 'The backup file is damaged or not a valid Adieuu key backup.'),
          UNSUPPORTED_VERSION: t('identity.devices.import.errorUnsupportedVersion', 'This backup was created with a newer version of Adieuu. Please update.'),
          NO_KEYS: t('identity.devices.import.errorNoKeys', 'The backup file contains no device keys.'),
          EMPTY_PAYLOAD: t('identity.devices.import.errorNoKeys', 'The backup file contains no device keys.'),
        };
        setError(messageMap[err.code] ?? t('identity.devices.import.errorFailed', 'Failed to import key backup.'));
      } else {
        setError(t('identity.devices.import.errorFailed', 'Failed to import key backup.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePassphraseSubmit = async () => {
    if (!payload || !identity) return;
    setError(null);
    setLoading(true);

    try {
      const backupSalt = fromBase64(payload.wrappingSalt);
      const backupWK = await deriveEntropyWrappingKey(identityPassphrase, backupSalt);
      backupWrappingKeyRef.current = backupWK;

      await checkOverlapAndImport(payload);
    } catch {
      setError(t('identity.devices.import.errorFailed', 'Failed to import key backup.'));
    } finally {
      setLoading(false);
    }
  };

  const handleMergeConfirm = async () => {
    if (!payload) return;
    setLoading(true);
    setError(null);
    await doImport(payload, mergeStrategy);
  };

  return (
    <Dialog.Root open={open} onOpenChange={() => handleClose()} closeOnInteractOutside={!loading}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('identity.devices.import.title', 'Import Key Backup')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <Dialog.Description className="confirm-dialog-description">
                {t('identity.devices.import.description', 'Restore device encryption keys from a previously exported backup file.')}
              </Dialog.Description>

              {step === 'file' && (
                <div className="key-backup-form">
                  <Button variant="secondary" onClick={handlePickFile}>
                    {t('identity.devices.import.pickFile', 'Choose Backup File')}
                  </Button>
                  <p className="key-backup-hint">
                    {t('identity.devices.import.pickFileHint', 'Select a .adieuu-keys file')}
                  </p>
                </div>
              )}

              {step === 'decrypt' && (
                <div className="key-backup-form">
                  <div className="key-backup-file-info">
                    {fileName}
                  </div>
                  <div className="key-backup-field">
                    <label htmlFor="import-password" className="key-backup-label">
                      {t('identity.devices.import.passwordLabel', 'Export Password')}
                    </label>
                    <Input
                      id="import-password"
                      type="password"
                      placeholder={t('identity.devices.import.passwordPlaceholder', 'Enter the export password')}
                      value={exportPassword}
                      onChange={(e) => setExportPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && exportPassword && handleDecrypt()}
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {step === 'passphrase' && (
                <div className="key-backup-form">
                  <Alert variant="info" className="key-backup-info">
                    Your identity passphrase is needed to re-encrypt the imported keys for this device.
                  </Alert>
                  <div className="key-backup-field">
                    <label htmlFor="import-passphrase" className="key-backup-label">
                      Identity Passphrase
                    </label>
                    <Input
                      id="import-passphrase"
                      type="password"
                      placeholder="Enter your identity passphrase"
                      value={identityPassphrase}
                      onChange={(e) => setIdentityPassphrase(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && identityPassphrase && handlePassphraseSubmit()}
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {step === 'merge' && payload && (
                <div className="key-backup-form">
                  <Alert variant="warning" className="key-backup-warning">
                    {t('identity.devices.import.mergeDescription', {
                      count: overlapCount,
                      total: payload.devices.length,
                      defaultValue: `${overlapCount} of ${payload.devices.length} devices in this backup already exist on this device.`,
                    })}
                  </Alert>
                  <div className="key-backup-merge-options">
                    <label className="key-backup-merge-option">
                      <input
                        type="radio"
                        name="mergeStrategy"
                        value="skip"
                        checked={mergeStrategy === 'skip'}
                        onChange={() => setMergeStrategy('skip')}
                      />
                      <span>{t('identity.devices.import.mergeSkip', 'Skip existing devices')}</span>
                    </label>
                    <label className="key-backup-merge-option">
                      <input
                        type="radio"
                        name="mergeStrategy"
                        value="replace"
                        checked={mergeStrategy === 'replace'}
                        onChange={() => setMergeStrategy('replace')}
                      />
                      <span>{t('identity.devices.import.mergeReplace', 'Replace existing devices')}</span>
                    </label>
                  </div>
                </div>
              )}

              {step === 'importing' && (
                <div className="key-backup-form key-backup-importing">
                  <span className="spinner spinner-md" />
                  <p>{t('identity.devices.import.importing', 'Decrypting and importing...')}</p>
                </div>
              )}

              {error && <div className="key-backup-error">{error}</div>}
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={loading}
              >
                {t('common.cancel', 'Cancel')}
              </Button>

              {step === 'decrypt' && (
                <Button
                  variant="primary"
                  onClick={handleDecrypt}
                  disabled={!exportPassword || loading}
                >
                  {loading ? (
                    <span className="confirm-dialog-loading">
                      <span className="spinner spinner-sm" />
                      {t('identity.devices.import.importing', 'Decrypting and importing...')}
                    </span>
                  ) : (
                    t('identity.devices.import.submit', 'Decrypt & Import')
                  )}
                </Button>
              )}

              {step === 'passphrase' && (
                <Button
                  variant="primary"
                  onClick={handlePassphraseSubmit}
                  disabled={!identityPassphrase || loading}
                >
                  {loading ? (
                    <span className="confirm-dialog-loading">
                      <span className="spinner spinner-sm" />
                      Continue
                    </span>
                  ) : (
                    'Continue'
                  )}
                </Button>
              )}

              {step === 'merge' && (
                <Button
                  variant="primary"
                  onClick={handleMergeConfirm}
                  disabled={loading}
                >
                  {t('identity.devices.import.submit', 'Decrypt & Import')}
                </Button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/**
 * Re-wraps a StoredDeviceKeys record from one wrapping key to another.
 *
 * Decrypts each private key with the source wrapping key and re-encrypts
 * with the target wrapping key. Returns a new record with the re-encrypted keys.
 */
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(arr.length);
  copy.set(arr);
  return copy.buffer as ArrayBuffer;
}

async function rewrapDeviceKeys(
  record: StoredDeviceKeys,
  sourceWrappingKey: Uint8Array,
  targetWrappingKey: Uint8Array
): Promise<StoredDeviceKeys> {
  const decryptField = async (encrypted: { ciphertext: string; nonce: string }) => {
    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(sourceWrappingKey),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const ct = fromBase64(encrypted.ciphertext);
    const iv = fromBase64(encrypted.nonce);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ct)
    );
    return new Uint8Array(plaintext);
  };

  const encryptField = async (data: Uint8Array) => {
    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(targetWrappingKey),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      toArrayBuffer(data)
    );
    return {
      ciphertext: toBase64(new Uint8Array(ciphertext)),
      nonce: toBase64(nonce),
    };
  };

  const ecdhPlain = await decryptField(record.ecdhPrivateKeyEncrypted);
  const kemPlain = await decryptField(record.kemPrivateKeyEncrypted);

  let ecdhReEncrypted: { ciphertext: string; nonce: string };
  let kemReEncrypted: { ciphertext: string; nonce: string };
  try {
    ecdhReEncrypted = await encryptField(ecdhPlain);
    kemReEncrypted = await encryptField(kemPlain);
  } finally {
    clearBytes(ecdhPlain);
    clearBytes(kemPlain);
  }

  return {
    ...record,
    ecdhPrivateKeyEncrypted: ecdhReEncrypted,
    kemPrivateKeyEncrypted: kemReEncrypted,
  };
}

