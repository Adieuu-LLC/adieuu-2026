import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, RadioGroup } from '@ark-ui/react';
import { createApiClient } from '@adieuu/shared';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { Avatar } from '../../components/Avatar';
import { Tabs, TabList, TabTrigger, TabContent } from '../../components/Tabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useBlocks } from '../../hooks/useBlocks';
import { useIdentity } from '../../hooks/useIdentity';
import { usePreKeys } from '../../hooks/usePreKeys';
import { useAppConfig } from '../../config';
import { useToast } from '../../components/Toast';
import type { SecurityLevel } from '../../services/preKeyService';

// ============================================================================
// Forward Secrecy Settings (moved from Devices page)
// ============================================================================

function ForwardSecrecySettings() {
  const { t } = useTranslation();
  const { config, updateConfig, rotateNow, purgeRetiredKeys, isRotating, lastRotation } = usePreKeys();
  const { success: toastSuccess, error: toastError } = useToast();

  const [immediateConfirmOpen, setImmediateConfirmOpen] = useState(false);
  const [clearCacheConfirmOpen, setClearCacheConfirmOpen] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [purgeClearCache, setPurgeClearCache] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const handleEnabledToggle = (checked: boolean) => {
    updateConfig({ enabled: checked });
    toastSuccess(t('identity.devices.forwardSecrecy.enabledUpdated'));
  };

  const handleSecurityLevelChange = (details: { value: string | null }) => {
    if (!details.value) return;
    updateConfig({ securityLevel: details.value as SecurityLevel });
    toastSuccess(t('identity.devices.forwardSecrecy.securityUpdated'));
  };

  const handleDeletionPolicyChange = (details: { value: string | null }) => {
    if (!details.value) return;
    if (details.value === 'immediate') {
      setImmediateConfirmOpen(true);
      return;
    }
    updateConfig({ spkDeletionPolicy: details.value as 'after-sync' | 'timed' | 'immediate' });
    toastSuccess(t('identity.devices.forwardSecrecy.deletionUpdated'));
  };

  const handleConfirmImmediate = () => {
    updateConfig({ spkDeletionPolicy: 'immediate' });
    setImmediateConfirmOpen(false);
    toastSuccess(t('identity.devices.forwardSecrecy.deletionUpdated'));
  };

  const handleClearCacheToggle = (next: boolean) => {
    if (next) {
      setClearCacheConfirmOpen(true);
    } else {
      updateConfig({ clearCacheOnRotation: false });
      toastSuccess(t('identity.devices.forwardSecrecy.clearCacheUpdated'));
    }
  };

  const handleConfirmClearCache = () => {
    updateConfig({ clearCacheOnRotation: true });
    setClearCacheConfirmOpen(false);
    toastSuccess(t('identity.devices.forwardSecrecy.clearCacheUpdated'));
  };

  const handleRotateNow = async () => {
    try {
      await rotateNow();
      toastSuccess(t('identity.devices.forwardSecrecy.rotateSuccess'));
    } catch (err) {
      toastError(
        t('identity.devices.forwardSecrecy.rotateErrorTitle'),
        err instanceof Error ? err.message : t('identity.devices.forwardSecrecy.rotateErrorBody')
      );
    }
  };

  const handlePurgeRetiredKeys = async () => {
    setIsPurging(true);
    try {
      const deleted = await purgeRetiredKeys(purgeClearCache);
      setPurgeConfirmOpen(false);
      setPurgeClearCache(false);
      if (deleted > 0) {
        toastSuccess(t('identity.devices.forwardSecrecy.purgeSuccess', { count: deleted }));
      } else {
        toastSuccess(t('identity.devices.forwardSecrecy.purgeNone'));
      }
    } catch (err) {
      toastError(
        t('identity.devices.forwardSecrecy.purgeErrorTitle'),
        err instanceof Error ? err.message : t('identity.devices.forwardSecrecy.purgeErrorBody')
      );
    } finally {
      setIsPurging(false);
    }
  };

  const securityLevels: { value: SecurityLevel; titleKey: string; descKey: string }[] = [
    { value: 'very_lax', titleKey: 'identity.devices.forwardSecrecy.security.very_lax.title', descKey: 'identity.devices.forwardSecrecy.security.very_lax.description' },
    { value: 'lax', titleKey: 'identity.devices.forwardSecrecy.security.lax.title', descKey: 'identity.devices.forwardSecrecy.security.lax.description' },
    { value: 'standard', titleKey: 'identity.devices.forwardSecrecy.security.standard.title', descKey: 'identity.devices.forwardSecrecy.security.standard.description' },
    { value: 'medium', titleKey: 'identity.devices.forwardSecrecy.security.medium.title', descKey: 'identity.devices.forwardSecrecy.security.medium.description' },
    { value: 'high', titleKey: 'identity.devices.forwardSecrecy.security.high.title', descKey: 'identity.devices.forwardSecrecy.security.high.description' },
    { value: 'maximum', titleKey: 'identity.devices.forwardSecrecy.security.maximum.title', descKey: 'identity.devices.forwardSecrecy.security.maximum.description' },
  ];

  return (
    <div className="activity-settings">
      <div className="sessions-header">
        <div className="sessions-header-text">
          <h3>{t('identity.devices.forwardSecrecy.title')}</h3>
          <p>{t('identity.devices.forwardSecrecy.description')}</p>
        </div>
      </div>

      <p className="fs-beta-notice">{t('identity.devices.forwardSecrecy.betaWarning')}</p>

      <div className="activity-section">
        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleEnabledToggle(e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">
              {t('identity.devices.forwardSecrecy.enabledTitle')}
            </span>
            <span className="app-settings-toggle-hint">
              {t('identity.devices.forwardSecrecy.enabledHint')}
            </span>
          </span>
        </label>
      </div>

      <div className="activity-section">
        <h4 className="activity-radio-title">{t('identity.devices.forwardSecrecy.securityLevelTitle')}</h4>
        <RadioGroup.Root
          value={config.securityLevel}
          onValueChange={handleSecurityLevelChange}
          className="activity-radio-group"
        >
          {securityLevels.map((level) => (
            <RadioGroup.Item key={level.value} value={level.value} className="activity-radio-item">
              <RadioGroup.ItemControl className="activity-radio-control" />
              <RadioGroup.ItemText className="activity-radio-text">
                <span className="activity-radio-title">{t(level.titleKey)}</span>
                <span className="activity-radio-description">{t(level.descKey)}</span>
              </RadioGroup.ItemText>
              <RadioGroup.ItemHiddenInput />
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </div>

      <div className="activity-section">
        <h4 className="activity-radio-title">{t('identity.devices.forwardSecrecy.deletionPolicyTitle')}</h4>
        <RadioGroup.Root
          value={config.spkDeletionPolicy}
          onValueChange={handleDeletionPolicyChange}
          className="activity-radio-group"
        >
          <RadioGroup.Item value="after-sync" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.devices.forwardSecrecy.deletion.afterSync.title')}</span>
              <span className="activity-radio-description">{t('identity.devices.forwardSecrecy.deletion.afterSync.description')}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
          <RadioGroup.Item value="timed" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.devices.forwardSecrecy.deletion.timed.title')}</span>
              <span className="activity-radio-description">{t('identity.devices.forwardSecrecy.deletion.timed.description')}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
          <RadioGroup.Item value="immediate" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.devices.forwardSecrecy.deletion.immediate.title')}</span>
              <span className="activity-radio-description">{t('identity.devices.forwardSecrecy.deletion.immediate.description')}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
        </RadioGroup.Root>

        <Checkbox.Root
          checked={config.clearCacheOnRotation}
          onCheckedChange={(e) => handleClearCacheToggle(e.checked === true)}
          className="fs-cache-clear-checkbox"
        >
          <Checkbox.Control className="fs-checkbox-control" />
          <Checkbox.Label className="fs-checkbox-label">
            <span className="fs-checkbox-title">{t('identity.devices.forwardSecrecy.clearCacheOnRotation')}</span>
            <span className="fs-checkbox-hint">{t('identity.devices.forwardSecrecy.clearCacheOnRotationHint')}</span>
          </Checkbox.Label>
          <Checkbox.HiddenInput />
        </Checkbox.Root>
      </div>

      <div className="activity-section">
        <div className="sessions-header">
          <div className="sessions-header-text">
            <h4>{t('identity.devices.forwardSecrecy.manualRotationTitle')}</h4>
            <p>
              {lastRotation
                ? t('identity.devices.forwardSecrecy.lastRotatedAt', {
                    date: new Date(lastRotation).toLocaleString(),
                  })
                : t('identity.devices.forwardSecrecy.lastRotatedUnknown')}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRotateNow}
            disabled={isRotating}
          >
            {isRotating ? <Spinner size="sm" /> : t('identity.devices.forwardSecrecy.rotateNow')}
          </Button>
        </div>
      </div>

      <div className="activity-section">
        <div className="sessions-header">
          <div className="sessions-header-text">
            <h4>{t('identity.devices.forwardSecrecy.purgeTitle')}</h4>
            <p>{t('identity.devices.forwardSecrecy.purgeDescription')}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPurgeConfirmOpen(true)}
          >
            {t('identity.devices.forwardSecrecy.purgeButton')}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={immediateConfirmOpen}
        onOpenChange={setImmediateConfirmOpen}
        title={t('identity.devices.forwardSecrecy.deletion.immediateConfirmTitle')}
        description={t('identity.devices.forwardSecrecy.deletion.immediateConfirmBody')}
        confirmLabel={t('identity.devices.forwardSecrecy.deletion.immediateConfirmAction')}
        variant="warning"
        onConfirm={handleConfirmImmediate}
      />

      <ConfirmDialog
        open={clearCacheConfirmOpen}
        onOpenChange={setClearCacheConfirmOpen}
        title={t('identity.devices.forwardSecrecy.clearCacheConfirmTitle')}
        description={t('identity.devices.forwardSecrecy.clearCacheConfirmBody')}
        confirmLabel={t('identity.devices.forwardSecrecy.clearCacheConfirmAction')}
        variant="warning"
        onConfirm={handleConfirmClearCache}
      />

      <ConfirmDialog
        open={purgeConfirmOpen}
        onOpenChange={(open) => {
          setPurgeConfirmOpen(open);
          if (!open) setPurgeClearCache(false);
        }}
        title={t('identity.devices.forwardSecrecy.purgeConfirmTitle')}
        confirmLabel={t('identity.devices.forwardSecrecy.purgeConfirmAction')}
        variant="danger"
        loading={isPurging}
        onConfirm={handlePurgeRetiredKeys}
      >
        <p className="confirm-dialog-description">
          {t('identity.devices.forwardSecrecy.purgeConfirmBody')}
        </p>
        <Checkbox.Root
          checked={purgeClearCache}
          onCheckedChange={(e) => setPurgeClearCache(e.checked === true)}
          className="fs-cache-clear-checkbox fs-purge-cache-checkbox"
        >
          <Checkbox.Control className="fs-checkbox-control" />
          <Checkbox.Label className="fs-checkbox-label">
            {t('identity.devices.forwardSecrecy.purgeConfirmClearCache')}
          </Checkbox.Label>
          <Checkbox.HiddenInput />
        </Checkbox.Root>
      </ConfirmDialog>
    </div>
  );
}

// ============================================================================
// Identity Privacy Page
// ============================================================================

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

        <Tabs defaultTab="general" className="slide-up">
          <TabList>
            <TabTrigger value="general">
              {t('identity.privacy.tabs.general', 'General')}
            </TabTrigger>
            <TabTrigger value="forward-secrecy">
              {t('identity.privacy.tabs.forwardSecrecy', 'Forward Secrecy')}{' '}
              <span className="beta-badge">{t('identity.devices.forwardSecrecy.betaBadge')}</span>
            </TabTrigger>
          </TabList>

          <TabContent value="general">
            <Card variant="elevated" className="app-settings-card">
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

            <Card variant="elevated">
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
          </TabContent>

          <TabContent value="forward-secrecy">
            <Card variant="elevated">
              <ForwardSecrecySettings />
            </Card>
          </TabContent>
        </Tabs>

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
