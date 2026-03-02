/**
 * Export Key Backup Modal
 *
 * Prompts the user for an export password, encrypts all device keys
 * for the current identity, and triggers a file download.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from './Button';
import { Input } from './Input';
import { Alert } from './Alert';
import { usePlatformCapabilities } from '../config';
import { useIdentity } from '../hooks/useIdentity';
import { exportKeyBackup, getExportFilename, KeyBackupError } from '../services/keyBackupService';

const MIN_PASSWORD_LENGTH = 8;

export interface ExportKeyBackupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ExportKeyBackupModal({
  open,
  onOpenChange,
  onSuccess,
}: ExportKeyBackupModalProps) {
  const { t } = useTranslation();
  const { identity, getWrappingSalt } = useIdentity();
  const capabilities = usePlatformCapabilities();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetState = useCallback(() => {
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return;
    resetState();
    onOpenChange(false);
  }, [loading, resetState, onOpenChange]);

  const handleExport = useCallback(async () => {
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        t('identity.devices.export.errorPasswordTooShort', {
          min: MIN_PASSWORD_LENGTH,
          defaultValue: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        })
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(t('identity.devices.export.errorPasswordMismatch', 'Passwords do not match.'));
      return;
    }

    if (!identity) {
      setError(t('identity.devices.export.errorFailed', 'Failed to export key backup.'));
      return;
    }

    const wrappingSalt = getWrappingSalt();
    if (!wrappingSalt) {
      setError(t('identity.devices.export.errorFailed', 'Failed to export key backup.'));
      return;
    }

    setLoading(true);

    try {
      const data = await exportKeyBackup(identity.id, wrappingSalt, password);
      const filename = getExportFilename();

      const saved = await capabilities.fileSystem.saveFile(data, filename);
      if (!saved) {
        setLoading(false);
        return;
      }

      resetState();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      if (err instanceof KeyBackupError && err.code === 'NO_KEYS') {
        setError(t('identity.devices.export.errorNoKeys', 'No device keys found for this identity.'));
      } else {
        setError(t('identity.devices.export.errorFailed', 'Failed to export key backup.'));
      }
    } finally {
      setLoading(false);
    }
  }, [password, confirmPassword, identity, getWrappingSalt, capabilities.fileSystem, t, resetState, onOpenChange, onSuccess]);

  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length > 0 &&
    !loading;

  return (
    <Dialog.Root open={open} onOpenChange={() => handleClose()} closeOnInteractOutside={!loading}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('identity.devices.export.title', 'Export Key Backup')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <Dialog.Description className="confirm-dialog-description">
                {t('identity.devices.export.description', 'Create an encrypted backup of your device encryption keys. You will need the export password to restore this backup later.')}
              </Dialog.Description>

              <Alert variant="warning" className="key-backup-warning">
                {t('identity.devices.export.warning', 'If you forget this password, the backup cannot be recovered. Store it in a safe place (password manager, encrypted drive, etc.).')}
              </Alert>

              <div className="key-backup-form">
                <div className="key-backup-field">
                  <label htmlFor="export-password" className="key-backup-label">
                    {t('identity.devices.export.passwordLabel', 'Export Password')}
                  </label>
                  <Input
                    id="export-password"
                    type="password"
                    placeholder={t('identity.devices.export.passwordPlaceholder', 'Choose a strong password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                </div>

                <div className="key-backup-field">
                  <label htmlFor="export-password-confirm" className="key-backup-label">
                    {t('identity.devices.export.confirmPasswordLabel', 'Confirm Password')}
                  </label>
                  <Input
                    id="export-password-confirm"
                    type="password"
                    placeholder={t('identity.devices.export.confirmPasswordPlaceholder', 'Confirm your password')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleExport()}
                    disabled={loading}
                  />
                </div>

                {error && <div className="key-backup-error">{error}</div>}
              </div>
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={loading}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleExport}
                disabled={!canSubmit}
              >
                {loading ? (
                  <span className="confirm-dialog-loading">
                    <span className="spinner spinner-sm" />
                    {t('identity.devices.export.exporting', 'Encrypting and exporting...')}
                  </span>
                ) : (
                  t('identity.devices.export.submit', 'Export Backup')
                )}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
