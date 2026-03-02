import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useBlocks } from '../../hooks/useBlocks';
import { useIdentity } from '../../hooks/useIdentity';

export function IdentityPrivacy() {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { blocked, isLoading, hasMore, loadMore, unblock } = useBlocks();
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<string | null>(null);

  const isLoggedIn = identityStatus === 'logged_in';

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
