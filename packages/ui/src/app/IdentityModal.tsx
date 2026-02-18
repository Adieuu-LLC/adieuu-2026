import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';
import { Popover } from '../components/Popover';
import { MaskIcon, PlusIcon, LockIcon, InfoCircleIcon } from '../components/Icons';
import { useIdentity } from '../hooks/useIdentity';

interface IdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalView = 'choose' | 'login' | 'create';

export function IdentityModal({ isOpen, onClose }: IdentityModalProps) {
  const { t } = useTranslation();
  const { createIdentity, loginToIdentity, hasIdentity, canCreateMore } = useIdentity();

  const [view, setView] = useState<ModalView>(hasIdentity ? 'login' : 'choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form fields
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Rate limiting info
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);

  const resetForm = () => {
    setPassphrase('');
    setPassphraseConfirm('');
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
    if (loading) return; // Prevent multiple submissions
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
    if (loading) return; // Prevent multiple submissions
    if (passphrase.length < 8) {
      setError(t('identity.create.passphraseHint'));
      return;
    }
    if (passphrase !== passphraseConfirm) {
      setError(t('identity.create.passphraseMismatch'));
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

  // Check if passphrases match for form validation
  const passphrasesMatch = passphrase.length >= 8 && passphrase === passphraseConfirm;

  // Evaluate passphrase strength
  type StrengthLevel = 'weak' | 'medium' | 'strong' | 'veryStrong';
  const getPassphraseStrength = (phrase: string): StrengthLevel => {
    const length = phrase.length;
    const hasSpaces = /\s/.test(phrase);
    const wordCount = phrase.trim().split(/\s+/).length;
    const hasNumbers = /\d/.test(phrase);
    const hasMixedCase = /[a-z]/.test(phrase) && /[A-Z]/.test(phrase);

    // Very strong: long phrase with multiple words (like a sentence)
    if (length >= 30 && wordCount >= 5) return 'veryStrong';
    if (length >= 24 && wordCount >= 4) return 'strong';
    if (length >= 16 && (hasSpaces || hasNumbers || hasMixedCase)) return 'medium';
    if (length >= 12) return 'medium';
    return 'weak';
  };

  const passphraseStrength = passphrasesMatch ? getPassphraseStrength(passphrase) : null;

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
              {/* Show login button if user has at least one identity */}
              {hasIdentity && (
                <Button variant="primary" size="lg" onClick={() => setView('login')}>
                  <LockIcon />
                  {t('identity.loginButton')}
                </Button>
              )}

              {/* Show create button if user can create more identities */}
              {canCreateMore && (
                <Button
                  variant={hasIdentity ? 'secondary' : 'primary'}
                  size="lg"
                  onClick={() => setView('create')}
                >
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

            {!hasIdentity && canCreateMore && (
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

            <Alert variant="warning">{t('identity.create.noRecoveryWarning')}</Alert>

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
                <div className="input-with-info">
                  <Input
                    type="password"
                    placeholder={t('identity.create.passphrasePlaceholder')}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                  <Popover
                    trigger={
                      <button
                        type="button"
                        className="passphrase-info-btn"
                        aria-label="Passphrase tips"
                      >
                        <InfoCircleIcon />
                      </button>
                    }
                    positioning={{ placement: 'bottom-end' }}
                    className="passphrase-popover"
                  >
                    <div className="passphrase-info-content">
                      <h4>{t('identity.create.passphraseExamplesTitle')}</h4>
                      <ul>
                        {(t('identity.create.passphraseExamples', { returnObjects: true }) as string[]).map((example, i) => (
                          <li key={i}>{example}</li>
                        ))}
                      </ul>
                      <p className="passphrase-tip">{t('identity.create.passphraseExamplesTip')}</p>
                    </div>
                  </Popover>
                </div>
                <p className="form-hint">{t('identity.create.passphraseHint')}</p>
              </div>

              <div className="form-group">
                <Input
                  type="password"
                  placeholder={t('identity.create.passphraseConfirmPlaceholder')}
                  value={passphraseConfirm}
                  onChange={(e) => setPassphraseConfirm(e.target.value)}
                  disabled={loading}
                />
                {passphraseConfirm.length > 0 && passphrase !== passphraseConfirm && (
                  <p className="form-error">{t('identity.create.passphraseMismatch')}</p>
                )}
                {passphrasesMatch && passphraseStrength && (
                  <p className={`passphrase-strength passphrase-strength-${passphraseStrength}`}>
                    {t('identity.create.passphraseStrength.match')}
                    {passphraseStrength !== 'veryStrong' && (
                      <span className="passphrase-strength-hint">
                        {' '}&mdash; {t(`identity.create.passphraseStrength.${passphraseStrength}`)}
                      </span>
                    )}
                    {passphraseStrength === 'veryStrong' && (
                      <span className="passphrase-strength-hint passphrase-strength-excellent">
                        {' '}&mdash; {t('identity.create.passphraseStrength.veryStrong')}
                      </span>
                    )}
                  </p>
                )}
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
                  disabled={loading || !passphrasesMatch || username.length < 3 || displayName.length < 1}
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
