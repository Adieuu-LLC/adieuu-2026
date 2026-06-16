/**
 * Migration Prompt Modal
 *
 * Shown on a device OTHER than the one that changed the alias passphrase, when
 * locally-stored keys can no longer be decrypted with the new passphrase. The
 * user enters their previous passphrase so local key material can be re-wrapped
 * (preserving message history) instead of being deleted and regenerated.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from './Button';
import { Input } from './Input';
import { Alert } from './Alert';

export interface MigrationPromptModalProps {
  open: boolean;
  /** True while a re-wrap attempt is in progress (after the user submits). */
  processing: boolean;
  /** Why the previous attempt failed, if any. */
  lastError?: 'wrong-passphrase' | 'failed';
  onMigrate: (oldPassphrase: string) => void;
  onOptOut: () => void;
}

export function MigrationPromptModal({
  open,
  processing,
  lastError,
  onMigrate,
  onOptOut,
}: MigrationPromptModalProps) {
  const { t } = useTranslation();
  const [oldPassphrase, setOldPassphrase] = useState('');

  // Clear the field whenever the modal is (re)opened or an attempt finishes.
  useEffect(() => {
    if (open && !processing) setOldPassphrase('');
  }, [open, processing]);

  const errorText =
    lastError === 'wrong-passphrase'
      ? t('identity.e2e.migrationPrompt.errorWrongPassword')
      : lastError === 'failed'
        ? t('identity.e2e.migrationPrompt.errorFailed')
        : null;

  return (
    <Dialog.Root
      open={open}
      closeOnInteractOutside={false}
      closeOnEscape={false}
      onEscapeKeyDown={(e) => e.preventDefault()}
      onInteractOutside={(e) => e.preventDefault()}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop web-device-choice-layer-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner web-device-choice-layer-positioner">
          <Dialog.Content className="confirm-dialog-content" style={{ maxWidth: '460px' }}>
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('identity.e2e.migrationPrompt.title')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <p>{t('identity.e2e.migrationPrompt.description')}</p>

              {errorText && (
                <Alert variant="error" className="migration-prompt-error">
                  {errorText}
                </Alert>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!processing && oldPassphrase) onMigrate(oldPassphrase);
                }}
              >
                <Input
                  type="password"
                  label={t('identity.e2e.migrationPrompt.oldPasswordLabel')}
                  value={oldPassphrase}
                  onChange={(e) => setOldPassphrase(e.target.value)}
                  autoComplete="current-password"
                  disabled={processing}
                  autoFocus
                />
              </form>

              <Alert variant="warning" className="migration-prompt-optout-warning">
                {t('identity.e2e.migrationPrompt.optOutWarning')}
              </Alert>
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={onOptOut}
                disabled={processing}
              >
                {t('identity.e2e.migrationPrompt.optOut')}
              </Button>
              <Button
                variant="primary"
                onClick={() => onMigrate(oldPassphrase)}
                disabled={processing || !oldPassphrase}
              >
                {processing
                  ? t('identity.e2e.migrationPrompt.processing')
                  : t('identity.e2e.migrationPrompt.migrate')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
