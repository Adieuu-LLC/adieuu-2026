import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient } from '@adieuu/shared';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useBlocks } from '../../hooks/useBlocks';
import { useIdentity } from '../../hooks/useIdentity';
import { useAppConfig } from '../../config';
import { useToast } from '../../components/Toast';

export function IdentityPrivacy() {
  const { t } = useTranslation();
  const { status: identityStatus, identity, refreshIdentitySession } = useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const toast = useToast();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const { blocked, isLoading, hasMore, loadMore, unblock } = useBlocks();
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<string | null>(null);
  const [savingApproval, setSavingApproval] = useState(false);

  const isLoggedIn = identityStatus === 'logged_in';

  const handleGroupApprovalChange = useCallback(
    async (checked: boolean) => {
      setSavingApproval(true);
      try {
        const resp = await api.identity.updateProfile({ requireGroupApproval: checked });
        if (resp.success) {
          await refreshIdentitySession?.();
          toast.success(
            t('identity.privacy.groupApprovalTitle'),
            checked
              ? t('identity.privacy.groupApprovalEnabled')
              : t('identity.privacy.groupApprovalDisabled')
          );
        }
      } catch {
        toast.error(
          t('identity.privacy.groupApprovalTitle'),
          t('identity.privacy.groupApprovalError')
        );
      } finally {
        setSavingApproval(false);
      }
    },
    [api, refreshIdentitySession, toast, t]
  );

  const handleUnblock = async (identityId: string) => {
    setUnblockingId(identityId);
    await unblock(identityId);
    setUnblockingId(null);
    setConfirmUnblock(null);
  };

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('identity.privacy.title')}</h1>
          <p className="page-subtitle">
            {t('identity.privacy.subtitle')}
          </p>
        </div>

        <Card variant="elevated" className="slide-up app-settings-card">
          <h2 className="app-settings-section-title">{t('identity.privacy.conversationsTitle')}</h2>
          <p className="app-settings-section-desc">{t('identity.privacy.conversationsDescription')}</p>

          {!isLoggedIn ? (
            <p style={{ color: 'var(--color-text-secondary)', margin: '1rem 0 0' }}>
              {t('ciphers.notLoggedIn')}
            </p>
          ) : (
            <label className="app-settings-toggle">
              <input
                type="checkbox"
                checked={identity?.requireGroupApproval ?? false}
                disabled={savingApproval}
                onChange={(e) => void handleGroupApprovalChange(e.target.checked)}
              />
              <span className="app-settings-toggle-label">
                <span className="app-settings-toggle-title">
                  {t('identity.privacy.groupApprovalTitle')}
                </span>
                <span className="app-settings-toggle-hint">
                  {t('identity.privacy.groupApprovalHint')}
                </span>
              </span>
            </label>
          )}
        </Card>

        <Card variant="elevated" className="slide-up">
          <h2 className="card-section-title">{t('blocked.title')}</h2>
          <p className="card-section-subtitle">{t('blocked.subtitle')}</p>

          {!isLoggedIn ? (
            <p style={{ color: 'var(--color-text-secondary)', margin: '1rem 0 0' }}>
              {t('ciphers.notLoggedIn')}
            </p>
          ) : isLoading && blocked.length === 0 ? (
            <div className="blocked-loading">
              <span className="spinner spinner-md" />
            </div>
          ) : blocked.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', margin: '1rem 0 0' }}>
              {t('blocked.noBlocked')}
            </p>
          ) : (
            <div className="blocked-list">
              {blocked.map((item) => (
                <div key={item.identity.id} className="blocked-item">
                  <Avatar
                    name={item.identity.displayName}
                    src={item.identity.avatarUrl}
                    size="sm"
                  />
                  <div className="blocked-info">
                    <span className="blocked-name">{item.identity.displayName}</span>
                    <span className="blocked-username">@{item.identity.username}</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmUnblock(item.identity.id)}
                    disabled={unblockingId === item.identity.id}
                  >
                    {unblockingId === item.identity.id ? (
                      <span className="spinner spinner-sm" />
                    ) : (
                      t('blocked.unblock')
                    )}
                  </Button>
                </div>
              ))}
              {hasMore && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadMore}
                  disabled={isLoading}
                  className="blocked-load-more"
                >
                  {isLoading ? <span className="spinner spinner-sm" /> : 'Load more'}
                </Button>
              )}
            </div>
          )}
        </Card>

        <ConfirmDialog
          open={confirmUnblock !== null}
          onOpenChange={(open) => !open && setConfirmUnblock(null)}
          onConfirm={() => confirmUnblock && handleUnblock(confirmUnblock)}
          title={t('blocked.unblock')}
          description={t('blocked.confirmUnblock')}
          confirmLabel={t('blocked.unblock')}
          variant="warning"
        />
      </div>
    </div>
  );
}
