import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { OtpInput } from '../../components/OtpInput';
import { Alert } from '../../components/Alert';
import { Tooltip } from '../../components/Tooltip';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { createApiClient, type UserProfile } from '@adieuu/shared';
import { useAuth } from '../../hooks/useAuth';
import { useAppConfig } from '../../config';
import { usePlatform } from '../../hooks/usePlatform';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';

type EditMode = 'none' | 'email' | 'phone';
type VerifyMode = 'none' | 'email' | 'phone';

/** Normalize email for comparison (case-insensitive) */
function normalizeEmail(email: string | undefined | null): string {
  return (email ?? '').trim().toLowerCase();
}

/** Normalize phone for comparison (digits only) */
function normalizePhone(phone: string | undefined | null): string {
  return (phone ?? '').replace(/\D/g, '');
}

export function AccountOverview() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { apiBaseUrl } = useAppConfig();
  const toast = useToast();
  const platform = usePlatform();
  const { status: updateStatus, newVersion, errorMessage: updateErrorMessage, checkForUpdates, applyUpdate, downloadUpdate } = useUpdateCheck();

  // Desktop update preferences (auto-download toggle)
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    if (platform !== 'desktop') return;

    const electron = (window as Window & { electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;
    if (!electron) return;

    electron.invoke('get-update-preferences').then((prefs) => {
      const p = prefs as { autoDownloadEnabled?: boolean } | undefined;
      if (p && typeof p.autoDownloadEnabled === 'boolean') {
        setAutoDownloadEnabled(p.autoDownloadEnabled);
      }
      setPrefsLoaded(true);
    }).catch(() => {
      setPrefsLoaded(true);
    });
  }, [platform]);

  const handleAutoDownloadToggle = useCallback((checked: boolean) => {
    setAutoDownloadEnabled(checked);

    const electron = (window as Window & { electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;
    if (!electron) return;

    electron.invoke('set-update-preferences', { autoDownloadEnabled: checked }).catch(() => {
      setAutoDownloadEnabled(!checked);
    });
  }, []);

  // Create API client using configured base URL
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [verifyMode, setVerifyMode] = useState<VerifyMode>('none');

  // Form state
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Action state
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load profile on mount
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.users.getProfile();
      if (response.success && response.data) {
        setProfile(response.data);
      } else {
        setError(response.error?.message ?? 'Failed to load profile');
      }
    } catch {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);


  // Request email verification
  const handleRequestEmailVerification = async () => {
    if (!emailInput.trim() || normalizeEmail(emailInput) === normalizeEmail(profile?.email)) return;

    setSubmitting(true);
    setActionError(null);

    try {
      const response = await api.users.requestEmailVerification({ email: emailInput });
      if (response.success) {
        setVerifyMode('email');
        toast.success(t('account.overview.codeSent'));
      } else {
        setActionError(response.error?.message ?? t('account.overview.errorSendingCode'));
      }
    } catch {
      setActionError(t('account.overview.errorSendingCode'));
    } finally {
      setSubmitting(false);
    }
  };

  // Verify email with OTP
  const handleVerifyEmail = async (code: string) => {
    setSubmitting(true);
    setActionError(null);

    try {
      const response = await api.users.verifyEmail({ email: emailInput, code });
      if (response.success && response.data) {
        setProfile(response.data);
        setEditMode('none');
        setVerifyMode('none');
        setEmailInput('');
        setOtpCode('');
        toast.success(t('account.overview.emailVerified'));
      } else {
        // Handle ALREADY_OWNED error with a specific message
        if (response.error?.code === 'ALREADY_OWNED') {
          setActionError(t('account.overview.alreadyOwned'));
        } else {
          setActionError(response.error?.message ?? t('account.overview.invalidCode'));
        }
        setOtpCode('');
      }
    } catch {
      setActionError(t('account.overview.invalidCode'));
    } finally {
      setSubmitting(false);
    }
  };

  // Request phone verification
  const handleRequestPhoneVerification = async () => {
    if (!phoneInput.trim() || normalizePhone(phoneInput) === normalizePhone(profile?.phone)) return;

    setSubmitting(true);
    setActionError(null);

    try {
      const response = await api.users.requestPhoneVerification({ phone: phoneInput });
      if (response.success) {
        setVerifyMode('phone');
        toast.success(t('account.overview.codeSent'));
      } else {
        setActionError(response.error?.message ?? t('account.overview.errorSendingCode'));
      }
    } catch {
      setActionError(t('account.overview.errorSendingCode'));
    } finally {
      setSubmitting(false);
    }
  };

  // Verify phone with OTP
  const handleVerifyPhone = async (code: string) => {
    setSubmitting(true);
    setActionError(null);

    try {
      const response = await api.users.verifyPhone({ phone: phoneInput, code });
      if (response.success && response.data) {
        setProfile(response.data);
        setEditMode('none');
        setVerifyMode('none');
        setPhoneInput('');
        setOtpCode('');
        toast.success(t('account.overview.phoneVerified'));
      } else {
        // Handle ALREADY_OWNED error with a specific message
        if (response.error?.code === 'ALREADY_OWNED') {
          setActionError(t('account.overview.alreadyOwned'));
        } else {
          setActionError(response.error?.message ?? t('account.overview.invalidCode'));
        }
        setOtpCode('');
      }
    } catch {
      setActionError(t('account.overview.invalidCode'));
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setEditMode('none');
    setVerifyMode('none');
    setEmailInput('');
    setPhoneInput('');
    setOtpCode('');
    setActionError(null);
  };

  // Start editing
  const handleEditEmail = () => {
    setEditMode('email');
    setEmailInput(profile?.email ?? '');
    setActionError(null);
  };

  const handleEditPhone = () => {
    setEditMode('phone');
    setPhoneInput(profile?.phone ?? '');
    setActionError(null);
  };

  // Render verification status badge
  const renderVerificationBadge = (verified: boolean, type: 'email' | 'phone') => {
    if (verified) {
      return (
        <Tooltip content={t('account.overview.verified')} position="left">
          <span className="verification-badge verification-verified">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        </Tooltip>
      );
    }

    const notSetText = type === 'email'
      ? t('account.overview.emailNotVerifiedTooltip')
      : t('account.overview.phoneNotVerifiedTooltip');

    return (
      <Tooltip content={notSetText} position="left">
        <span className="verification-badge verification-pending">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
      </Tooltip>
    );
  };

  // Get display value for contact info
  const getEmailDisplay = () => {
    if (profile?.email) {
      return profile.email;
    }
    return t('common.notSet');
  };

  const getPhoneDisplay = () => {
    if (profile?.phone) {
      return profile.phone;
    }
    return t('common.notSet');
  };

  // Loading state
  if (loading) {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('account.overview.title')}</h1>
          </div>
          <div className="loading-container">
            <Spinner size="lg" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !profile) {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('account.overview.title')}</h1>
          </div>
          <Alert variant="error">{error}</Alert>
          <Button onClick={loadProfile} className="btn btn-secondary btn-md" style={{ marginTop: '1rem' }}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('account.overview.title')}</h1>
          <p className="page-subtitle">
            {t('account.overview.subtitle')}
          </p>
        </div>

        <Card variant="elevated" className="slide-up">
          <div className="account-overview">
            {/* Account details */}
            <div className="account-details">
              {/* Email row */}
              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.email')}</span>
                <div className="account-detail-content">
                  {editMode === 'email' ? (
                    <div className="account-edit-form">
                      {verifyMode === 'email' ? (
                        <>
                          <p className="account-edit-info">
                            {t('account.overview.enterCodeFor')} {emailInput}
                          </p>
                          {actionError && (
                            <Alert variant="error" className="account-edit-alert">{actionError}</Alert>
                          )}
                          <OtpInput
                            length={6}
                            value={otpCode}
                            onChange={setOtpCode}
                            onComplete={(code) => {
                              // Use setTimeout to let React state settle before API call
                              setTimeout(() => handleVerifyEmail(code), 100);
                            }}
                            disabled={submitting}
                          />
                          <div className="account-edit-actions">
                            <Button
                              onClick={handleCancel}
                              className="btn btn-ghost btn-sm"
                              disabled={submitting}
                            >
                              {t('common.cancel')}
                            </Button>
                            <Button
                              onClick={() => handleVerifyEmail(otpCode)}
                              className="btn btn-primary btn-sm"
                              disabled={submitting || otpCode.length !== 6}
                            >
                              {submitting ? <Spinner size="sm" /> : t('account.overview.verify')}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          {actionError && (
                            <Alert variant="error" className="account-edit-alert">{actionError}</Alert>
                          )}
                          <Input
                            type="email"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder={t('account.overview.enterEmail')}
                            disabled={submitting}
                          />
                          <div className="account-edit-actions">
                            <Button
                              onClick={handleCancel}
                              className="btn btn-ghost btn-sm"
                              disabled={submitting}
                            >
                              {t('common.cancel')}
                            </Button>
                            {normalizeEmail(emailInput) === normalizeEmail(profile?.email) && emailInput.trim() ? (
                              <Tooltip content={t('account.overview.emailUnchanged')}>
                                <span>
                                  <Button
                                    className="btn btn-primary btn-sm"
                                    disabled
                                  >
                                    {t('account.overview.sendCode')}
                                  </Button>
                                </span>
                              </Tooltip>
                            ) : (
                              <Button
                                onClick={handleRequestEmailVerification}
                                className="btn btn-primary btn-sm"
                                disabled={submitting || !emailInput.trim()}
                              >
                                {submitting ? <Spinner size="sm" /> : t('account.overview.sendCode')}
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="account-detail-display">
                      <Button
                        onClick={handleEditEmail}
                        className="btn btn-ghost btn-sm account-edit-btn"
                      >
                        {profile?.email ? t('common.edit') : t('account.overview.add')}
                      </Button>
                      {profile?.email && renderVerificationBadge(profile.emailVerified, 'email')}
                      <span className={`account-detail-value ${!profile?.email ? 'account-detail-muted' : ''}`}>
                        {getEmailDisplay()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Phone row */}
              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.phone')}</span>
                <div className="account-detail-content">
                  {editMode === 'phone' ? (
                    <div className="account-edit-form">
                      {verifyMode === 'phone' ? (
                        <>
                          <p className="account-edit-info">
                            {t('account.overview.enterCodeFor')} {phoneInput}
                          </p>
                          {actionError && (
                            <Alert variant="error" className="account-edit-alert">{actionError}</Alert>
                          )}
                          <OtpInput
                            length={6}
                            value={otpCode}
                            onChange={setOtpCode}
                            onComplete={(code) => {
                              // Use setTimeout to let React state settle before API call
                              setTimeout(() => handleVerifyPhone(code), 100);
                            }}
                            disabled={submitting}
                          />
                          <div className="account-edit-actions">
                            <Button
                              onClick={handleCancel}
                              className="btn btn-ghost btn-sm"
                              disabled={submitting}
                            >
                              {t('common.cancel')}
                            </Button>
                            <Button
                              onClick={() => handleVerifyPhone(otpCode)}
                              className="btn btn-primary btn-sm"
                              disabled={submitting || otpCode.length !== 6}
                            >
                              {submitting ? <Spinner size="sm" /> : t('account.overview.verify')}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          {actionError && (
                            <Alert variant="error" className="account-edit-alert">{actionError}</Alert>
                          )}
                          <Input
                            type="tel"
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            placeholder={t('account.overview.enterPhone')}
                            disabled={submitting}
                          />
                          <div className="account-edit-actions">
                            <Button
                              onClick={handleCancel}
                              className="btn btn-ghost btn-sm"
                              disabled={submitting}
                            >
                              {t('common.cancel')}
                            </Button>
                            {normalizePhone(phoneInput) === normalizePhone(profile?.phone) && phoneInput.trim() ? (
                              <Tooltip content={t('account.overview.phoneUnchanged')}>
                                <span>
                                  <Button
                                    className="btn btn-primary btn-sm"
                                    disabled
                                  >
                                    {t('account.overview.sendCode')}
                                  </Button>
                                </span>
                              </Tooltip>
                            ) : (
                              <Button
                                onClick={handleRequestPhoneVerification}
                                className="btn btn-primary btn-sm"
                                disabled={submitting || !phoneInput.trim()}
                              >
                                {submitting ? <Spinner size="sm" /> : t('account.overview.sendCode')}
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="account-detail-display">
                      <Button
                        onClick={handleEditPhone}
                        className="btn btn-ghost btn-sm account-edit-btn"
                      >
                        {profile?.phone ? t('common.edit') : t('account.overview.add')}
                      </Button>
                      {profile?.phone && renderVerificationBadge(profile.phoneVerified, 'phone')}
                      <span className={`account-detail-value ${!profile?.phone ? 'account-detail-muted' : ''}`}>
                        {getPhoneDisplay()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Account standing */}
              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.accountStanding')}</span>
                <span className="account-detail-value account-status-good">
                  {t('account.overview.statusGood')}
                </span>
              </div>

              {/* Role */}
              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.role')}</span>
                <span className="account-detail-value">
                  {t('account.overview.roleUser')}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {platform === 'desktop' && (
          <Card variant="elevated" className="slide-up" style={{ marginTop: 'var(--spacing-lg)' }}>
            <div className="account-overview">
              <div className="account-details">
                <div className="account-detail-row">
                  <span className="account-detail-label">{t('account.overview.updates')}</span>
                  <div className="account-detail-content">
                    <div className="account-update-section">
                      <div className="account-update-version">
                        <span className="account-detail-label">{t('account.overview.currentVersion')}</span>
                        <span className="account-detail-value">
                          {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}
                        </span>
                      </div>

                      {newVersion && (updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'ready') && (
                        <div className="account-update-version">
                          <span className="account-detail-label">{t('account.overview.newVersionAvailable')}</span>
                          <span className="account-detail-value">{newVersion}</span>
                        </div>
                      )}

                      {updateStatus === 'up-to-date' && (
                        <p className="account-update-message account-status-good">{t('account.overview.upToDate')}</p>
                      )}
                      {updateStatus === 'available' && (
                        <p className="account-update-message">
                          {newVersion
                            ? t('account.overview.updateAvailableVersion', { version: newVersion })
                            : t('account.overview.updateAvailable')}
                        </p>
                      )}
                      {updateStatus === 'downloading' && (
                        <p className="account-update-message">{t('account.overview.downloading')}</p>
                      )}
                      {updateStatus === 'ready' && (
                        <p className="account-update-message">{t('account.overview.updateReady')}</p>
                      )}
                      {updateStatus === 'error' && (
                        <p className="account-update-message account-status-error">
                          {t('account.overview.updateError')}
                          {updateErrorMessage && (
                            <span className="account-update-error-detail"> ({updateErrorMessage})</span>
                          )}
                        </p>
                      )}

                      <div className="account-update-actions">
                        {updateStatus === 'available' && (
                          <Button onClick={downloadUpdate} className="btn btn-primary btn-sm">
                            {t('account.overview.downloadUpdate')}
                          </Button>
                        )}
                        {updateStatus === 'ready' && (
                          <Button onClick={applyUpdate} className="btn btn-primary btn-sm">
                            {t('account.overview.restartToUpdate')}
                          </Button>
                        )}
                        {updateStatus !== 'available' && updateStatus !== 'ready' && (
                          <Button
                            onClick={checkForUpdates}
                            className="btn btn-secondary btn-sm"
                            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                          >
                            {updateStatus === 'checking' ? (
                              <><Spinner size="sm" /> {t('account.overview.checking')}</>
                            ) : updateStatus === 'downloading' ? (
                              <><Spinner size="sm" /> {t('account.overview.downloading')}</>
                            ) : (
                              t('account.overview.checkForUpdates')
                            )}
                          </Button>
                        )}
                      </div>

                      {prefsLoaded && (
                        <label className="app-settings-toggle" style={{ marginTop: 'var(--spacing-md)' }}>
                          <input
                            type="checkbox"
                            checked={autoDownloadEnabled}
                            onChange={(e) => handleAutoDownloadToggle(e.target.checked)}
                          />
                          <span className="app-settings-toggle-label">
                            <span className="app-settings-toggle-title">
                              {t('account.overview.autoDownload')}
                            </span>
                            <span className="app-settings-toggle-hint">
                              {t('account.overview.autoDownloadDescription')}
                            </span>
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
