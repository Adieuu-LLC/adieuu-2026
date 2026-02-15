import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tabs, TabList, TabTrigger, TabContent } from '../../components/Tabs';
import { Spinner } from '../../components/Spinner';
import { createApiClient, type SessionDetails } from '@chadder/shared';
import { useAppConfig } from '../../config';

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
    if (!window.confirm(t('account.security.sessions.revokeAllConfirm'))) {
      return;
    }

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
            onClick={handleRevokeAllOthers}
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
    </div>
  );
}

/**
 * Authentication settings component (placeholder for now)
 */
function AuthenticationSettings() {
  const { t } = useTranslation();

  return (
    <Card variant="elevated">
      <h3 style={{ margin: '0 0 var(--spacing-md) 0', color: 'var(--color-text-primary)' }}>
        {t('account.security.authentication.title')}
      </h3>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
        {t('account.security.authentication.comingSoon')}
      </p>
    </Card>
  );
}

export function AccountSecurity() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('account.security.title')}</h1>
          <p className="page-subtitle">{t('account.security.subtitle')}</p>
        </div>

        <Tabs defaultTab="sessions" className="slide-up">
          <TabList>
            <TabTrigger value="authentication">
              {t('account.security.tabs.authentication')}
            </TabTrigger>
            <TabTrigger value="sessions">
              {t('account.security.tabs.sessions')}
            </TabTrigger>
          </TabList>

          <TabContent value="authentication">
            <AuthenticationSettings />
          </TabContent>

          <TabContent value="sessions">
            <Card variant="elevated">
              <SessionsList />
            </Card>
          </TabContent>
        </Tabs>
      </div>
    </div>
  );
}
