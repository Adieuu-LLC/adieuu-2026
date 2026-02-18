import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';
import { MaskIcon, PlusIcon, LockIcon } from '../components/Icons';
import { useIdentity } from '../hooks/useIdentity';

interface IdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalView = 'choose' | 'login' | 'create';

export function IdentityModal({ isOpen, onClose }: IdentityModalProps) {
  const { t } = useTranslation();
  const { createIdentity, loginToIdentity, hasIdentity } = useIdentity();

  const [view, setView] = useState<ModalView>(hasIdentity ? 'login' : 'choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form fields
  const [passphrase, setPassphrase] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Rate limiting info
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);

  const resetForm = () => {
    setPassphrase('');
    setUsername('');
    setDisplayName('');
    setError(null);
    setSuccess(null);
    setRetryAfter(null);
    setAttemptNumber(null);
  };

  const handleClose = () => {
    resetForm();
    setView(hasIdentity ? 'login' : 'choose');
    onClose();
  };

  const handleLogin = async () => {
    if (passphrase.length < 8) {
      setError(t('identity.create.passphraseHint'));
      return;
    }

    setLoading(true);
    setError(null);

    const result = await loginToIdentity(passphrase);

    setLoading(false);

    if (result.success) {
      setSuccess(t('identity.login.success'));
      setTimeout(() => {
        handleClose();
      }, 1000);
    } else {
      if (result.errorCode === 'LOCKED_OUT') {
        setError(t('identity.login.errorLocked'));
      } else if (result.errorCode === 'RATE_LIMITED' && result.retryAfter) {
        setError(t('identity.login.errorRateLimited', { seconds: result.retryAfter }));
        setRetryAfter(result.retryAfter);
      } else {
        setError(result.error || t('identity.login.errorInvalid'));
      }
      setAttemptNumber(result.attemptNumber ?? null);
    }
  };

  const handleCreate = async () => {
    if (passphrase.length < 8) {
      setError(t('identity.create.passphraseHint'));
      return;
    }
    if (username.length < 3) {
      setError(t('identity.create.usernameHint'));
      return;
    }
    if (displayName.length < 1) {
      setError(t('identity.create.displayNameHint'));
      return;
    }

    setLoading(true);
    setError(null);

    const result = await createIdentity(passphrase, username, displayName);

    setLoading(false);

    if (result.success) {
      setSuccess(t('identity.create.success'));
      // After successful creation, switch to login view
      setTimeout(() => {
        resetForm();
        setView('login');
        setSuccess(null);
      }, 2000);
    } else {
      if (result.errorCode === 'USERNAME_TAKEN') {
        setError(t('identity.create.errorUsernameTaken'));
      } else if (result.errorCode === 'MAX_IDENTITIES') {
        setError(t('identity.create.errorMaxIdentities'));
      } else {
        setError(result.error || t('identity.create.errorValidation'));
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-container identity-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label="Close">
          &times;
        </button>

        {view === 'choose' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <MaskIcon className="identity-modal-icon" />
              <h2>{t('identity.title')}</h2>
              <p>{t('identity.create.subtitle')}</p>
            </div>

            <div className="identity-modal-actions">
              {hasIdentity ? (
                <Button variant="primary" size="lg" onClick={() => setView('login')}>
                  <LockIcon />
                  {t('identity.loginButton')}
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={() => setView('create')}>
                  <PlusIcon />
                  {t('identity.createButton')}
                </Button>
              )}
            </div>
          </div>
        )}

        {view === 'login' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <MaskIcon className="identity-modal-icon" />
              <h2>{t('identity.login.title')}</h2>
              <p>{t('identity.login.subtitle')}</p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            <form
              className="identity-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >
              <Input
                type="password"
                placeholder={t('identity.login.passphrasePlaceholder')}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
                autoFocus
              />

              {attemptNumber && attemptNumber >= 3 && (
                <p className="identity-attempt-warning">
                  {t('identity.login.attemptsRemaining', { remaining: 6 - attemptNumber })}
                </p>
              )}

              <div className="identity-modal-buttons">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || passphrase.length < 8}
                >
                  {loading ? <Spinner size="sm" /> : t('identity.login.submitButton')}
                </Button>
              </div>
            </form>

            {!hasIdentity && (
              <div className="identity-modal-footer">
                <p>{t('identity.login.noIdentity')}</p>
                <Button variant="ghost" size="sm" onClick={() => setView('create')}>
                  {t('identity.login.createPrompt')}
                </Button>
              </div>
            )}
          </div>
        )}

        {view === 'create' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <MaskIcon className="identity-modal-icon" />
              <h2>{t('identity.create.title')}</h2>
              <p>{t('identity.create.subtitle')}</p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            <form
              className="identity-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
            >
              <div className="form-group">
                <Input
                  type="password"
                  placeholder={t('identity.create.passphrasePlaceholder')}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
                <p className="form-hint">{t('identity.create.passphraseHint')}</p>
              </div>

              <div className="form-group">
                <Input
                  type="text"
                  placeholder={t('identity.create.usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  disabled={loading}
                  maxLength={30}
                />
                <p className="form-hint">{t('identity.create.usernameHint')}</p>
              </div>

              <div className="form-group">
                <Input
                  type="text"
                  placeholder={t('identity.create.displayNamePlaceholder')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={loading}
                  maxLength={50}
                />
                <p className="form-hint">{t('identity.create.displayNameHint')}</p>
              </div>

              <div className="identity-modal-buttons">
                <Button type="button" variant="ghost" onClick={() => setView('choose')}>
                  {t('common.back')}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || passphrase.length < 8 || username.length < 3 || displayName.length < 1}
                >
                  {loading ? <Spinner size="sm" /> : t('identity.create.submitButton')}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
