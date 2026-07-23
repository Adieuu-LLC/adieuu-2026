/**
 * Space Manage audit log: moderation / role / ACL history.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type PublicIdentity,
  type PublicSpaceAuditEntry,
  type SpaceAuditAction,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useSpaces } from '../../hooks/useSpaces';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';

const ACTION_I18N: Record<SpaceAuditAction, string> = {
  member_kick: 'spaces.manage.audit.actions.member_kick',
  member_ban: 'spaces.manage.audit.actions.member_ban',
  member_unban: 'spaces.manage.audit.actions.member_unban',
  member_roles_update: 'spaces.manage.audit.actions.member_roles_update',
  role_create: 'spaces.manage.audit.actions.role_create',
  role_update: 'spaces.manage.audit.actions.role_update',
  role_delete: 'spaces.manage.audit.actions.role_delete',
  channel_acl_update: 'spaces.manage.audit.actions.channel_acl_update',
  message_mod_delete: 'spaces.manage.audit.actions.message_mod_delete',
};

export function SpaceManageAuditLog() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const { activeSpace, resolveProfiles, participantProfiles } = useSpaces();

  const [entries, setEntries] = useState<PublicSpaceAuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = useCallback(
    (identityId: string, profile?: PublicIdentity) =>
      profile?.displayName ?? profile?.username ?? identityId.slice(0, 8),
    [],
  );

  const load = useCallback(
    async (nextCursor?: string | null) => {
      if (!activeSpace) return;
      const appending = !!nextCursor;
      if (appending) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      const res = await api.spaces.getAuditLog(activeSpace.id, {
        limit: 50,
        ...(nextCursor ? { cursor: nextCursor } : {}),
      });
      if (res.success && res.data) {
        setEntries((prev) => (appending ? [...prev, ...res.data!.entries] : res.data!.entries));
        setCursor(res.data.cursor);
        const ids = res.data.entries.flatMap((e) =>
          [e.actorIdentityId, e.targetIdentityId].filter((id): id is string => !!id),
        );
        resolveProfiles(ids);
      } else if (!appending) {
        setEntries([]);
        setError(t('spaces.manage.audit.loadError'));
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [activeSpace, api, resolveProfiles, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const formatWhen = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="page-content admin-page space-manage-page">
      <div className="page-header">
        <h1 className="page-title">{t('spaces.manage.audit.title')}</h1>
        <p className="page-subtitle">{t('spaces.manage.audit.subtitle')}</p>
      </div>

      {error && (
        <Card className="admin-card admin-card-error">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      {loading && !error && (
        <div className="admin-loading" role="status">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && !error && (
        <Card className="admin-card">
          {entries.length === 0 ? (
            <p className="space-manage-empty">{t('spaces.manage.audit.empty')}</p>
          ) : (
            <ul className="space-manage-audit-list">
              {entries.map((entry) => (
                <li key={entry.id} className="space-manage-audit-row">
                  <div className="space-manage-audit-main">
                    <span className="space-manage-audit-action">
                      {t(ACTION_I18N[entry.action], entry.action)}
                    </span>
                    <span className="space-manage-audit-actor">
                      {t('spaces.manage.audit.by', {
                        name: displayName(
                          entry.actorIdentityId,
                          participantProfiles[entry.actorIdentityId],
                        ),
                      })}
                    </span>
                    {entry.targetIdentityId && (
                      <span className="space-manage-audit-target">
                        {t('spaces.manage.audit.target', {
                          name: displayName(
                            entry.targetIdentityId,
                            participantProfiles[entry.targetIdentityId],
                          ),
                        })}
                      </span>
                    )}
                  </div>
                  <time className="space-manage-audit-when" dateTime={entry.createdAt}>
                    {formatWhen(entry.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
          {cursor && (
            <div className="space-manage-audit-more">
              <Button
                variant="secondary"
                size="sm"
                disabled={loadingMore}
                onClick={() => void load(cursor)}
              >
                {loadingMore ? t('common.loading') : t('spaces.manage.audit.loadMore')}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
