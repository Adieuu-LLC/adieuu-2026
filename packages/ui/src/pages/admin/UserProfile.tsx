import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  createApiClient,
  ACCOUNT_MODERATION_PRESETS,
  type AccountModerationCategory,
  type AdminUserProfile as AdminUserProfileType,
  type AdminUserSessionItem,
  type AdminAuditEntry,
  type AdminSubscriptionOverrideItem,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ModerationCategorySelect } from '../../components/ModerationCategorySelect';
import { SubscriptionOverridesModal } from './SubscriptionOverridesModal';

export function AdminUserProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [profile, setProfile] = useState<AdminUserProfileType | null>(null);
  const [sessions, setSessions] = useState<AdminUserSessionItem[]>([]);
  const [auditLog, setAuditLog] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action modals
  const [subscriptionModal, setSubscriptionModal] = useState(false);
  const [subscriptionOverrides, setSubscriptionOverrides] = useState<{
    effective: string[];
    overrides: AdminSubscriptionOverrideItem[];
  }>({ effective: [], overrides: [] });

  const [suspendModal, setSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendCategory, setSuspendCategory] = useState<AccountModerationCategory | ''>('');
  const [suspendDuration, setSuspendDuration] = useState('');

  const [banModal, setBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banCategory, setBanCategory] = useState<AccountModerationCategory | ''>('');

  const [entitlementModal, setEntitlementModal] = useState(false);
  const [newEntitlement, setNewEntitlement] = useState('');
  const [entitlements, setEntitlements] = useState<{ effective: string[]; overrides: string[] }>({
    effective: [],
    overrides: [],
  });

  const [confirmApproveAge, setConfirmApproveAge] = useState(false);
  const [confirmUnsuspend, setConfirmUnsuspend] = useState(false);
  const [confirmUnban, setConfirmUnban] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const [profileRes, sessionsRes, auditRes] = await Promise.all([
      api.admin.getUserProfile(id),
      api.admin.getUserSessions(id),
      api.admin.getUserAuditLog(id, { limit: 50 }),
    ]);

    if (profileRes.success && profileRes.data) {
      setProfile(profileRes.data);
    } else {
      setError(t('admin.users.profileError'));
    }
    if (sessionsRes.success && sessionsRes.data) {
      setSessions(sessionsRes.data.sessions);
    }
    if (auditRes.success && auditRes.data) {
      setAuditLog(auditRes.data.entries);
    }
    setLoading(false);
  }, [api, id, t]);

  const loadEntitlements = useCallback(async () => {
    if (!id) return;
    const res = await api.admin.getEntitlements(id);
    if (res.success && res.data) {
      setEntitlements({
        effective: res.data.effective ?? [],
        overrides: res.data.overrides ?? [],
      });
    }
  }, [api, id]);

  const loadSubscriptionOverrides = useCallback(async () => {
    if (!id) return;
    const res = await api.admin.getSubscriptionOverrides(id);
    if (res.success && res.data) {
      setSubscriptionOverrides({
        effective: res.data.effective ?? [],
        overrides: res.data.overrides ?? [],
      });
    }
  }, [api, id]);

  useEffect(() => {
    void loadProfile();
    void loadEntitlements();
    void loadSubscriptionOverrides();
  }, [loadProfile, loadEntitlements, loadSubscriptionOverrides]);

  // --- Action handlers ---

  const handleAddSubscriptionOverride = async (input: Parameters<typeof api.admin.addSubscriptionOverride>[1]) => {
    if (!id) return false;
    setActionLoading(true);
    const res = await api.admin.addSubscriptionOverride(id, input);
    if (res.success) {
      void loadSubscriptionOverrides();
      void loadProfile();
    }
    setActionLoading(false);
    return res.success;
  };

  const handleUpdateSubscriptionOverride = async (
    index: number,
    input: Parameters<typeof api.admin.updateSubscriptionOverride>[2],
  ) => {
    if (!id) return false;
    setActionLoading(true);
    const res = await api.admin.updateSubscriptionOverride(id, index, input);
    if (res.success) {
      void loadSubscriptionOverrides();
      void loadProfile();
    }
    setActionLoading(false);
    return res.success;
  };

  const handleRemoveSubscriptionOverride = async (index: number) => {
    if (!id) return false;
    setActionLoading(true);
    const res = await api.admin.removeSubscriptionOverride(id, index);
    if (res.success) {
      void loadSubscriptionOverrides();
      void loadProfile();
    }
    setActionLoading(false);
    return res.success;
  };

  const handleApproveAge = async () => {
    if (!id) return;
    setActionLoading(true);
    await api.admin.approveAge(id);
    setConfirmApproveAge(false);
    void loadProfile();
    setActionLoading(false);
  };

  const handleAddEntitlement = async () => {
    if (!id || !newEntitlement.trim()) return;
    setActionLoading(true);
    await api.admin.addEntitlement(id, { entitlement: newEntitlement.trim() });
    setNewEntitlement('');
    void loadEntitlements();
    setActionLoading(false);
  };

  const handleRemoveEntitlement = async (entitlement: string) => {
    if (!id) return;
    setActionLoading(true);
    await api.admin.removeEntitlement(id, entitlement);
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
    await api.admin.suspendUser(id, {
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
    await api.admin.unsuspendUser(id);
    setConfirmUnsuspend(false);
    void loadProfile();
    setActionLoading(false);
  };

  const handleBan = async () => {
    if (!id || !banReason.trim()) return;
    setActionLoading(true);
    await api.admin.banUser(id, {
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
    await api.admin.unbanUser(id);
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
        <div className="admin-alert admin-alert--error">{error || t('admin.users.profileError')}</div>
        <Button variant="secondary" onClick={() => navigate('/admin/users')}>
          {t('admin.users.backToSearch')}
        </Button>
      </div>
    );
  }

  const isSuspended = profile.moderation?.status === 'suspended';
  const isBanned = profile.moderation?.status === 'banned';

  return (
    <div className="admin-page admin-user-profile">
      <div className="admin-page-header">
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/users')}>
          {t('admin.users.backToSearch')}
        </Button>
        <h2 className="admin-page-title">{profile.displayName || profile.email || profile.phone}</h2>
        <StatusBadge status={profile.moderation?.status ?? 'active'} />
      </div>

      {/* Action bar */}
      <div className="admin-action-bar">
        <Button size="sm" onClick={() => setSubscriptionModal(true)}>
          {t('admin.users.actions.manageSubscriptions')}
        </Button>
        {profile.ageVerification?.status !== 'verified' && (
          <Button size="sm" variant="secondary" onClick={() => setConfirmApproveAge(true)}>
            {t('admin.users.actions.approveAge')}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setEntitlementModal(true)}>
          {t('admin.users.actions.manageEntitlements')}
        </Button>
        {!isSuspended && !isBanned && (
          <Button size="sm" className="btn-warning" onClick={() => { resetSuspendModal(); setSuspendModal(true); }}>
            {t('admin.users.actions.suspend')}
          </Button>
        )}
        {isSuspended && (
          <Button size="sm" variant="secondary" onClick={() => setConfirmUnsuspend(true)}>
            {t('admin.users.actions.unsuspend')}
          </Button>
        )}
        {!isBanned && (
          <Button size="sm" className="btn-danger" onClick={() => { resetBanModal(); setBanModal(true); }}>
            {t('admin.users.actions.ban')}
          </Button>
        )}
        {isBanned && (
          <Button size="sm" variant="secondary" onClick={() => setConfirmUnban(true)}>
            {t('admin.users.actions.unban')}
          </Button>
        )}
      </div>

      {/* Moderation info banner */}
      {(isSuspended || isBanned) && (
        <div className={`admin-alert ${isBanned ? 'admin-alert--error' : 'admin-alert--warning'}`}>
          <strong>{isBanned ? t('admin.users.bannedBanner') : t('admin.users.suspendedBanner')}</strong>
          {profile.moderation?.category && (
            <p>{t('admin.users.moderationCategory')}: {t(`admin.users.modals.categories.${profile.moderation.category}`, profile.moderation.category)}</p>
          )}
          {profile.moderation?.reason && <p>{profile.moderation.reason}</p>}
          {profile.moderation?.suspendedUntil && (
            <p>{t('admin.users.suspendedUntil')}: {new Date(profile.moderation.suspendedUntil).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Basic Info */}
      <Card className="admin-card">
        <h3>{t('admin.users.sections.basicInfo')}</h3>
        <dl className="admin-dl">
          <dt>{t('admin.users.fields.id')}</dt>
          <dd className="admin-table-mono">{profile.id}</dd>
          <dt>{t('admin.users.fields.email')}</dt>
          <dd>{profile.email || '—'} {profile.emailVerified && <span className="admin-badge admin-badge--success">{t('admin.users.verified')}</span>}</dd>
          <dt>{t('admin.users.fields.phone')}</dt>
          <dd>{profile.phone || '—'} {profile.phoneVerified && <span className="admin-badge admin-badge--success">{t('admin.users.verified')}</span>}</dd>
          <dt>{t('admin.users.fields.displayName')}</dt>
          <dd>{profile.displayName || '—'}</dd>
          <dt>{t('admin.users.fields.createdAt')}</dt>
          <dd>{new Date(profile.createdAt).toLocaleString()}</dd>
          <dt>{t('admin.users.fields.lastLogin')}</dt>
          <dd>{profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : '—'}</dd>
        </dl>
      </Card>

      {/* Jurisdiction */}
      {profile.geo && (
        <Card className="admin-card">
          <h3>{t('admin.users.sections.jurisdiction')}</h3>
          <dl className="admin-dl">
            <dt>{t('admin.users.fields.jurisdiction')}</dt>
            <dd>{profile.geo.jurisdiction}</dd>
            <dt>{t('admin.users.fields.country')}</dt>
            <dd>{profile.geo.countryCode}</dd>
            {profile.geo.regionCode && (
              <>
                <dt>{t('admin.users.fields.region')}</dt>
                <dd>{profile.geo.regionCode}</dd>
              </>
            )}
            <dt>{t('admin.users.fields.checkedAt')}</dt>
            <dd>{new Date(profile.geo.checkedAt).toLocaleString()}</dd>
          </dl>
        </Card>
      )}

      {/* Age Verification */}
      <Card className="admin-card">
        <h3>{t('admin.users.sections.ageVerification')}</h3>
        <dl className="admin-dl">
          <dt>{t('admin.users.fields.avStatus')}</dt>
          <dd><AvStatusBadge status={profile.ageVerification?.status} /></dd>
          {profile.ageVerification?.verifiedAt && (
            <>
              <dt>{t('admin.users.fields.verifiedAt')}</dt>
              <dd>{new Date(profile.ageVerification.verifiedAt).toLocaleString()}</dd>
            </>
          )}
          {profile.ageVerification?.failedAt && (
            <>
              <dt>{t('admin.users.fields.failedAt')}</dt>
              <dd>{new Date(profile.ageVerification.failedAt).toLocaleString()}</dd>
            </>
          )}
          {profile.ageVerification && (
            <>
              <dt>{t('admin.users.fields.expirationCount')}</dt>
              <dd>{profile.ageVerification.expirationCount}</dd>
              <dt>{t('admin.users.fields.optedIn')}</dt>
              <dd>{profile.ageVerification.optedIn ? t('common.yes') : t('common.no')}</dd>
            </>
          )}
        </dl>
      </Card>

      {/* Billing / Subscription */}
      <Card className="admin-card">
        <h3>{t('admin.users.sections.billing')}</h3>
        <dl className="admin-dl">
          <dt>{t('admin.users.fields.subscriptions')}</dt>
          <dd>{(subscriptionOverrides.effective?.length ?? 0) > 0 ? subscriptionOverrides.effective.join(', ') : '—'}</dd>
          <dt>{t('admin.users.fields.billingStatus')}</dt>
          <dd>{profile.billing?.status || '—'}</dd>
          <dt>{t('admin.users.fields.isLifetime')}</dt>
          <dd>{profile.billing?.isLifetime ? t('common.yes') : t('common.no')}</dd>
          {profile.billing?.currentPeriodEnd && (
            <>
              <dt>{t('admin.users.fields.periodEnd')}</dt>
              <dd>{new Date(profile.billing.currentPeriodEnd).toLocaleString()}</dd>
            </>
          )}
          <dt>{t('admin.users.fields.entitlements')}</dt>
          <dd>{(entitlements.effective?.length ?? 0) > 0 ? entitlements.effective.join(', ') : '—'}</dd>
          <dt>{t('admin.users.fields.overrides')}</dt>
          <dd>{(entitlements.overrides?.length ?? 0) > 0 ? entitlements.overrides.join(', ') : '—'}</dd>
        </dl>
        {(subscriptionOverrides.overrides?.length ?? 0) > 0 && (
          <>
            <h4>{t('admin.users.fields.subscriptionOverrides')}</h4>
            <ul className="admin-list">
              {subscriptionOverrides.overrides.map((o, i) => (
                <li key={i}>
                  {o.tier} {o.expiresAt ? `(expires ${new Date(o.expiresAt).toLocaleDateString()})` : '(lifetime)'}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Active Sessions */}
      <Card className="admin-card">
        <h3>{t('admin.users.sections.sessions')}</h3>
        {sessions.length === 0 ? (
          <p className="admin-empty-inline">{t('admin.users.noSessions')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.users.fields.device')}</th>
                  <th>{t('admin.users.fields.ip')}</th>
                  <th>{t('admin.users.fields.lastActivity')}</th>
                  <th>{t('admin.users.fields.created')}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.userAgent ? parseUA(s.userAgent) : '—'}</td>
                    <td className="admin-table-mono">{s.ipAddress || '—'}</td>
                    <td>{new Date(s.lastActivityAt).toLocaleString()}</td>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Audit Log */}
      <Card className="admin-card">
        <h3>{t('admin.users.sections.auditLog')}</h3>
        {auditLog.length === 0 ? (
          <p className="admin-empty-inline">{t('admin.users.noAuditEntries')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.users.fields.action')}</th>
                  <th>{t('admin.users.fields.timestamp')}</th>
                  <th>{t('admin.users.fields.details')}</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.action}</td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="admin-table-meta">
                      {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* --- Modals --- */}

      <SubscriptionOverridesModal
        open={subscriptionModal}
        onOpenChange={setSubscriptionModal}
        effective={subscriptionOverrides.effective}
        overrides={subscriptionOverrides.overrides}
        loading={actionLoading}
        onAdd={handleAddSubscriptionOverride}
        onUpdate={handleUpdateSubscriptionOverride}
        onRemove={handleRemoveSubscriptionOverride}
      />

      {/* Approve Age Confirmation */}
      <ConfirmDialog
        open={confirmApproveAge}
        onOpenChange={(open) => { if (!open) setConfirmApproveAge(false); }}
        title={t('admin.users.modals.approveAgeTitle')}
        confirmLabel={t('admin.users.modals.approveAgeConfirm')}
        onConfirm={handleApproveAge}
        onCancel={() => setConfirmApproveAge(false)}
        loading={actionLoading}
      >
        <p>{t('admin.users.modals.approveAgeDesc')}</p>
      </ConfirmDialog>

      {/* Entitlements Modal */}
      <ConfirmDialog
        open={entitlementModal}
        onOpenChange={(open) => { if (!open) setEntitlementModal(false); }}
        title={t('admin.users.modals.entitlementsTitle')}
        confirmLabel={t('common.close')}
        onConfirm={() => setEntitlementModal(false)}
        onCancel={() => setEntitlementModal(false)}
      >
        <div className="admin-entitlements-list">
          {(entitlements.overrides?.length ?? 0) > 0 ? (
            <ul className="admin-list">
              {entitlements.overrides.map((ent) => (
                <li key={ent} className="admin-entitlement-item">
                  <span>{ent}</span>
                  <Button size="sm" className="btn-danger" onClick={() => handleRemoveEntitlement(ent)}>
                    {t('common.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-empty-inline">{t('admin.users.noOverrides')}</p>
          )}
        </div>
        <div className="admin-form-group admin-form-row">
          <input
            type="text"
            placeholder={t('admin.users.modals.entitlementPlaceholder')}
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
        title={t('admin.users.modals.suspendTitle')}
        confirmLabel={t('admin.users.modals.suspendConfirm')}
        onConfirm={handleSuspend}
        onCancel={() => { setSuspendModal(false); resetSuspendModal(); }}
        loading={actionLoading}
        variant="warning"
      >
        <div className="admin-form-group">
          <span className="admin-field-label">{t('admin.users.modals.categoryPreset')}</span>
          <ModerationCategorySelect
            value={suspendCategory}
            onChange={(category) => applyModerationCategory(category, setSuspendCategory, setSuspendReason)}
            disabled={actionLoading}
          />
          <small>{t('admin.users.modals.categoryHint')}</small>
        </div>
        <div className="admin-form-group">
          <label htmlFor="suspend-reason">{t('admin.users.modals.reason')}</label>
          <textarea
            id="suspend-reason"
            className="admin-textarea"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={3}
          />
        </div>
        <div className="admin-form-group">
          <label htmlFor="suspend-duration">{t('admin.users.modals.durationHours')}</label>
          <input
            id="suspend-duration"
            type="number"
            min="1"
            placeholder={t('admin.users.modals.indefinite')}
            value={suspendDuration}
            onChange={(e) => setSuspendDuration(e.target.value)}
          />
          <small>{t('admin.users.modals.durationHint')}</small>
        </div>
      </ConfirmDialog>

      {/* Unsuspend Confirmation */}
      <ConfirmDialog
        open={confirmUnsuspend}
        onOpenChange={(open) => { if (!open) setConfirmUnsuspend(false); }}
        title={t('admin.users.modals.unsuspendTitle')}
        confirmLabel={t('admin.users.modals.unsuspendConfirm')}
        onConfirm={handleUnsuspend}
        onCancel={() => setConfirmUnsuspend(false)}
        loading={actionLoading}
      >
        <p>{t('admin.users.modals.unsuspendDesc')}</p>
      </ConfirmDialog>

      {/* Ban Modal */}
      <ConfirmDialog
        open={banModal}
        onOpenChange={(open) => { if (!open) { setBanModal(false); resetBanModal(); } }}
        title={t('admin.users.modals.banTitle')}
        confirmLabel={t('admin.users.modals.banConfirm')}
        onConfirm={handleBan}
        onCancel={() => { setBanModal(false); resetBanModal(); }}
        loading={actionLoading}
        variant="danger"
      >
        <p className="admin-alert admin-alert--error">{t('admin.users.modals.banWarning')}</p>
        <div className="admin-form-group">
          <span className="admin-field-label">{t('admin.users.modals.categoryPreset')}</span>
          <ModerationCategorySelect
            value={banCategory}
            onChange={(category) => applyModerationCategory(category, setBanCategory, setBanReason)}
            disabled={actionLoading}
          />
          <small>{t('admin.users.modals.categoryHint')}</small>
        </div>
        <div className="admin-form-group">
          <label htmlFor="ban-reason">{t('admin.users.modals.reason')}</label>
          <textarea
            id="ban-reason"
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
        title={t('admin.users.modals.unbanTitle')}
        confirmLabel={t('admin.users.modals.unbanConfirm')}
        onConfirm={handleUnban}
        onCancel={() => setConfirmUnban(false)}
        loading={actionLoading}
      >
        <p>{t('admin.users.modals.unbanDesc')}</p>
      </ConfirmDialog>
    </div>
  );
}

// --- Helpers ---

function StatusBadge({ status }: { status: 'active' | 'suspended' | 'banned' }) {
  const { t } = useTranslation();
  const cls =
    status === 'banned'
      ? 'admin-badge admin-badge--danger'
      : status === 'suspended'
        ? 'admin-badge admin-badge--warning'
        : 'admin-badge admin-badge--success';
  return <span className={cls}>{t(`admin.users.status.${status}`)}</span>;
}

function AvStatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation();
  if (!status) return <span>—</span>;
  const cls =
    status === 'verified'
      ? 'admin-badge admin-badge--success'
      : status === 'failed'
        ? 'admin-badge admin-badge--danger'
        : status === 'pending'
          ? 'admin-badge admin-badge--warning'
          : 'admin-badge';
  return <span className={cls}>{t(`admin.users.avStatus.${status}`)}</span>;
}

function parseUA(ua: string): string {
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return ua.slice(0, 30);
}
