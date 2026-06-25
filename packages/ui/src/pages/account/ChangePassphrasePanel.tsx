import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { createApiClient } from '@adieuu/shared';
import { clearBytes } from '@adieuu/crypto';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { Alert } from '../../components/Alert';
import { useIdentity } from '../../hooks/useIdentity';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { decryptKeyBundle, encryptKeyBundle } from '../../services/e2eKeyService';
import { reWrapPassphraseProtectedStores } from '../../services/passphraseLocalMigration';
import { setLastIdentityUnlockAt } from '../../services/deviceKeyStorage';

type ChangePassphraseStep = 'form' | 'processing';

type ChangePassphrasePanelProps = {
  api: ReturnType<typeof createApiClient>;
};

/**
 * Change identity passphrase (account session required for bridging token).
 * Rendered from Account → Security so passphrase management sits with other account-bound controls (e.g. MFA).
 */
export function ChangePassphrasePanel({ api }: ChangePassphrasePanelProps) {
  const { t } = useTranslation();
  const { identity, getWrappingKey, updateWrappingKey } = useIdentity();
  const { session } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<ChangePassphraseStep>('form');
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setCurrentPassphrase('');
    setNewPassphrase('');
    setConfirmPassphrase('');
    setError(null);
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassphrase.length < 8) {
      setError(t('identity.privacy.changePassword.errorMinLength'));
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      setError(t('identity.privacy.changePassword.errorMismatch'));
      return;
    }
    if (currentPassphrase === newPassphrase) {
      setError(t('identity.privacy.changePassword.errorSamePassphrase'));
      return;
    }

    const signedToken = session?.signedToken;
    if (!signedToken) {
      setError(t('identity.privacy.changePassword.errorSession'));
      return;
    }

    setStep('processing');

    try {
      const bundleResp = identity
        ? await api.identity.getKeyBundle(identity.id)
        : await api.identity.bundleByPassphrase({
            signedToken,
            passphrase: currentPassphrase,
          });
      if (!bundleResp.success || !bundleResp.data) {
        throw new Error('Failed to fetch key bundle');
      }

      const decrypted = await decryptKeyBundle(bundleResp.data, currentPassphrase).catch(() => null);
      if (!decrypted) {
        setError(t('identity.privacy.changePassword.errorDecryptFailed'));
        setStep('form');
        return;
      }

      const newBundle = await encryptKeyBundle(decrypted, newPassphrase);

      const result = await api.identity.changePassphrase({
        signedToken,
        currentPassphrase,
        newPassphrase,
        newEncryptedBundle: newBundle.encryptedBundle,
        newBundleSalt: newBundle.salt,
        newBundleNonce: newBundle.nonce,
      });

      if (!result.success) {
        setError(result.error?.message ?? t('identity.privacy.changePassword.errorFailed'));
        setStep('form');
        return;
      }

      // Re-wrap all passphrase-protected local material so message history
      // stays readable. This must run for BOTH alias mode (active identity) and
      // account mode (identity === null). In alias mode we already hold the
      // active wrapping key and can re-wrap deterministically; in account mode
      // the migrator discovers the matching local identity via the current
      // passphrase.
      try {
        const activeWrappingKey = identity ? getWrappingKey() : null;
        const migration = identity && activeWrappingKey
          ? await reWrapPassphraseProtectedStores({
              newPassphrase,
              identityId: identity.id,
              oldWrappingKey: activeWrappingKey,
            })
          : await reWrapPassphraseProtectedStores({
              newPassphrase,
              currentPassphrase,
              identityId: identity?.id,
            });

        if (migration.status === 'migrated' && migration.newWrappingKey) {
          // Record that this device is now in sync with the new passphrase so
          // the remote-change migration prompt does not re-fire here on a later
          // login (it would, since passphraseChangedAt would otherwise be newer
          // than a stale last-unlock timestamp).
          if (migration.identityId) {
            try {
              await setLastIdentityUnlockAt(migration.identityId);
            } catch (tsErr) {
              console.warn('[ChangePassphrase] Failed to record unlock timestamp (non-fatal):', tsErr);
            }
          }
          if (identity && migration.identityId === identity.id) {
            // Keep the live session working with the new wrapping key.
            updateWrappingKey(migration.newWrappingKey);
          } else {
            clearBytes(migration.newWrappingKey);
          }
        } else if (migration.status === 'ambiguous') {
          // Multiple local identities share this passphrase; we cannot safely
          // pick one. The server passphrase is already changed, so surface a
          // clear warning rather than silently risking the wrong identity.
          console.warn('[ChangePassphrase] Ambiguous local identity match; skipped local re-wrap');
          toast.error(t('identity.privacy.changePassword.localRewrapAmbiguous'));
        } else if (migration.status === 'no-match') {
          console.warn('[ChangePassphrase] No local store matched the current passphrase; skipped local re-wrap');
        }
      } catch (err) {
        console.error('[ChangePassphrase] Failed to re-wrap local key material:', err);
        toast.error(t('identity.privacy.changePassword.localRewrapFailed'));
      }

      toast.success(t('identity.privacy.changePassword.success'));
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('identity.privacy.changePassword.errorFailed'));
      setStep('form');
    }
  };

  if (step === 'processing') {
    return (
      <div className="change-passphrase-processing">
        <Spinner size="lg" />
        <p>{t('identity.privacy.changePassword.processing')}</p>
      </div>
    );
  }

  return (
    <div className="change-passphrase-settings">
      <div className="sessions-header">
        <div className="sessions-header-text">
          <h3>{t('identity.privacy.changePassword.title')}</h3>
          <p>{t('identity.privacy.changePassword.description')}</p>
        </div>
      </div>

      <Alert variant="warning" className="change-passphrase-warning">
        {t('identity.privacy.changePassword.securityNote')}
      </Alert>

      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={handleSubmit} className="change-passphrase-form">
        <Input
          type="password"
          label={t('identity.privacy.changePassword.currentPassphrase')}
          value={currentPassphrase}
          onChange={(e) => setCurrentPassphrase(e.target.value)}
          autoComplete="current-password"
        />
        <Input
          type="password"
          label={t('identity.privacy.changePassword.newPassphrase')}
          value={newPassphrase}
          onChange={(e) => setNewPassphrase(e.target.value)}
          autoComplete="new-password"
        />
        <Input
          type="password"
          label={t('identity.privacy.changePassword.confirmPassphrase')}
          value={confirmPassphrase}
          onChange={(e) => setConfirmPassphrase(e.target.value)}
          autoComplete="new-password"
        />
        <Button type="submit" disabled={!currentPassphrase || !newPassphrase || !confirmPassphrase}>
          {t('identity.privacy.changePassword.submit')}
        </Button>
      </form>
    </div>
  );
}
