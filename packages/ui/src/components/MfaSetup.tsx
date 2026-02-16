/**
 * MFA Setup Components
 * Handles TOTP (authenticator app) and WebAuthn (passkey) configuration
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { Spinner } from './Spinner';
import { ConfirmDialog } from './ConfirmDialog';
import {
  createApiClient,
  type MfaStatus,
  type TotpCredential,
  type WebAuthnCredential,
} from '@chadder/shared';
import { useAppConfig } from '../config';
import { startRegistration } from '@simplewebauthn/browser';

// ============================================================================
// TOTP Setup Component
// ============================================================================

interface TotpSetupProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function TotpSetup({ onComplete, onCancel }: TotpSetupProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [step, setStep] = useState<'name' | 'scan' | 'verify' | 'backup'>('name');
  const [name, setName] = useState('Authenticator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<{
    credentialId: string;
    secret: string;
    qrCodeUrl: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const handleStartSetup = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.mfa.setupTotp(name);
      if (response.success && response.data) {
        setSetupData(response.data);
        setStep('scan');
      } else {
        setError('Failed to start setup');
      }
    } catch (err) {
      setError('Failed to start setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!setupData || code.length !== 6) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.mfa.verifyTotp(setupData.credentialId, code);
      if (response.success && response.data) {
        if (response.data.backupCodes && response.data.backupCodes.length > 0) {
          setBackupCodes(response.data.backupCodes);
          setStep('backup');
        } else {
          onComplete();
        }
      } else {
        setError('Invalid code. Please try again.');
      }
    } catch (err) {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
  };

  return (
    <div className="mfa-setup">
      {step === 'name' && (
        <div className="mfa-setup-step">
          <h3>{t('account.security.mfa.totp.setupTitle', 'Set up Authenticator')}</h3>
          <p className="mfa-setup-description">
            {t('account.security.mfa.totp.setupDescription', 'Use an authenticator app like Google Authenticator, Authy, or 1Password to generate verification codes.')}
          </p>
          <Input
            label={t('account.security.mfa.totp.nameLabel', 'Authenticator name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Authenticator"
            hint={t('account.security.mfa.totp.nameHint', 'A name to help you identify this authenticator')}
          />
          {error && <p className="mfa-error">{error}</p>}
          <div className="mfa-setup-actions">
            <Button variant="secondary" onClick={onCancel} disabled={loading}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleStartSetup} disabled={loading || !name.trim()}>
              {loading ? <Spinner size="sm" /> : t('common.continue', 'Continue')}
            </Button>
          </div>
        </div>
      )}

      {step === 'scan' && setupData && (
        <div className="mfa-setup-step">
          <h3>{t('account.security.mfa.totp.scanTitle', 'Scan QR Code')}</h3>
          <p className="mfa-setup-description">
            {t('account.security.mfa.totp.scanDescription', 'Scan this QR code with your authenticator app, or enter the key manually.')}
          </p>
          <div className="mfa-qr-container">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.qrCodeUrl)}`}
              alt="QR Code"
              className="mfa-qr-code"
            />
          </div>
          <div className="mfa-manual-key">
            <span className="mfa-manual-key-label">{t('account.security.mfa.totp.manualKey', 'Manual entry key:')}</span>
            <code className="mfa-manual-key-value">{setupData.secret}</code>
          </div>
          <div className="mfa-setup-actions">
            <Button variant="secondary" onClick={onCancel}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={() => setStep('verify')}>
              {t('common.continue', 'Continue')}
            </Button>
          </div>
        </div>
      )}

      {step === 'verify' && (
        <div className="mfa-setup-step">
          <h3>{t('account.security.mfa.totp.verifyTitle', 'Verify Code')}</h3>
          <p className="mfa-setup-description">
            {t('account.security.mfa.totp.verifyDescription', 'Enter the 6-digit code from your authenticator app to verify setup.')}
          </p>
          <Input
            label={t('account.security.mfa.totp.codeLabel', 'Verification code')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          {error && <p className="mfa-error">{error}</p>}
          <div className="mfa-setup-actions">
            <Button variant="secondary" onClick={() => setStep('scan')} disabled={loading}>
              {t('common.back', 'Back')}
            </Button>
            <Button onClick={handleVerify} disabled={loading || code.length !== 6}>
              {loading ? <Spinner size="sm" /> : t('common.verify', 'Verify')}
            </Button>
          </div>
        </div>
      )}

      {step === 'backup' && backupCodes.length > 0 && (
        <div className="mfa-setup-step">
          <h3>{t('account.security.mfa.backupCodes.title', 'Save Backup Codes')}</h3>
          <p className="mfa-setup-description">
            {t('account.security.mfa.backupCodes.description', 'Save these backup codes in a safe place. Each code can only be used once to sign in if you lose access to your authenticator.')}
          </p>
          <div className="mfa-backup-codes">
            {backupCodes.map((code, i) => (
              <code key={i} className="mfa-backup-code">{code}</code>
            ))}
          </div>
          <Button variant="secondary" onClick={handleCopyBackupCodes} className="mfa-copy-btn">
            {t('common.copy', 'Copy codes')}
          </Button>
          <div className="mfa-setup-actions">
            <Button onClick={onComplete}>
              {t('common.done', 'Done')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// WebAuthn Setup Component
// ============================================================================

interface WebAuthnSetupProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function WebAuthnSetup({ onComplete, onCancel }: WebAuthnSetupProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [step, setStep] = useState<'name' | 'register' | 'backup'>('name');
  const [name, setName] = useState('Passkey');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const handleRegister = async () => {
    setLoading(true);
    setError(null);

    try {
      // Start registration
      const startResponse = await api.mfa.startWebAuthnRegistration(name);
      if (!startResponse.success || !startResponse.data) {
        setError('Failed to start registration');
        setLoading(false);
        return;
      }

      // Call browser WebAuthn API
      const credential = await startRegistration({ optionsJSON: startResponse.data.options as Parameters<typeof startRegistration>[0]['optionsJSON'] });

      // Finish registration
      const finishResponse = await api.mfa.finishWebAuthnRegistration(credential, name);
      if (finishResponse.success && finishResponse.data) {
        if (finishResponse.data.backupCodes && finishResponse.data.backupCodes.length > 0) {
          setBackupCodes(finishResponse.data.backupCodes);
          setStep('backup');
        } else {
          onComplete();
        }
      } else {
        setError('Registration failed');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Registration was cancelled or not allowed');
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
  };

  return (
    <div className="mfa-setup">
      {step === 'name' && (
        <div className="mfa-setup-step">
          <h3>{t('account.security.mfa.webauthn.setupTitle', 'Set up Passkey')}</h3>
          <p className="mfa-setup-description">
            {t('account.security.mfa.webauthn.setupDescription', 'Use Face ID, Touch ID, Windows Hello, or a security key to sign in without a code.')}
          </p>
          <Input
            label={t('account.security.mfa.webauthn.nameLabel', 'Passkey name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Passkey"
            hint={t('account.security.mfa.webauthn.nameHint', 'A name to help you identify this passkey')}
          />
          {error && <p className="mfa-error">{error}</p>}
          <div className="mfa-setup-actions">
            <Button variant="secondary" onClick={onCancel} disabled={loading}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleRegister} disabled={loading || !name.trim()}>
              {loading ? <Spinner size="sm" /> : t('account.security.mfa.webauthn.register', 'Register Passkey')}
            </Button>
          </div>
        </div>
      )}

      {step === 'backup' && backupCodes.length > 0 && (
        <div className="mfa-setup-step">
          <h3>{t('account.security.mfa.backupCodes.title', 'Save Backup Codes')}</h3>
          <p className="mfa-setup-description">
            {t('account.security.mfa.backupCodes.description', 'Save these backup codes in a safe place. Each code can only be used once to sign in if you lose access to your passkey.')}
          </p>
          <div className="mfa-backup-codes">
            {backupCodes.map((code, i) => (
              <code key={i} className="mfa-backup-code">{code}</code>
            ))}
          </div>
          <Button variant="secondary" onClick={handleCopyBackupCodes} className="mfa-copy-btn">
            {t('common.copy', 'Copy codes')}
          </Button>
          <div className="mfa-setup-actions">
            <Button onClick={onComplete}>
              {t('common.done', 'Done')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MFA Credentials List Component
// ============================================================================

interface MfaCredentialsListProps {
  onSetupTotp: () => void;
  onSetupWebAuthn: () => void;
}

export function MfaCredentialsList({ onSetupTotp, onSetupWebAuthn }: MfaCredentialsListProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [totpCredentials, setTotpCredentials] = useState<TotpCredential[]>([]);
  const [webauthnCredentials, setWebauthnCredentials] = useState<WebAuthnCredential[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Confirm dialog state
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'totp' | 'webauthn'; id: string } | null>(null);

  const fetchCredentials = useCallback(async () => {
    try {
      const [statusRes, credentialsRes] = await Promise.all([
        api.mfa.getStatus(),
        api.mfa.getCredentials(),
      ]);

      if (statusRes.success && statusRes.data) {
        setStatus(statusRes.data);
      }
      if (credentialsRes.success && credentialsRes.data) {
        setTotpCredentials(credentialsRes.data.totp);
        setWebauthnCredentials(credentialsRes.data.webauthn);
      }
    } catch (err) {
      console.error('Failed to fetch MFA credentials:', err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleDeleteTotp = async (id: string) => {
    setDeleting(id);
    try {
      const response = await api.mfa.deleteTotp(id);
      if (response.success) {
        setTotpCredentials((prev) => prev.filter((c) => c.id !== id));
        fetchCredentials(); // Refresh status
      }
    } catch (err) {
      console.error('Failed to delete TOTP:', err);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const handleDeleteWebAuthn = async (id: string) => {
    setDeleting(id);
    try {
      const response = await api.mfa.deleteWebAuthn(id);
      if (response.success) {
        setWebauthnCredentials((prev) => prev.filter((c) => c.id !== id));
        fetchCredentials(); // Refresh status
      }
    } catch (err) {
      console.error('Failed to delete WebAuthn:', err);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'totp') {
      handleDeleteTotp(confirmDelete.id);
    } else {
      handleDeleteWebAuthn(confirmDelete.id);
    }
  };

  if (loading) {
    return (
      <div className="mfa-loading">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="mfa-credentials">
      {/* Status Banner */}
      <div className={`mfa-status-banner ${status?.enabled ? 'mfa-enabled' : 'mfa-disabled'}`}>
        <div className="mfa-status-icon">
          {status?.enabled ? (
            <svg viewBox="0 0 20 20" fill="none" className="icon-check">
              <path d="M6 10L9 13L14 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" className="icon-warning">
              <path d="M10 6V10M10 14H10.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <div className="mfa-status-text">
          <strong>{status?.enabled
            ? t('account.security.mfa.status.enabled', 'Two-factor authentication is enabled')
            : t('account.security.mfa.status.disabled', 'Two-factor authentication is not enabled')
          }</strong>
          <span>
            {status?.enabled
              ? t('account.security.mfa.status.enabledDescription', 'Your account is protected with additional security.')
              : t('account.security.mfa.status.disabledDescription', 'Add an authenticator or passkey to protect your account.')
            }
          </span>
        </div>
      </div>

      {/* Authenticator Apps Section */}
      <div className="mfa-section">
        <div className="mfa-section-header">
          <div>
            <h4>{t('account.security.mfa.totp.title', 'Authenticator Apps')}</h4>
            <p>{t('account.security.mfa.totp.description', 'Use an app like Google Authenticator or Authy to generate codes.')}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onSetupTotp}>
            {t('account.security.mfa.totp.add', 'Add authenticator')}
          </Button>
        </div>
        {totpCredentials.length > 0 ? (
          <div className="mfa-credential-list">
            {totpCredentials.map((cred) => (
              <div key={cred.id} className="mfa-credential-item">
                <div className="mfa-credential-info">
                  <span className="mfa-credential-name">{cred.name}</span>
                  <span className="mfa-credential-meta">
                    {t('account.security.mfa.addedOn', 'Added')} {new Date(cred.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete({ type: 'totp', id: cred.id })}
                  disabled={deleting === cred.id}
                >
                  {deleting === cred.id ? <Spinner size="sm" /> : t('common.remove', 'Remove')}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mfa-empty">{t('account.security.mfa.totp.none', 'No authenticator apps configured')}</p>
        )}
      </div>

      {/* Passkeys Section */}
      <div className="mfa-section">
        <div className="mfa-section-header">
          <div>
            <h4>{t('account.security.mfa.webauthn.title', 'Passkeys')}</h4>
            <p>{t('account.security.mfa.webauthn.description', 'Use Face ID, Touch ID, Windows Hello, or a security key.')}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onSetupWebAuthn}>
            {t('account.security.mfa.webauthn.add', 'Add passkey')}
          </Button>
        </div>
        {webauthnCredentials.length > 0 ? (
          <div className="mfa-credential-list">
            {webauthnCredentials.map((cred) => (
              <div key={cred.id} className="mfa-credential-item">
                <div className="mfa-credential-info">
                  <span className="mfa-credential-name">
                    {cred.name}
                    {cred.backedUp && (
                      <span className="mfa-badge mfa-badge-synced" title="Synced across devices">
                        {t('account.security.mfa.webauthn.synced', 'Synced')}
                      </span>
                    )}
                  </span>
                  <span className="mfa-credential-meta">
                    {t('account.security.mfa.addedOn', 'Added')} {new Date(cred.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete({ type: 'webauthn', id: cred.id })}
                  disabled={deleting === cred.id}
                >
                  {deleting === cred.id ? <Spinner size="sm" /> : t('common.remove', 'Remove')}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mfa-empty">{t('account.security.mfa.webauthn.none', 'No passkeys configured')}</p>
        )}
      </div>

      {/* Backup Codes Section */}
      {status?.enabled && (
        <div className="mfa-section mfa-section-backup">
          <div className="mfa-section-header">
            <div>
              <h4>{t('account.security.mfa.backupCodes.title', 'Backup Codes')}</h4>
              <p>
                {status.backupCodesRemaining > 0
                  ? t('account.security.mfa.backupCodes.remaining', '{{count}} backup codes remaining', { count: status.backupCodesRemaining })
                  : t('account.security.mfa.backupCodes.noneRemaining', 'No backup codes remaining')
                }
              </p>
            </div>
            <RegenerateBackupCodes api={api} onRegenerate={fetchCredentials} />
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={confirmDelete?.type === 'totp'
          ? t('account.security.mfa.totp.deleteTitle', 'Remove Authenticator')
          : t('account.security.mfa.webauthn.deleteTitle', 'Remove Passkey')
        }
        description={confirmDelete?.type === 'totp'
          ? t('account.security.mfa.totp.deleteConfirm', 'Are you sure you want to remove this authenticator?')
          : t('account.security.mfa.webauthn.deleteConfirm', 'Are you sure you want to remove this passkey?')
        }
        confirmLabel={t('common.remove', 'Remove')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={deleting !== null}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

// Helper component to regenerate backup codes
function RegenerateBackupCodes({ api, onRegenerate }: { api: ReturnType<typeof createApiClient>; onRegenerate: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      const response = await api.mfa.regenerateBackupCodes();
      if (response.success && response.data) {
        setCodes(response.data.codes);
        onRegenerate();
      }
    } catch (err) {
      console.error('Failed to regenerate backup codes:', err);
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  const handleCopy = () => {
    if (codes) {
      navigator.clipboard.writeText(codes.join('\n'));
    }
  };

  if (codes) {
    return (
      <div className="mfa-backup-codes-modal">
        <h4>{t('account.security.mfa.backupCodes.newCodes', 'New Backup Codes')}</h4>
        <p>{t('account.security.mfa.backupCodes.saveWarning', 'Save these codes in a safe place. They will not be shown again.')}</p>
        <div className="mfa-backup-codes">
          {codes.map((code, i) => (
            <code key={i} className="mfa-backup-code">{code}</code>
          ))}
        </div>
        <div className="mfa-setup-actions">
          <Button variant="secondary" onClick={handleCopy}>
            {t('common.copy', 'Copy codes')}
          </Button>
          <Button onClick={() => setCodes(null)}>
            {t('common.done', 'Done')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setShowConfirm(true)} disabled={loading}>
        {loading ? <Spinner size="sm" /> : t('account.security.mfa.backupCodes.regenerate', 'Regenerate codes')}
      </Button>
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t('account.security.mfa.backupCodes.regenerateTitle', 'Regenerate Backup Codes')}
        description={t('account.security.mfa.backupCodes.regenerateConfirm', 'This will invalidate your existing backup codes. Continue?')}
        confirmLabel={t('account.security.mfa.backupCodes.regenerate', 'Regenerate codes')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={loading}
        onConfirm={handleRegenerate}
      />
    </>
  );
}
