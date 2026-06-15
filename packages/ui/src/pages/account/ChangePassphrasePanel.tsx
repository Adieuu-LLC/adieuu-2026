import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { createApiClient } from '@adieuu/shared';
import { deriveEntropyWrappingKey } from '@adieuu/crypto';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { Alert } from '../../components/Alert';
import { useIdentity } from '../../hooks/useIdentity';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { decryptKeyBundle, encryptKeyBundle } from '../../services/e2eKeyService';
import { getOrCreateWrappingSalt, reWrapDeviceKeys } from '../../services/deviceKeyStorage';

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
  const { identity, getWrappingKey } = useIdentity();
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
      let bundleResp;
      if (identity) {
        bundleResp = await api.identity.getKeyBundle(identity.id);
      } else {
        bundleResp = await api.identity.bundleByPassphrase({
          signedToken,
          passphrase: currentPassphrase,
        });
      }
      if (!bundleResp.success || !bundleResp.data) {
        throw new Error('Failed to fetch key bundle');
      }

      let decrypted;
      try {
        decrypted = await decryptKeyBundle(bundleResp.data, currentPassphrase);
      } catch {
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

      if (identity) {
        const oldWrappingKey = getWrappingKey();
        if (oldWrappingKey) {
          try {
            const wrappingSalt = await getOrCreateWrappingSalt(identity.id);
            const newWrappingKey = await deriveEntropyWrappingKey(newPassphrase, wrappingSalt);
            await reWrapDeviceKeys(identity.id, oldWrappingKey, newWrappingKey);
          } catch (err) {
            console.warn('[ChangePassphrase] Failed to re-wrap local device keys:', err);
          }
        }
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
