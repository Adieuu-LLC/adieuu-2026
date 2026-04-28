import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';
import { Popover } from '../components/Popover';
import { useToast } from '../components/Toast';
import { Icon } from '../icons/Icon';
import { useIdentity, type LoginStatus, type WebDeviceChoice } from '../hooks/useIdentity';
import { useAuth } from '../hooks/useAuth';
import { WebDeviceChoiceModal } from '../components/WebDeviceChoiceModal';
import { AgeVerificationModal } from '../components/AgeVerificationModal';
import { stringArrayFromI18nReturn } from './identityModalUtils';

interface IdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** If true, show unlock view instead of login (for locked sessions after refresh) */
  unlockMode?: boolean;
}

type ModalView = 'choose' | 'login' | 'create' | 'unlock' | 'creating' | 'logging_in'
  | 'geofenced' | 'age_verification_required' | 'age_verification_failed' | 'age_verification_cooldown';

export function IdentityModal({ isOpen, onClose, unlockMode = false }: IdentityModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { info: toastInfo } = useToast();
  const { createIdentity, loginToIdentity, unlockIdentity, logoutFromIdentity, hasIdentity, canCreateMore } = useIdentity();
  const { session } = useAuth();

  // Derive initial view from alias gate state
  const aliasGate = session?.aliasGate;
  const initialView = (): ModalView => {
    if (aliasGate && !aliasGate.allowed) {
      if (aliasGate.code === 'GEOFENCE_BLOCKED') return 'geofenced';
      if (aliasGate.code === 'AGE_VERIFICATION_FAILED') return 'age_verification_failed';
      if (aliasGate.code === 'AGE_VERIFICATION_COOLDOWN') return 'age_verification_cooldown';
      if (aliasGate.code === 'AGE_VERIFICATION_REQUIRED') return 'age_verification_required';
    }
    return unlockMode ? 'unlock' : hasIdentity && !canCreateMore ? 'login' : 'choose';
  };

  const [view, setView] = useState<ModalView>(initialView);

  // Submodal state
  const [avModalOpen, setAvModalOpen] = useState(false);
  const [avOptInMode, setAvOptInMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Switch to unlock view when unlockMode prop changes
  useEffect(() => {
    if (unlockMode && isOpen) {
      setView('unlock');
    }
  }, [unlockMode, isOpen]);

  useEffect(() => {
    if (view !== 'login' && view !== 'unlock') {
      setPasswordVisible(false);
    }
  }, [view]);

  // Refocus the unlock passphrase input after a failed attempt
  useEffect(() => {
    if (view === 'unlock' && error && !loading) {
      unlockInputRef.current?.focus();
    }
  }, [view, error, loading]);

  // Form fields
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Rate limiting info
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);

  // Login status for progress display
  const [loginStatus, setLoginStatus] = useState<LoginStatus>('authenticating');

  // Ref for refocusing the unlock passphrase input after a failed attempt
  const unlockInputRef = useRef<HTMLInputElement>(null);

  const [passwordVisible, setPasswordVisible] = useState(false);

  // Web device choice modal state
  const [webDeviceChoiceOpen, setWebDeviceChoiceOpen] = useState(false);
  const webDeviceChoiceResolver = useRef<((choice: WebDeviceChoice) => void) | null>(null);

  const handleWebDeviceChoice = useCallback((): Promise<WebDeviceChoice> => {
    return new Promise<WebDeviceChoice>((resolve) => {
      webDeviceChoiceResolver.current = resolve;
      setWebDeviceChoiceOpen(true);
    });
  }, []);

  const onWebDeviceChoiceSelected = useCallback((choice: WebDeviceChoice) => {
    setWebDeviceChoiceOpen(false);
    webDeviceChoiceResolver.current?.(choice);
    webDeviceChoiceResolver.current = null;
  }, []);

  const resetForm = () => {
    setPassphrase('');
    setPassphraseConfirm('');
    setUsername('');
    setDisplayName('');
    setError(null);
    setSuccess(null);
    setRetryAfter(null);
    setAttemptNumber(null);
    setPasswordVisible(false);
  };

  const handleClose = () => {
    // Web device choice renders in a portal; clicks can still hit this overlay.
    // Never dismiss the identity shell until the user confirms that flow.
    if (webDeviceChoiceOpen) return;

    resetForm();
    setView(unlockMode ? 'unlock' : hasIdentity && !canCreateMore ? 'login' : 'choose');
    onClose();
  };

  const handleLogin = async () => {
    if (loading) return; // Prevent multiple submissions
    if (passphrase.length < 8) {
      setError(t('identity.create.passwordHint'));
      return;
    }

    const passphraseValue = passphrase;
    
    // Switch to logging_in view immediately
    setView('logging_in');
    setLoginStatus('authenticating');
    setLoading(true);
    setError(null);
    setPassphrase('');

    const result = await loginToIdentity(passphraseValue, {
      onStatusChange: (status) => setLoginStatus(status),
      onWebDeviceChoice: handleWebDeviceChoice,
    });

    setLoading(false);

    if (result.success) {
      setSuccess(t('identity.login.success'));

      // Show toast for new device registration
      if (result.isNewDevice) {
        const deviceName = result.deviceName ?? 'this device';
        toastInfo(
          t('identity.device.newDeviceTitle'),
          t('identity.device.newDeviceMessage', { deviceName })
        );
      }

      setTimeout(() => {
        handleClose();
      }, 500);
    } else {
      // Go back to login view to show error (not choose — user was submitting login)
      setView('login');
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

  const handleUnlock = async () => {
    if (loading) return;
    if (passphrase.length < 8) {
      setError(t('identity.unlock.passwordRequired'));
      return;
    }

    const passphraseValue = passphrase;
    setLoading(true);
    setError(null);
    setPassphrase('');

    const result = await unlockIdentity(passphraseValue);

    setLoading(false);

    if (result.success) {
      setSuccess(t('identity.unlock.success'));
      setTimeout(() => {
        handleClose();
      }, 500);
    } else {
      setError(result.error || t('identity.unlock.errorInvalid'));
    }
  };

  /** Must await server logout before closing; otherwise locked UI can reopen until the cookie clears. */
  const handleFullyLogout = async () => {
    setLoading(true);
    try {
      await logoutFromIdentity();
      handleClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (loading) return; // Prevent multiple submissions
    if (passphrase.length < 8) {
      setError(t('identity.create.passwordHint'));
      return;
    }
    if (passphrase !== passphraseConfirm) {
      setError(t('identity.create.passwordMismatch'));
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

    const passphraseValue = passphrase;
    const usernameValue = username;
    const displayNameValue = displayName;
    
    // Switch to creating view immediately (hides form, shows loader)
    setView('creating');
    setLoading(true);
    setError(null);
    setPassphrase('');
    setPassphraseConfirm('');

    const result = await createIdentity(passphraseValue, usernameValue, displayNameValue);

    setLoading(false);

    if (result.success) {
      setSuccess(t('identity.create.success'));
      setTimeout(() => {
        resetForm();
        setView('login');
        setSuccess(null);
      }, 1500);
    } else {
      // On error, go back to create view to show the error
      setView('create');
      if (result.errorCode === 'USERNAME_TAKEN') {
        setError(t('identity.create.errorUsernameTaken'));
      } else if (result.errorCode === 'MAX_IDENTITIES') {
        setError(t('identity.create.errorMaxIdentities'));
      } else {
        setError(result.error || t('identity.create.errorValidation'));
      }
      // Restore username and displayName so user doesn't have to retype
      setUsername(usernameValue);
      setDisplayName(displayNameValue);
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

  const passwordVisibilityToggle = (
    <button
      type="button"
      className="input-password-toggle"
      onClick={() => setPasswordVisible((v) => !v)}
      disabled={loading}
      aria-label={
        passwordVisible
          ? t('identity.passwordVisibility.hide')
          : t('identity.passwordVisibility.show')
      }
      aria-pressed={passwordVisible}
    >
      <Icon name={passwordVisible ? 'eyeSlash' : 'eye'} />
    </button>
  );

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
              <Icon name="mask" className="identity-modal-icon" />
              <h2>{t('identity.title')}</h2>
              <p>{t('identity.create.subtitle')}</p>
            </div>

            <div className="identity-modal-actions">
              {/* Show login button if user has at least one identity */}
              {hasIdentity && (
                <Button variant="primary" size="lg" onClick={() => setView('login')}>
                  <Icon name="lock" />
                  {t('identity.loginToExistingButton')}
                </Button>
              )}

              {/* Show create button if user can create more identities */}
              {canCreateMore && (
                <Button
                  variant={hasIdentity ? 'secondary' : 'primary'}
                  size="lg"
                  onClick={() => setView('create')}
                >
                  <Icon name="plus" />
                  {t('identity.createButton')}
                </Button>
              )}
            </div>
          </div>
        )}

        {view === 'login' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <Icon name="mask" className="identity-modal-icon" />
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
                type={passwordVisible ? 'text' : 'password'}
                placeholder={t('identity.login.passwordPlaceholder')}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
                autoFocus
                autoComplete="current-password"
                rightIcon={passwordVisibilityToggle}
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

            {canCreateMore && (
              <div className="identity-modal-footer">
                {!hasIdentity ? (
                  <>
                    <p>{t('identity.login.noIdentity')}</p>
                    <Button variant="ghost" size="sm" onClick={() => setView('create')}>
                      {t('identity.login.createPrompt')}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setView('create')}>
                    {t('identity.login.createAnotherPrompt')}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'unlock' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <Icon name="lock" className="identity-modal-icon" />
              <h2>{t('identity.unlock.title')}</h2>
              <p>{t('identity.unlock.subtitle')}</p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            <form
              className="identity-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleUnlock();
              }}
            >
              <Input
                ref={unlockInputRef}
                type={passwordVisible ? 'text' : 'password'}
                placeholder={t('identity.unlock.passwordPlaceholder')}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
                autoFocus
                autoComplete="current-password"
                rightIcon={passwordVisibilityToggle}
              />

              <div className="identity-modal-buttons">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || passphrase.length < 8}
                >
                  {loading ? <Spinner size="sm" /> : t('identity.unlock.submitButton')}
                </Button>
              </div>
            </form>

            <div className="identity-modal-footer">
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => void handleFullyLogout()}
              >
                {loading ? <Spinner size="sm" /> : t('identity.unlock.logoutButton')}
              </Button>
            </div>
          </div>
        )}

        {view === 'create' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <Icon name="mask" className="identity-modal-icon" />
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
                    placeholder={t('identity.create.passwordPlaceholder')}
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
                        <Icon name="info" />
                      </button>
                    }
                    positioning={{ placement: 'bottom-end' }}
                    className="passphrase-popover"
                  >
                    <div className="passphrase-info-content">
                      <h4>{t('identity.create.passwordExamplesTitle')}</h4>
                      <ul>
                        {stringArrayFromI18nReturn(
                          t('identity.create.passwordExamples', { returnObjects: true })
                        ).map((example, i) => (
                          <li key={i}>{example}</li>
                        ))}
                      </ul>
                      <p className="passphrase-tip">{t('identity.create.passwordExamplesTip')}</p>
                    </div>
                  </Popover>
                </div>
                <p className="form-hint">{t('identity.create.passwordHint')}</p>
              </div>

              <div className="form-group">
                <Input
                  type="password"
                  placeholder={t('identity.create.passwordConfirmPlaceholder')}
                  value={passphraseConfirm}
                  onChange={(e) => setPassphraseConfirm(e.target.value)}
                  disabled={loading}
                />
                {passphraseConfirm.length > 0 && passphrase !== passphraseConfirm && (
                  <p className="form-error">{t('identity.create.passwordMismatch')}</p>
                )}
                {passphrasesMatch && passphraseStrength && (
                  <p className={`passphrase-strength passphrase-strength-${passphraseStrength}`}>
                    {t('identity.create.passwordStrength.match')}
                    {passphraseStrength !== 'veryStrong' && (
                      <span className="passphrase-strength-hint">
                        {' '}&mdash; {t(`identity.create.passwordStrength.${passphraseStrength}`)}
                      </span>
                    )}
                    {passphraseStrength === 'veryStrong' && (
                      <span className="passphrase-strength-hint passphrase-strength-excellent">
                        {' '}&mdash; {t('identity.create.passwordStrength.veryStrong')}
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

        {view === 'creating' && (
          <div className="identity-modal-content identity-modal-creating">
            <div className="identity-creating-loader">
              <Spinner size="lg" />
              <h2>{success ? t('identity.create.success') : t('identity.create.creatingTitle')}</h2>
              <p>{success ? t('identity.create.redirecting') : t('identity.create.creatingSubtitle')}</p>
            </div>
          </div>
        )}

        {view === 'logging_in' && (
          <div className="identity-modal-content identity-modal-creating">
            <div className="identity-creating-loader">
              <Spinner size="lg" />
              <h2>{success ? t('identity.login.success') : t('identity.login.loggingInTitle')}</h2>
              <p>{success ? t('identity.login.redirecting') : t(`identity.login.status.${loginStatus}`)}</p>
            </div>
          </div>
        )}

        {view === 'geofenced' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <Icon name="lock" className="identity-modal-icon" />
              <h2>{t('compliance.geofence.title')}</h2>
            </div>
            <Alert variant="error">
              {t('compliance.geofence.description')}
            </Alert>
            {aliasGate?.jurisdiction && (
              <p className="identity-modal-jurisdiction">
                {t('compliance.geofence.jurisdictionLabel')}: <strong>{aliasGate.jurisdiction}</strong>
              </p>
            )}
            {aliasGate?.lawUrl && (
              <a
                href={aliasGate.lawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="identity-modal-law-link"
              >
                {t('compliance.geofence.viewLaw')}
              </a>
            )}
          </div>
        )}

        {view === 'age_verification_required' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <Icon name="lock" className="identity-modal-icon" />
              <h2>{t('compliance.ageVerification.title')}</h2>
              <p>{t('compliance.ageVerification.description')}</p>
            </div>
            <div className="identity-modal-actions">
              <Button variant="primary" size="lg" onClick={() => setAvModalOpen(true)}>
                {t('compliance.ageVerification.startButton')}
              </Button>
            </div>
          </div>
        )}

        {view === 'age_verification_failed' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <Icon name="lock" className="identity-modal-icon" />
              <h2>{t('compliance.ageVerification.title')}</h2>
            </div>
            <Alert variant="error">
              {t('compliance.ageVerification.failedMessage')}
            </Alert>
            {aliasGate?.retryAfter && (
              <p className="identity-modal-retry-after">
                {t('compliance.ageVerification.retryAfterLabel')}: {new Date(aliasGate.retryAfter).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {view === 'age_verification_cooldown' && (
          <div className="identity-modal-content">
            <div className="identity-modal-header">
              <Icon name="lock" className="identity-modal-icon" />
              <h2>{t('compliance.ageVerification.title')}</h2>
            </div>
            <Alert variant="warning">
              {t('compliance.ageVerification.cooldownMessage')}
            </Alert>
            {aliasGate?.retryAfter && (
              <p className="identity-modal-retry-after">
                {t('compliance.ageVerification.retryAfterLabel')}: {new Date(aliasGate.retryAfter).toLocaleDateString()}
              </p>
            )}
            {session?.ageVerification?.expirationCount !== undefined && (
              <p className="identity-modal-expiration-count">
                {t('compliance.ageVerification.expirationCount', {
                  count: session.ageVerification.expirationCount,
                  max: 3,
                })}
              </p>
            )}
          </div>
        )}

        {/* Jurisdiction advisory banner for unresolved geo */}
        {(view === 'choose' || view === 'login' || view === 'create') &&
          session?.ageVerification === undefined &&
          !session?.geo?.jurisdiction && (
          <div className="identity-modal-advisory">
            <Alert variant="info">
              {t('compliance.advisory.unresolvedJurisdiction')}
            </Alert>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setAvOptInMode(true); setAvModalOpen(true); }}
            >
              {t('compliance.advisory.optInButton')}
            </Button>
          </div>
        )}
      </div>

      <WebDeviceChoiceModal
        open={webDeviceChoiceOpen}
        onChoice={onWebDeviceChoiceSelected}
      />

      <AgeVerificationModal
        open={avModalOpen}
        onClose={() => { setAvModalOpen(false); setAvOptInMode(false); }}
        jurisdiction={aliasGate?.jurisdiction}
        retryAfter={aliasGate?.retryAfter ?? session?.ageVerification?.retryAfter}
        expirationCount={session?.ageVerification?.expirationCount}
        gateCode={aliasGate?.code}
        isOptIn={avOptInMode}
      />
    </div>
  );
}
