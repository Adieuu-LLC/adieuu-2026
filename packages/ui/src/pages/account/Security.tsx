import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tabs, TabList, TabTrigger, TabContent } from '../../components/Tabs';
import { Spinner } from '../../components/Spinner';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TotpSetup, WebAuthnSetup, MfaCredentialsList } from '../../components/MfaSetup';
import { createApiClient, type SessionDetails } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { ChangePassphrasePanel } from './ChangePassphrasePanel';
import { DataExportPanel } from './DataExportPanel';
import { DeleteAccountPanel } from './DeleteAccountPanel';
import {
  useCrashReportingPreference,
  setCrashReportingEnabled,
  setCrashReportingIncludeUser,
} from '../../hooks/useCrashReportingPreference';

const VALID_TABS = ['authentication', 'passphrase', 'sessions', 'data-export', 'delete-account'] as const;
type SecurityTab = typeof VALID_TABS[number];

/**
 * Parse user agent string to get a readable device/browser name
 */
function parseUserAgent(userAgent?: string): string {
  if (!userAgent) return 'Unknown device';

  // Check for common browsers
  if (userAgent.includes('Firefox')) {
    return userAgent.includes('Mobile') ? 'Firefox Mobile' : 'Firefox';
  }
  if (userAgent.includes('Edg/')) {
    return 'Microsoft Edge';
  }
  if (userAgent.includes('Chrome')) {
    if (userAgent.includes('Mobile')) return 'Chrome Mobile';
    return 'Chrome';
  }
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return userAgent.includes('Mobile') ? 'Safari Mobile' : 'Safari';
  }

  // Check for platform
  if (userAgent.includes('Windows')) return 'Windows Device';
  if (userAgent.includes('Mac')) return 'Mac Device';
  if (userAgent.includes('Linux')) return 'Linux Device';
  if (userAgent.includes('Android')) return 'Android Device';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS Device';

  return 'Unknown device';
}

/**
 * Format a date string relative to now
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Sessions list component
 */
function SessionsList() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [sessions, setSessions] = useState<SessionDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await api.auth.getSessions();
      if (response.success && response.data) {
        setSessions(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      const response = await api.auth.revokeSession(sessionId);
      if (response.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch (error) {
      console.error('Failed to revoke session:', error);
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    setRevokingAll(true);
    try {
      const response = await api.auth.revokeAllOtherSessions();
      if (response.success) {
        // Keep only the current session
        setSessions((prev) => prev.filter((s) => s.isCurrent));
      }
    } catch (error) {
      console.error('Failed to revoke all sessions:', error);
    } finally {
      setRevokingAll(false);
      setShowRevokeAllConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="sessions-loading">
        <Spinner size="md" />
      </div>
    );
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div>
      <div className="sessions-header">
        <div className="sessions-header-text">
          <h3>{t('account.security.sessions.title')}</h3>
          <p>{t('account.security.sessions.description')}</p>
        </div>
        {otherSessions.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowRevokeAllConfirm(true)}
            disabled={revokingAll}
          >
            {revokingAll ? <Spinner size="sm" /> : t('account.security.sessions.revokeAllOthers')}
          </Button>
        )}
      </div>

      <div className="session-list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${session.isCurrent ? 'session-item-current' : ''}`}
          >
            <div className="session-info">
              <div className="session-device">
                {parseUserAgent(session.userAgent)}
                {session.isCurrent && (
                  <span className="session-current-badge">
                    {t('account.security.sessions.currentSession')}
                  </span>
                )}
              </div>
              <div className="session-meta">
                <span>
                  {t('account.security.sessions.lastActive')}: {formatRelativeTime(session.lastActivityAt)}
                </span>
                {session.ipAddress && <span>IP: {session.ipAddress}</span>}
              </div>
            </div>
            {!session.isCurrent && (
              <div className="session-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  className="session-revoke-btn"
                  onClick={() => handleRevokeSession(session.id)}
                  disabled={revoking === session.id}
                >
                  {revoking === session.id ? (
                    <Spinner size="sm" />
                  ) : (
                    t('account.security.sessions.revokeSession')
                  )}
                </Button>
              </div>
            )}
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="sessions-empty">
            {t('account.security.sessions.noOtherSessions')}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showRevokeAllConfirm}
        onOpenChange={setShowRevokeAllConfirm}
        title={t('account.security.sessions.revokeAllTitle', 'Sign out of all other sessions')}
        description={t('account.security.sessions.revokeAllConfirm', 'Are you sure you want to sign out of all other sessions? You will remain signed in on this device.')}
        confirmLabel={t('account.security.sessions.revokeAllOthers', 'Sign out all others')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={revokingAll}
        onConfirm={handleRevokeAllOthers}
      />
    </div>
  );
}

/**
 * Authentication settings component with MFA setup
 */
function AuthenticationSettings() {
  const [setupMode, setSetupMode] = useState<'none' | 'totp' | 'webauthn'>('none');

  const handleSetupComplete = () => {
    setSetupMode('none');
  };

  if (setupMode === 'totp') {
    return (
      <Card variant="elevated">
        <TotpSetup onComplete={handleSetupComplete} onCancel={() => setSetupMode('none')} />
      </Card>
    );
  }

  if (setupMode === 'webauthn') {
    return (
      <Card variant="elevated">
        <WebAuthnSetup onComplete={handleSetupComplete} onCancel={() => setSetupMode('none')} />
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <MfaCredentialsList
        onSetupTotp={() => setSetupMode('totp')}
        onSetupWebAuthn={() => setSetupMode('webauthn')}
      />
    </Card>
  );
}

export function AccountSecurity() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const crashReporting = useCrashReportingPreference();

  // Validate tab parameter and default to authentication
  const activeTab: SecurityTab = VALID_TABS.includes(tab as SecurityTab)
    ? (tab as SecurityTab)
    : 'authentication';

  const handleTabChange = (newTab: string) => {
    navigate(`/account/security/${newTab}`, { replace: true });
  };

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('account.security.title')}</h1>
          <p className="page-subtitle">{t('account.security.subtitle')}</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="slide-up">
          <TabList>
            <TabTrigger value="authentication">
              {t('account.security.tabs.authentication')}
            </TabTrigger>
            <TabTrigger value="passphrase">
              {t('account.security.tabs.passphrase')}
            </TabTrigger>
            <TabTrigger value="sessions">
              {t('account.security.tabs.sessions')}
            </TabTrigger>
            <TabTrigger value="data-export">
              {t('account.security.tabs.dataExport')}
            </TabTrigger>
            <TabTrigger value="delete-account">
              {t('account.security.tabs.deleteAccount')}
            </TabTrigger>
          </TabList>

          <TabContent value="authentication">
            <AuthenticationSettings />
          </TabContent>

          <TabContent value="passphrase">
            <Card variant="elevated">
              <ChangePassphrasePanel api={api} />
            </Card>
          </TabContent>

          <TabContent value="sessions">
            <Card variant="elevated">
              <SessionsList />
            </Card>
          </TabContent>

          <TabContent value="data-export">
            <Card variant="elevated">
              <DataExportPanel />
            </Card>
          </TabContent>

          <TabContent value="delete-account">
            <Card variant="elevated">
              <DeleteAccountPanel />
            </Card>
          </TabContent>
        </Tabs>

        <Card variant="elevated" className="app-settings-card" style={{ marginTop: '1.5rem' }}>
          <h2 className="app-settings-section-title">
            {t('identity.privacy.errorReporting.title', 'Error Reporting')}
          </h2>
          <p className="app-settings-section-desc">
            {t(
              'identity.privacy.errorReporting.description',
              'Help improve Adieuu by automatically sending crash reports when something goes wrong. Reports are anonymous by default and contain no personally identifiable information.',
            )}
          </p>

          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={crashReporting.enabled}
              onChange={(e) => setCrashReportingEnabled(e.target.checked)}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">
                {t('identity.privacy.errorReporting.enabledLabel', 'Send anonymous crash reports')}
              </span>
              <span className="app-settings-toggle-hint">
                {t(
                  'identity.privacy.errorReporting.enabledHint',
                  'Automatically send technical crash data (error messages, stack traces) when an error occurs. No personal data is included.',
                )}
              </span>
            </span>
          </label>

          {crashReporting.enabled && (
            <label className="app-settings-toggle">
              <input
                type="checkbox"
                checked={crashReporting.includeUser}
                onChange={(e) => setCrashReportingIncludeUser(e.target.checked)}
              />
              <span className="app-settings-toggle-label">
                <span className="app-settings-toggle-title">
                  {t('identity.privacy.errorReporting.includeContactLabel', 'Include my contact info')}
                </span>
                <span className="app-settings-toggle-hint">
                  {t(
                    'identity.privacy.errorReporting.includeContactHint',
                    'Attach your email or phone number to crash reports so our team can reach out if needed.',
                  )}
                </span>
              </span>
            </label>
          )}
        </Card>
      </div>
    </div>
  );
}
