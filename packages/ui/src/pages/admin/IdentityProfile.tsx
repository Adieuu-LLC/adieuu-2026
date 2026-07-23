import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  createApiClient,
  ACCOUNT_MODERATION_PRESETS,
  type AccountModerationCategory,
  type AdminIdentityProfile as AdminIdentityProfileType,
  type AdminIdentitySessionItem,
  type AdminIdentityReportsResult,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ModerationCategorySelect } from '../../components/ModerationCategorySelect';
import { useUntilCountdown } from '../../hooks/useUntilCountdown';
import { PlatformAccessManager } from './PlatformAccessManager';

export function AdminIdentityProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const { session } = useAuth();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const canManageRoles = session?.platformPermissions?.includes('manage-roles') ?? false;

  const [profile, setProfile] = useState<AdminIdentityProfileType | null>(null);
  const [sessions, setSessions] = useState<AdminIdentitySessionItem[]>([]);
  const [reports, setReports] = useState<AdminIdentityReportsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action modals
  const [suspendModal, setSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendCategory, setSuspendCategory] = useState<AccountModerationCategory | ''>('');
  const [suspendDuration, setSuspendDuration] = useState('');

  const [banModal, setBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banCategory, setBanCategory] = useState<AccountModerationCategory | ''>('');

  const [entitlementModal, setEntitlementModal] = useState(false);
  const [newEntitlement, setNewEntitlement] = useState('');
  const [entitlements, setEntitlements] = useState<string[]>([]);

  const [confirmUnsuspend, setConfirmUnsuspend] = useState(false);
  const [confirmUnban, setConfirmUnban] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const [profileRes, sessionsRes, reportsRes] = await Promise.all([
      api.admin.getIdentityProfile(id),
      api.admin.getIdentitySessions(id),
      api.admin.getIdentityReports(id, { limit: 25 }),
    ]);

    if (profileRes.success && profileRes.data) {
      setProfile(profileRes.data);
    } else {
      setError(t('admin.identities.profileError'));
    }
    if (sessionsRes.success && sessionsRes.data) {
      setSessions(sessionsRes.data.sessions);
    }
    if (reportsRes.success && reportsRes.data) {
      setReports(reportsRes.data);
    }
    setLoading(false);
  }, [api, id, t]);

  const loadEntitlements = useCallback(async () => {
    if (!id) return;
    const res = await api.admin.getIdentityEntitlements(id);
    if (res.success && res.data) {
      setEntitlements(res.data.overrides ?? []);
    }
  }, [api, id]);

  useEffect(() => {
    void loadProfile();
    void loadEntitlements();
  }, [loadProfile, loadEntitlements]);

  // --- Action handlers ---

  const handleAddEntitlement = async () => {
    if (!id || !newEntitlement.trim()) return;
    setActionLoading(true);
    await api.admin.addIdentityEntitlement(id, { entitlement: newEntitlement.trim() });
    setNewEntitlement('');
    void loadEntitlements();
    setActionLoading(false);
  };

  const handleRemoveEntitlement = async (entitlement: string) => {
    if (!id) return;
    setActionLoading(true);
    await api.admin.removeIdentityEntitlement(id, entitlement);
    void loadEntitlements();
    setActionLoading(false);
  };

  const applyModerationCategory = (
    categoryValue: AccountModerationCategory | '',
    setCategory: (value: AccountModerationCategory | '') => void,
    setReason: (value: string) => void,
  ) => {
    if (!categoryValue) {
      setCategory('');
      return;
    }
    setCategory(categoryValue);
    setReason(ACCOUNT_MODERATION_PRESETS[categoryValue]);
  };

  const resetSuspendModal = () => {
    setSuspendReason('');
    setSuspendCategory('');
    setSuspendDuration('');
  };

  const resetBanModal = () => {
    setBanReason('');
    setBanCategory('');
  };

  const handleSuspend = async () => {
    if (!id || !suspendReason.trim()) return;
    setActionLoading(true);
    const durationMs = suspendDuration ? parseInt(suspendDuration, 10) * 60 * 60 * 1000 : undefined;
    await api.admin.suspendIdentity(id, {
      reason: suspendReason.trim(),
      durationMs,
      category: suspendCategory || undefined,
    });
    setSuspendModal(false);
    resetSuspendModal();
    void loadProfile();
    setActionLoading(false);
  };

  const handleUnsuspend = async () => {
    if (!id) return;
    setActionLoading(true);
    await api.admin.unsuspendIdentity(id);
    setConfirmUnsuspend(false);
    void loadProfile();
    setActionLoading(false);
  };

  const handleBan = async () => {
    if (!id || !banReason.trim()) return;
    setActionLoading(true);
    await api.admin.banIdentity(id, {
      reason: banReason.trim(),
      category: banCategory || undefined,
    });
    setBanModal(false);
    resetBanModal();
    void loadProfile();
    setActionLoading(false);
  };

  const handleUnban = async () => {
    if (!id) return;
    setActionLoading(true);
    await api.admin.unbanIdentity(id);
    setConfirmUnban(false);
    void loadProfile();
    setActionLoading(false);
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="admin-page">
        <Spinner />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="admin-page">
        <div className="admin-alert admin-alert--error">{error || t('admin.identities.profileError')}</div>
        <Button variant="secondary" onClick={() => navigate('/admin/identities')}>
          {t('admin.identities.backToSearch')}
        </Button>
      </div>
    );
  }

  const isSuspended = profile.moderation?.status === 'suspended';
  const isBanned = profile.moderation?.status === 'banned';

  return (
    <div className="admin-page admin-user-profile">
      <div className="admin-page-header">
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/identities')}>
          {t('admin.identities.backToSearch')}
        </Button>
        <h2 className="admin-page-title">{profile.displayName} (@{profile.username})</h2>
        <StatusBadge status={profile.moderation?.status ?? 'active'} />
      </div>

      {/* Action bar */}
      <div className="admin-action-bar">
        <Button size="sm" variant="secondary" onClick={() => setEntitlementModal(true)}>
          {t('admin.identities.actions.manageEntitlements')}
        </Button>
        {!isSuspended && !isBanned && (
          <Button size="sm" className="btn-warning" onClick={() => { resetSuspendModal(); setSuspendModal(true); }}>
            {t('admin.identities.actions.suspend')}
          </Button>
        )}
        {isSuspended && (
          <Button size="sm" variant="secondary" onClick={() => setConfirmUnsuspend(true)}>
            {t('admin.identities.actions.unsuspend')}
          </Button>
        )}
        {!isBanned && (
          <Button size="sm" className="btn-danger" onClick={() => { resetBanModal(); setBanModal(true); }}>
            {t('admin.identities.actions.ban')}
          </Button>
        )}
        {isBanned && (
          <Button size="sm" variant="secondary" onClick={() => setConfirmUnban(true)}>
            {t('admin.identities.actions.unban')}
          </Button>
        )}
      </div>

      {/* Moderation info banner */}
      {(isSuspended || isBanned) && (
        <div className={`admin-alert ${isBanned ? 'admin-alert--error' : 'admin-alert--warning'}`}>
          <strong>{isBanned ? t('admin.identities.bannedBanner') : t('admin.identities.suspendedBanner')}</strong>
          {profile.moderation?.category && (
            <p>{t('admin.identities.moderationCategory')}: {t(`admin.identities.modals.categories.${profile.moderation.category}`, profile.moderation.category)}</p>
          )}
          {profile.moderation?.reason && <p>{profile.moderation.reason}</p>}
          {profile.moderation?.suspendedUntil && (
            <p>
              {t('admin.identities.timeRemaining')}:{' '}
              <SuspensionCountdown isoTarget={profile.moderation.suspendedUntil} onExpired={loadProfile} />
            </p>
          )}
        </div>
      )}

      {/* Basic Info */}
      <Card className="admin-card">
        <h3>{t('admin.identities.sections.basicInfo')}</h3>
        <dl className="admin-dl">
          <dt>{t('admin.identities.fields.id')}</dt>
          <dd className="admin-table-mono">{profile.id}</dd>
          <dt>{t('admin.identities.fields.username')}</dt>
          <dd>{profile.username}</dd>
          <dt>{t('admin.identities.fields.displayName')}</dt>
          <dd>{profile.displayName}</dd>
          <dt>{t('admin.identities.fields.bio')}</dt>
          <dd>{profile.bio || '\u2014'}</dd>
          <dt>{t('admin.identities.fields.createdAt')}</dt>
          <dd>{new Date(profile.createdAt).toLocaleString()}</dd>
          <dt>{t('admin.identities.fields.lastActive')}</dt>
          <dd>{new Date(profile.lastActiveAt).toLocaleString()}</dd>
        </dl>
      </Card>

      {/* Platform Access (Roles + Attributes) */}
      <Card className="admin-card">
        <h3>{t('admin.identities.sections.platformAccess')}</h3>
        <PlatformAccessManager
          identityId={profile.id}
          platformRoles={profile.platformRoles ?? []}
          platformAttributes={profile.platformAttributes ?? []}
          canManageRoles={canManageRoles}
          onRefresh={loadProfile}
        />
      </Card>

      {/* Activity Stats */}
      <Card className="admin-card">
        <h3>{t('admin.identities.sections.stats')}</h3>
        <dl className="admin-dl">
          <dt>{t('admin.identities.fields.messagesSent')}</dt>
          <dd>{(profile.stats?.messagesSent ?? 0).toLocaleString()}</dd>
          <dt>{t('admin.identities.fields.conversationsJoined')}</dt>
          <dd>{(profile.stats?.conversationsJoined ?? 0).toLocaleString()}</dd>
          <dt>{t('admin.identities.fields.friends')}</dt>
          <dd>{(profile.stats?.friends ?? 0).toLocaleString()}</dd>
          <dt>{t('admin.identities.fields.achievementsEarned')}</dt>
          <dd>{(profile.stats?.achievementsEarned ?? 0).toLocaleString()}</dd>
        </dl>
      </Card>

      {/* Entitlements */}
      <Card className="admin-card">
        <h3>{t('admin.identities.sections.entitlements')}</h3>
        <dl className="admin-dl">
          <dt>{t('admin.identities.fields.overrides')}</dt>
          <dd>{entitlements.length > 0 ? entitlements.join(', ') : '\u2014'}</dd>
        </dl>
      </Card>

      {/* Active Sessions */}
      <Card className="admin-card">
        <h3>{t('admin.identities.sections.sessions')}</h3>
        {sessions.length === 0 ? (
          <p className="admin-empty-inline">{t('admin.identities.noSessions')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.identities.fields.device')}</th>
                  <th>{t('admin.identities.fields.lastActivity')}</th>
                  <th>{t('admin.identities.fields.created')}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.userAgent ? parseUA(s.userAgent) : '\u2014'}</td>
                    <td>{new Date(s.lastActivityAt).toLocaleString()}</td>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Reports */}
      <Card className="admin-card">
        <h3>{t('admin.identities.sections.reports')}</h3>
        <ReportsSection reports={reports} />
      </Card>

      {/* --- Modals --- */}

      {/* Entitlements Modal */}
      <ConfirmDialog
        open={entitlementModal}
        onOpenChange={(open) => { if (!open) setEntitlementModal(false); }}
        title={t('admin.identities.modals.entitlementsTitle')}
        confirmLabel={t('common.close')}
        onConfirm={() => setEntitlementModal(false)}
        onCancel={() => setEntitlementModal(false)}
      >
        <div className="admin-entitlements-list">
          {entitlements.length > 0 ? (
            <ul className="admin-list">
              {entitlements.map((ent) => (
                <li key={ent} className="admin-entitlement-item">
                  <span>{ent}</span>
                  <Button size="sm" className="btn-danger" onClick={() => handleRemoveEntitlement(ent)}>
                    {t('common.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-empty-inline">{t('admin.identities.noOverrides')}</p>
          )}
        </div>
        <div className="admin-form-group admin-form-row">
          <input
            type="text"
            placeholder={t('admin.identities.modals.entitlementPlaceholder')}
            value={newEntitlement}
            onChange={(e) => setNewEntitlement(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddEntitlement(); }}
          />
          <Button size="sm" onClick={handleAddEntitlement} disabled={actionLoading || !newEntitlement.trim()}>
            {t('common.add')}
          </Button>
        </div>
      </ConfirmDialog>

      {/* Suspend Modal */}
      <ConfirmDialog
        open={suspendModal}
        onOpenChange={(open) => { if (!open) { setSuspendModal(false); resetSuspendModal(); } }}
        title={t('admin.identities.modals.suspendTitle')}
        confirmLabel={t('admin.identities.modals.suspendConfirm')}
        onConfirm={handleSuspend}
        onCancel={() => { setSuspendModal(false); resetSuspendModal(); }}
        loading={actionLoading}
        variant="warning"
      >
        <div className="admin-form-group">
          <span className="admin-field-label">{t('admin.identities.modals.categoryPreset')}</span>
          <ModerationCategorySelect
            value={suspendCategory}
            onChange={(category) => applyModerationCategory(category, setSuspendCategory, setSuspendReason)}
            disabled={actionLoading}
          />
          <small>{t('admin.identities.modals.categoryHint')}</small>
        </div>
        <div className="admin-form-group">
          <label htmlFor="identity-suspend-reason">{t('admin.identities.modals.reason')}</label>
          <textarea
            id="identity-suspend-reason"
            className="admin-textarea"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={3}
          />
        </div>
        <div className="admin-form-group">
          <label htmlFor="identity-suspend-duration">{t('admin.identities.modals.durationHours')}</label>
          <input
            id="identity-suspend-duration"
            type="number"
            min="1"
            placeholder={t('admin.identities.modals.indefinite')}
            value={suspendDuration}
            onChange={(e) => setSuspendDuration(e.target.value)}
          />
          <small>{t('admin.identities.modals.durationHint')}</small>
        </div>
      </ConfirmDialog>

      {/* Unsuspend Confirmation */}
      <ConfirmDialog
        open={confirmUnsuspend}
        onOpenChange={(open) => { if (!open) setConfirmUnsuspend(false); }}
        title={t('admin.identities.modals.unsuspendTitle')}
        confirmLabel={t('admin.identities.modals.unsuspendConfirm')}
        onConfirm={handleUnsuspend}
        onCancel={() => setConfirmUnsuspend(false)}
        loading={actionLoading}
      >
        <p>{t('admin.identities.modals.unsuspendDesc')}</p>
      </ConfirmDialog>

      {/* Ban Modal */}
      <ConfirmDialog
        open={banModal}
        onOpenChange={(open) => { if (!open) { setBanModal(false); resetBanModal(); } }}
        title={t('admin.identities.modals.banTitle')}
        confirmLabel={t('admin.identities.modals.banConfirm')}
        onConfirm={handleBan}
        onCancel={() => { setBanModal(false); resetBanModal(); }}
        loading={actionLoading}
        variant="danger"
      >
        <p className="admin-alert admin-alert--error">{t('admin.identities.modals.banWarning')}</p>
        <div className="admin-form-group">
          <span className="admin-field-label">{t('admin.identities.modals.categoryPreset')}</span>
          <ModerationCategorySelect
            value={banCategory}
            onChange={(category) => applyModerationCategory(category, setBanCategory, setBanReason)}
            disabled={actionLoading}
          />
          <small>{t('admin.identities.modals.categoryHint')}</small>
        </div>
        <div className="admin-form-group">
          <label htmlFor="identity-ban-reason">{t('admin.identities.modals.reason')}</label>
          <textarea
            id="identity-ban-reason"
            className="admin-textarea"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            rows={3}
          />
        </div>
      </ConfirmDialog>

      {/* Unban Confirmation */}
      <ConfirmDialog
        open={confirmUnban}
        onOpenChange={(open) => { if (!open) setConfirmUnban(false); }}
        title={t('admin.identities.modals.unbanTitle')}
        confirmLabel={t('admin.identities.modals.unbanConfirm')}
        onConfirm={handleUnban}
        onCancel={() => setConfirmUnban(false)}
        loading={actionLoading}
      >
        <p>{t('admin.identities.modals.unbanDesc')}</p>
      </ConfirmDialog>
    </div>
  );
}

// --- Helpers ---

function SuspensionCountdown({
  isoTarget,
  onExpired,
}: {
  isoTarget: string;
  onExpired: () => void;
}) {
  const { label, isExpired } = useUntilCountdown(isoTarget);

  useEffect(() => {
    if (isExpired) onExpired();
  }, [isExpired, onExpired]);

  if (isExpired) return null;

  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</span>;
}

function StatusBadge({ status }: { status: 'active' | 'suspended' | 'banned' }) {
  const { t } = useTranslation();
  const cls =
    status === 'banned'
      ? 'admin-badge admin-badge--danger'
      : status === 'suspended'
        ? 'admin-badge admin-badge--warning'
        : 'admin-badge admin-badge--success';
  return <span className={cls}>{t(`admin.identities.status.${status}`)}</span>;
}

function ReportsSection({ reports }: { reports: AdminIdentityReportsResult | null }) {
  const { t } = useTranslation();

  if (!reports) return <p className="admin-empty-inline">{t('admin.identities.reports.noReports')}</p>;

  return (
    <>
      <h4>{t('admin.identities.reports.against')} ({reports.against.total})</h4>
      {reports.against.reports.length === 0 ? (
        <p className="admin-empty-inline">{t('admin.identities.reports.noReports')}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.identities.reports.type')}</th>
                <th>{t('admin.identities.reports.category')}</th>
                <th>{t('admin.identities.reports.status')}</th>
                <th>{t('admin.identities.reports.date')}</th>
              </tr>
            </thead>
            <tbody>
              {reports.against.reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.reportType}</td>
                  <td>{r.category}</td>
                  <td>{r.status}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4>{t('admin.identities.reports.by')} ({reports.by.total})</h4>
      {reports.by.reports.length === 0 ? (
        <p className="admin-empty-inline">{t('admin.identities.reports.noReports')}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.identities.reports.type')}</th>
                <th>{t('admin.identities.reports.category')}</th>
                <th>{t('admin.identities.reports.status')}</th>
                <th>{t('admin.identities.reports.date')}</th>
              </tr>
            </thead>
            <tbody>
              {reports.by.reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.reportType}</td>
                  <td>{r.category}</td>
                  <td>{r.status}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function parseUA(ua: string): string {
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return ua.slice(0, 30);
}
