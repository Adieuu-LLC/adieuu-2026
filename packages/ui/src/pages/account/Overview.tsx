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
import {
  createApiClient,
  expandedJurisdictionCodesForRequirements,
  type PublicJurisdictionRequirement,
  type UserProfile,
} from '@adieuu/shared';
import { useAuth } from '../../hooks/useAuth';
import { useAppConfig } from '../../config';

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

  // Moderator display name
  const isModerator = session?.isPlatformModerator || session?.isPlatformAdmin;
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);

  // Jurisdiction requirements (regulatory reference)
  const [jurisdictionReqs, setJurisdictionReqs] = useState<PublicJurisdictionRequirement[]>([]);
  const [jreqLoading, setJreqLoading] = useState(false);

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

  const geo = session?.geo;

  useEffect(() => {
    if (!geo) {
      setJurisdictionReqs([]);
      return;
    }
    const codes = expandedJurisdictionCodesForRequirements(geo);
    let cancelled = false;
    setJreqLoading(true);
    void (async () => {
      const res = await api.geo.getJurisdictionRequirements(codes);
      if (cancelled) return;
      if (res.success && res.data) {
        const sorted = [...res.data].sort((a, b) => {
          const r = a.region.localeCompare(b.region);
          if (r !== 0) return r;
          return a.jurisdictionName.localeCompare(b.jurisdictionName);
        });
        setJurisdictionReqs(sorted);
      } else {
        setJurisdictionReqs([]);
      }
      setJreqLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, geo]);


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

  const handleSaveDisplayName = async () => {
    if (!displayNameInput.trim()) return;
    setSavingDisplayName(true);
    try {
      const res = await api.users.updateDisplayName(displayNameInput.trim());
      if (res.success && res.data) {
        setProfile((prev) => prev ? { ...prev, displayName: res.data!.displayName } : prev);
        setEditingDisplayName(false);
        toast.success(t('account.overview.moderatorDisplayNameSaved'));
      } else {
        toast.error(t('account.overview.moderatorDisplayNameError'));
      }
    } catch {
      toast.error(t('account.overview.moderatorDisplayNameError'));
    } finally {
      setSavingDisplayName(false);
    }
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

              {/* Moderator display name (only for mods/admins) */}
              {isModerator && (
                <div className="account-detail-row">
                  <span className="account-detail-label">{t('account.overview.moderatorDisplayName')}</span>
                  <div className="account-detail-content">
                    {editingDisplayName ? (
                      <div className="account-edit-form">
                        <Input
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          placeholder={t('account.overview.moderatorDisplayNamePlaceholder')}
                          disabled={savingDisplayName}
                          maxLength={50}
                        />
                        <span className="input-hint">{t('account.overview.moderatorDisplayNameHint')}</span>
                        <div className="account-edit-actions">
                          <Button
                            onClick={() => setEditingDisplayName(false)}
                            className="btn btn-ghost btn-sm"
                            disabled={savingDisplayName}
                          >
                            {t('common.cancel')}
                          </Button>
                          <Button
                            onClick={handleSaveDisplayName}
                            className="btn btn-primary btn-sm"
                            disabled={savingDisplayName || !displayNameInput.trim()}
                          >
                            {savingDisplayName ? <Spinner size="sm" /> : t('common.save')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="account-detail-display">
                        <Button
                          onClick={() => {
                            setDisplayNameInput(profile?.displayName ?? '');
                            setEditingDisplayName(true);
                          }}
                          className="btn btn-ghost btn-sm account-edit-btn"
                        >
                          {profile?.displayName ? t('common.edit') : t('account.overview.add')}
                        </Button>
                        <span className={`account-detail-value ${!profile?.displayName ? 'account-detail-muted' : ''}`}>
                          {profile?.displayName || t('common.notSet')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {session != null ? (
          <Card variant="elevated" className="slide-up" style={{ marginTop: '1.5rem' }}>
            <h2 className="page-title" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
              {t('account.overview.location.title')}
            </h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              {t('account.overview.location.subtitle')}
            </p>
            {session.maskedIp != null && session.maskedIp !== '' ? (
              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.location.maskedIp')}</span>
                <span className="account-detail-value">{session.maskedIp}</span>
              </div>
            ) : (
              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.location.maskedIp')}</span>
                <span className="account-detail-value account-detail-muted">{t('common.notSet')}</span>
              </div>
            )}
            {geo ? (
              <>
                <div className="account-detail-row">
                  <span className="account-detail-label">{t('account.overview.location.jurisdiction')}</span>
                  <span className="account-detail-value">{geo.jurisdiction}</span>
                </div>
                <div className="account-detail-row">
                  <span className="account-detail-label">{t('account.overview.location.countryCode')}</span>
                  <span className="account-detail-value">{geo.countryCode}</span>
                </div>
                {geo.regionCode != null && geo.regionCode !== '' && (
                  <div className="account-detail-row">
                    <span className="account-detail-label">{t('account.overview.location.regionCode')}</span>
                    <span className="account-detail-value">{geo.regionCode}</span>
                  </div>
                )}
                <div className="account-detail-row">
                  <span className="account-detail-label">{t('account.overview.location.lastChecked')}</span>
                  <span className="account-detail-value">
                    {new Date(geo.checkedAt).toLocaleString()}
                  </span>
                </div>
              </>
            ) : (
              <p className="account-detail-muted" style={{ margin: 0 }}>
                {t('account.overview.location.unavailable')}
              </p>
            )}
          </Card>
        ) : null}

        {geo != null && (
          <Card variant="elevated" className="slide-up" style={{ marginTop: '1.5rem' }}>
            <h2 className="page-title" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
              {t('account.overview.compliance.title')}
            </h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              {t('account.overview.compliance.subtitle')}
            </p>
            <Alert variant="info" className="account-edit-alert" style={{ marginBottom: '1rem' }}>
              {t('account.overview.compliance.ageVerificationPlanned')}
            </Alert>
            {jreqLoading && (
              <div className="loading-container">
                <Spinner size="md" />
              </div>
            )}
            {!jreqLoading && jurisdictionReqs.length === 0 && geo && (
              <p className="account-detail-muted" style={{ margin: 0 }}>
                {t('account.overview.compliance.empty')}
              </p>
            )}
            {!jreqLoading && jurisdictionReqs.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {jurisdictionReqs.map((row) => (
                  <li
                    key={row.jurisdiction}
                    style={{
                      border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.1))',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'baseline' }}>
                      <strong>{row.jurisdictionName}</strong>
                      <span className="account-detail-muted" style={{ fontSize: '0.875rem' }}>
                        {row.jurisdiction} — {row.region}
                      </span>
                      {row.status === 'proposed' && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            opacity: 0.8,
                          }}
                        >
                          {t('account.overview.compliance.proposed')}
                        </span>
                      )}
                    </div>
                    {row.regulatoryBody != null && row.regulatoryBody !== '' && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                        <span className="account-detail-muted">{t('account.overview.compliance.regulatoryBody')}: </span>
                        {row.regulatoryBody}
                      </p>
                    )}
                    {row.legislation.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <span className="account-detail-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                          {t('account.overview.compliance.legislation')}
                        </span>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                          {row.legislation.map((leg) => (
                            <li key={leg.name}>
                              {leg.url != null && leg.url !== '' ? (
                                <a href={leg.url} target="_blank" rel="noopener noreferrer">
                                  {leg.name}
                                </a>
                              ) : (
                                leg.name
                              )}
                              {leg.enactmentDate != null && leg.enactmentDate !== '' && (
                                <span className="account-detail-muted" style={{ marginLeft: '0.25rem' }}>
                                  ({leg.enactmentDate})
                                </span>
                              )}
                              {leg.notes != null && leg.notes !== '' && (
                                <p className="account-detail-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                                  {leg.notes}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {row.requirements.length > 0 && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                        <span className="account-detail-muted">{t('account.overview.compliance.requirements')}: </span>
                        {row.requirements
                          .map((r) => r.replaceAll('_', ' '))
                          .join(' · ')}
                      </p>
                    )}
                    {row.compatibleMethods.length > 0 && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                        <span className="account-detail-muted">{t('account.overview.compliance.methods')}: </span>
                        {row.compatibleMethods
                          .map((m) => m.replaceAll('_', ' '))
                          .join(' · ')}
                      </p>
                    )}
                    {row.notes != null && row.notes !== '' && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }} className="account-detail-muted">
                        {t('account.overview.compliance.notes')}: {row.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

      </div>
    </div>
  );
}
