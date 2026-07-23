/**
 * Space Manage overview: stats, recent joins, and dangerous delete.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type ModerationSpaceMember,
  type PublicIdentity,
  type SpaceManageOverview as SpaceManageOverviewData,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useSpaces } from '../../hooks/useSpaces';
import { useToast } from '../../components/Toast';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Spinner';
import { useSpaceCipher } from './useSpaceCipher';
import { resolveSpaceDisplayName } from './spaceMetadataCipher';

const DELETE_CONFIRM_TOKEN = 'DELETE';

export function SpaceManageOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const toast = useToast();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const {
    activeSpace,
    resolveProfiles,
    participantProfiles,
    removeSpaceLocally,
    hasActiveSpacePermission,
  } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);
  const canBan = hasActiveSpacePermission('banMembers');

  const [overview, setOverview] = useState<SpaceManageOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [banned, setBanned] = useState<ModerationSpaceMember[]>([]);
  const [bannedLoading, setBannedLoading] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);

  const spaceName = activeSpace
    ? resolveSpaceDisplayName(activeSpace, spaceCipher, {
        encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
      })
    : '';

  const load = useCallback(async () => {
    if (!activeSpace) return;
    setLoading(true);
    setError(null);
    const res = await api.spaces.getManageOverview(activeSpace.id);
    if (res.success && res.data) {
      setOverview(res.data);
      resolveProfiles(res.data.recentJoins.map((j) => j.identityId));
    } else {
      setOverview(null);
      setError(t('spaces.manage.loadError'));
    }
    setLoading(false);
  }, [activeSpace, api, resolveProfiles, t]);

  const loadBanned = useCallback(async () => {
    if (!activeSpace || !canBan) {
      setBanned([]);
      return;
    }
    setBannedLoading(true);
    const res = await api.spaces.listBannedMembers(activeSpace.id, { limit: 50 });
    if (res.success && res.data) {
      setBanned(res.data.members);
      resolveProfiles(res.data.members.map((m) => m.identityId));
    } else {
      setBanned([]);
    }
    setBannedLoading(false);
  }, [activeSpace, api, canBan, resolveProfiles]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBanned();
  }, [loadBanned]);

  useEffect(() => {
    if (!deleteOpen) setDeleteConfirmText('');
  }, [deleteOpen]);

  const handleUnban = async (identityId: string) => {
    if (!activeSpace) return;
    setUnbanningId(identityId);
    const res = await api.spaces.unbanMember(activeSpace.id, identityId);
    if (res.success) {
      setBanned((prev) => prev.filter((m) => m.identityId !== identityId));
      toast.success(t('spaces.manage.banned.unbanSuccess'));
    } else {
      toast.error(res.error?.message ?? t('spaces.manage.banned.unbanError'));
    }
    setUnbanningId(null);
  };

  const handleDelete = async () => {
    if (!activeSpace || deleteConfirmText !== DELETE_CONFIRM_TOKEN) return;
    setDeleting(true);
    const spaceId = activeSpace.id;
    const res = await api.spaces.delete(spaceId);
    if (res.success) {
      removeSpaceLocally(spaceId);
      toast.success(t('spaces.manage.deleteSuccess', { name: spaceName }));
      setDeleteOpen(false);
      navigate('/spaces');
    } else {
      toast.error(res.error?.message ?? t('spaces.manage.deleteError'));
      setDeleting(false);
    }
  };

  const formatJoinedAt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const joinDisplayName = (identityId: string, profile?: PublicIdentity) =>
    profile?.displayName ?? profile?.username ?? identityId.slice(0, 8);

  return (
    <div className="page-content admin-page space-manage-page">
      <div className="page-header">
        <h1 className="page-title">{t('spaces.manage.title')}</h1>
        <p className="page-subtitle">
          {t('spaces.manage.subtitle', { name: spaceName })}
        </p>
      </div>

      {error && (
        <Card className="admin-card admin-card-error">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      {loading && !overview && !error && (
        <div className="admin-loading" role="status">
          <Spinner size="lg" />
        </div>
      )}

      {overview && (
        <>
          <div className="admin-stat-grid">
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('spaces.manage.stats.members')}</div>
              <div className="admin-stat-value">{overview.memberCount}</div>
            </Card>
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('spaces.manage.stats.channels')}</div>
              <div className="admin-stat-value">{overview.channelCount}</div>
            </Card>
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('spaces.manage.stats.visibility')}</div>
              <div className="admin-stat-value">
                {t(`spaces.visibility.${overview.visibility}`, overview.visibility)}
              </div>
            </Card>
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('spaces.manage.stats.created')}</div>
              <div className="admin-stat-value admin-stat-value--sm">
                {formatJoinedAt(overview.createdAt)}
              </div>
            </Card>
          </div>

          <Card className="admin-card space-manage-recent-joins">
            <h2 className="admin-section-title">{t('spaces.manage.recentJoins.title')}</h2>
            {overview.recentJoins.length === 0 ? (
              <p className="space-manage-empty">{t('spaces.manage.recentJoins.empty')}</p>
            ) : (
              <ul className="space-manage-join-list">
                {overview.recentJoins.map((join) => {
                  const profile = participantProfiles[join.identityId];
                  return (
                    <li key={`${join.identityId}-${join.joinedAt}`} className="space-manage-join-row">
                      <span className="space-manage-join-name">
                        {joinDisplayName(join.identityId, profile)}
                      </span>
                      <span className="space-manage-join-when">
                        {formatJoinedAt(join.joinedAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {canBan && (
            <Card className="admin-card space-manage-banned">
              <h2 className="admin-section-title">{t('spaces.manage.banned.title')}</h2>
              {bannedLoading ? (
                <Spinner size="sm" />
              ) : banned.length === 0 ? (
                <p className="space-manage-empty">{t('spaces.manage.banned.empty')}</p>
              ) : (
                <ul className="space-manage-join-list">
                  {banned.map((member) => {
                    const profile = participantProfiles[member.identityId];
                    return (
                      <li key={member.id} className="space-manage-join-row">
                        <div className="space-manage-banned-info">
                          <span className="space-manage-join-name">
                            {joinDisplayName(member.identityId, profile)}
                          </span>
                          {member.banReason && (
                            <span className="space-manage-banned-reason">{member.banReason}</span>
                          )}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={unbanningId === member.identityId}
                          onClick={() => void handleUnban(member.identityId)}
                        >
                          {unbanningId === member.identityId
                            ? t('common.loading')
                            : t('spaces.manage.banned.unban')}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          <Card className="admin-card space-manage-danger">
            <h2 className="admin-section-title">{t('spaces.manage.danger.title')}</h2>
            <p className="space-manage-danger-body">{t('spaces.manage.danger.body')}</p>
            <Button
              variant="primary"
              className="btn-danger"
              onClick={() => setDeleteOpen(true)}
            >
              {t('spaces.manage.danger.deleteCta')}
            </Button>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('spaces.manage.deleteConfirm.title')}
        description={t('spaces.manage.deleteConfirm.description', { name: spaceName })}
        confirmLabel={t('spaces.manage.deleteConfirm.confirm')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={deleting}
        confirmDisabled={deleteConfirmText !== DELETE_CONFIRM_TOKEN}
        onConfirm={() => void handleDelete()}
      >
        <label className="space-manage-delete-label">
          <span>{t('spaces.manage.deleteConfirm.typeLabel')}</span>
          <input
            className="input space-manage-delete-input"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={deleting}
            aria-label={t('spaces.manage.deleteConfirm.typeLabel')}
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
