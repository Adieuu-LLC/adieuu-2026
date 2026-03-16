/**
 * Devices page for managing identity devices.
 *
 * Allows users to:
 * - View all registered devices
 * - Rename devices
 * - Delete devices (with passphrase confirmation)
 * - Delete all other devices
 * - Configure activity tracking preferences
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Dialog, Portal, RadioGroup } from '@ark-ui/react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { Tabs, TabList, TabTrigger, TabContent } from '../../components/Tabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ExportKeyBackupModal } from '../../components/ExportKeyBackupModal';
import { ImportKeyBackupModal } from '../../components/ImportKeyBackupModal';
import { createApiClient, type PublicIdentitySession } from '@adieuu/shared';
import { useDeviceManagement, type DeviceWithStatus, type ActivityTrackingMode, type ActivityInterval } from '../../hooks/useDeviceManagement';
import { useIdentity } from '../../hooks/useIdentity';
import { usePreKeys } from '../../hooks/usePreKeys';
import { useAppConfig } from '../../config';
import { useToast } from '../../components/Toast';

/**
 * Format relative time for last active display.
 */
function formatLastActive(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

const WEB_SHARED_DEVICE_NAME = 'Web (shared)';

/**
 * Device list item component.
 */
function DeviceItem({
  device,
  onRename,
  onRemove,
}: {
  device: DeviceWithStatus;
  onRename: (deviceId: string, currentName: string) => void;
  onRemove: (deviceId: string, isCurrentDevice: boolean) => void;
}) {
  const { t } = useTranslation();
  const isSharedWebDevice = device.name === WEB_SHARED_DEVICE_NAME;

  return (
    <div className={`session-item ${device.isCurrentDevice ? 'session-item-current' : ''}`}>
      <div className="session-info">
        <div className="session-device">
          {isSharedWebDevice ? <GlobeIcon /> : <DeviceIcon />}
          <span>{isSharedWebDevice ? t('identity.e2e.webDeviceRevocation.label') : device.name}</span>
          {device.isCurrentDevice && (
            <span className="session-current-badge">
              {t('identity.devices.thisDevice', 'This device')}
            </span>
          )}
          {isSharedWebDevice && (
            <span className="session-current-badge" style={{ backgroundColor: 'var(--color-warning-bg, #fef3c7)', color: 'var(--color-warning-text, #92400e)' }}>
              {t('identity.e2e.webDeviceRevocation.subtitle')}
            </span>
          )}
        </div>
        <div className="session-meta">
          <span title={device.deviceId}>
            ID: {device.deviceId.slice(0, 8)}...
          </span>
          {device.lastActiveAt && (
            <span>
              {t('identity.devices.lastActive', 'Active')}: {formatLastActive(device.lastActiveAt)}
            </span>
          )}
          {device.registeredAt && (
            <span>
              {t('identity.devices.added', 'Added')}: {new Date(device.registeredAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div className="session-actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRename(device.deviceId, device.name)}
        >
          {t('identity.devices.rename', 'Rename')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="session-revoke-btn"
          onClick={() => onRemove(device.deviceId, device.isCurrentDevice)}
        >
          {t('identity.devices.remove', 'Delete')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Passphrase confirmation dialog for device removal.
 */
function PassphraseDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (passphrase: string) => Promise<void>;
  loading: boolean;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!passphrase.trim()) {
      setError('Please enter your passphrase');
      return;
    }

    setError(null);
    try {
      await onConfirm(passphrase);
      setPassphrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const handleClose = () => {
    setPassphrase('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(e) => !loading && handleClose()} closeOnInteractOutside={!loading}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content confirm-dialog-danger">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">{title}</Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <Dialog.Description className="confirm-dialog-description">
                {description}
              </Dialog.Description>

              <div className="passphrase-input-wrapper">
                <Input
                  type="password"
                  placeholder="Enter your passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                  disabled={loading}
                  autoFocus
                />
                {error && <div className="passphrase-error">{error}</div>}
              </div>
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="btn-danger"
                onClick={handleConfirm}
                disabled={loading || !passphrase.trim()}
              >
                {loading ? (
                  <span className="confirm-dialog-loading">
                    <span className="spinner spinner-sm" />
                    {confirmLabel}
                  </span>
                ) : (
                  confirmLabel
                )}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/**
 * Rename device dialog.
 */
function RenameDialog({
  open,
  onOpenChange,
  currentName,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onConfirm: (newName: string) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Device name cannot be empty');
      return;
    }
    if (trimmed.length > 100) {
      setError('Device name must be 100 characters or less');
      return;
    }

    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename device');
    }
  };

  const handleClose = () => {
    setName(currentName);
    setError(null);
    onOpenChange(false);
  };

  // Reset name when dialog opens with new currentName
  useState(() => {
    setName(currentName);
  });

  return (
    <Dialog.Root open={open} onOpenChange={(e) => !loading && handleClose()} closeOnInteractOutside={!loading}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">Rename Device</Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <Dialog.Description className="confirm-dialog-description">
                Enter a new name for this device.
              </Dialog.Description>

              <div className="rename-input-wrapper">
                <Input
                  type="text"
                  placeholder="Device name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                  disabled={loading}
                  autoFocus
                  maxLength={100}
                />
                {error && <div className="rename-error">{error}</div>}
              </div>
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={loading || !name.trim()}
              >
                {loading ? (
                  <span className="confirm-dialog-loading">
                    <span className="spinner spinner-sm" />
                    Save
                  </span>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/**
 * Activity preferences section using Ark UI components.
 */
function ActivityPreferences() {
  const { t } = useTranslation();
  const { activityPrefs, setActivityPreferences } = useDeviceManagement();
  const { success: toastSuccess } = useToast();

  const handleModeChange = (details: { value: string | null }) => {
    if (details.value) {
      setActivityPreferences({ ...activityPrefs, mode: details.value as ActivityTrackingMode });
      toastSuccess(t('identity.activity.settingUpdated', 'Activity tracking preference updated'));
    }
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActivityPreferences({ ...activityPrefs, intervalMinutes: Number(e.target.value) as ActivityInterval });
    toastSuccess(t('identity.activity.settingUpdated', 'Activity tracking preference updated'));
  };

  return (
    <div className="activity-settings">
      <div className="sessions-header">
        <div className="sessions-header-text">
          <h3>{t('identity.activity.title', 'Activity Tracking')}</h3>
          <p>{t('identity.activity.description', 'Choose how your device activity is tracked. This helps you see when each device was last used.')}</p>
        </div>
      </div>

      <div className="activity-section">
        <RadioGroup.Root
          value={activityPrefs.mode}
          onValueChange={handleModeChange}
          className="activity-radio-group"
        >
          <RadioGroup.Item value="active-only" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.activity.whenActive', 'When active')}</span>
              <span className="activity-radio-description">{t('identity.activity.whenActiveDesc', 'Only update when you interact with the app')}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>

          <RadioGroup.Item value="periodic" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.activity.periodic', 'Periodic')}</span>
              <span className="activity-radio-description">{t('identity.activity.periodicDesc', 'Update at regular intervals while the app is open')}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>

          <RadioGroup.Item value="disabled" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.activity.disabled', 'Disabled')}</span>
              <span className="activity-radio-description">{t('identity.activity.disabledDesc', "Don't track activity (last active won't update)")}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
        </RadioGroup.Root>
      </div>

      {activityPrefs.mode === 'periodic' && (
        <div className="activity-section activity-interval-section">
          <label htmlFor="activityInterval" className="activity-interval-label">
            {t('identity.activity.updateInterval', 'Update interval')}
          </label>
          <select
            id="activityInterval"
            className="activity-interval-select"
            value={activityPrefs.intervalMinutes}
            onChange={handleIntervalChange}
          >
            <option value={15}>{t('identity.activity.interval15', 'Every 15 minutes')}</option>
            <option value={30}>{t('identity.activity.interval30', 'Every 30 minutes')}</option>
            <option value={60}>{t('identity.activity.interval60', 'Every hour')}</option>
          </select>
        </div>
      )}
    </div>
  );
}

/**
 * Forward secrecy settings for SPK rotation and key deletion policy.
 */
function ForwardSecrecySettings() {
  const { t } = useTranslation();
  const { config, updateConfig, rotateNow, purgeRetiredKeys, isRotating, lastRotation } = usePreKeys();
  const { success: toastSuccess, error: toastError } = useToast();

  const [immediateConfirmOpen, setImmediateConfirmOpen] = useState(false);
  const [clearCacheConfirmOpen, setClearCacheConfirmOpen] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [purgeClearCache, setPurgeClearCache] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const handleSecurityLevelChange = (details: { value: string | null }) => {
    if (!details.value) return;
    updateConfig({ securityLevel: details.value as 'standard' | 'high' | 'maximum' });
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

  return (
    <div className="activity-settings">
      <div className="sessions-header">
        <div className="sessions-header-text">
          <h3>{t('identity.devices.forwardSecrecy.title')}</h3>
          <p>{t('identity.devices.forwardSecrecy.description')}</p>
        </div>
      </div>

      <div className="activity-section">
        <h4 className="activity-radio-title">{t('identity.devices.forwardSecrecy.securityLevelTitle')}</h4>
        <RadioGroup.Root
          value={config.securityLevel}
          onValueChange={handleSecurityLevelChange}
          className="activity-radio-group"
        >
          <RadioGroup.Item value="standard" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.devices.forwardSecrecy.security.standard.title')}</span>
              <span className="activity-radio-description">{t('identity.devices.forwardSecrecy.security.standard.description')}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
          <RadioGroup.Item value="high" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.devices.forwardSecrecy.security.high.title')}</span>
              <span className="activity-radio-description">{t('identity.devices.forwardSecrecy.security.high.description')}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
          <RadioGroup.Item value="maximum" className="activity-radio-item">
            <RadioGroup.ItemControl className="activity-radio-control" />
            <RadioGroup.ItemText className="activity-radio-text">
              <span className="activity-radio-title">{t('identity.devices.forwardSecrecy.security.maximum.title')}</span>
              <span className="activity-radio-description">{t('identity.devices.forwardSecrecy.security.maximum.description')}</span>
            </RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
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

function parseUserAgent(userAgent?: string): string {
  if (!userAgent) return 'Unknown device';

  if (userAgent.includes('Firefox')) {
    return userAgent.includes('Mobile') ? 'Firefox Mobile' : 'Firefox';
  }
  if (userAgent.includes('Edg/')) return 'Microsoft Edge';
  if (userAgent.includes('Chrome')) {
    return userAgent.includes('Mobile') ? 'Chrome Mobile' : 'Chrome';
  }
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return userAgent.includes('Mobile') ? 'Safari Mobile' : 'Safari';
  }
  if (userAgent.includes('Windows')) return 'Windows Device';
  if (userAgent.includes('Mac')) return 'Mac Device';
  if (userAgent.includes('Linux')) return 'Linux Device';
  if (userAgent.includes('Android')) return 'Android Device';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS Device';

  return 'Unknown device';
}

/**
 * Identity sessions list component.
 */
function IdentitySessionsList() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const { identity } = useIdentity();
  const { success: toastSuccess } = useToast();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [sessions, setSessions] = useState<PublicIdentitySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!identity) return;
    try {
      const response = await api.identity.listSessions(identity.id);
      if (response.success && response.data?.sessions) {
        setSessions(response.data.sessions);
      }
    } catch (error) {
      console.error('Failed to fetch identity sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [api, identity]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSession = async (sessionId: string) => {
    if (!identity) return;
    setRevoking(sessionId);
    try {
      const response = await api.identity.revokeIdentitySession(identity.id, sessionId);
      if (response.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        toastSuccess(t('identity.sessions.sessionRevoked', 'Session revoked successfully.'));
      }
    } catch (error) {
      console.error('Failed to revoke identity session:', error);
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    if (!identity) return;
    setRevokingAll(true);
    try {
      const response = await api.identity.revokeAllOtherIdentitySessions(identity.id);
      if (response.success) {
        setSessions((prev) => prev.filter((s) => s.isCurrent));
        const count = response.data?.count ?? 0;
        toastSuccess(
          t('identity.sessions.allSessionsRevoked', {
            count,
            defaultValue: `${count} session(s) revoked successfully.`,
          })
        );
      }
    } catch (error) {
      console.error('Failed to revoke all identity sessions:', error);
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
          <h3>{t('identity.sessions.title', 'Identity Sessions')}</h3>
          <p>{t('identity.sessions.description', "These are the active sessions for your identity. You can revoke access to any session you don't recognize.")}</p>
        </div>
        {otherSessions.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="session-revoke-btn"
            onClick={() => setShowRevokeAllConfirm(true)}
            disabled={revokingAll}
          >
            {revokingAll ? <Spinner size="sm" /> : t('identity.sessions.revokeAllOthers', 'Revoke all other sessions')}
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
                    {t('identity.sessions.currentSession', 'Current session')}
                  </span>
                )}
              </div>
              <div className="session-meta">
                <span>
                  {t('identity.sessions.lastActive', 'Last active')}: {formatLastActive(session.lastActivityAt)}
                </span>
                <span>
                  {t('identity.sessions.created', 'Created')}: {new Date(session.createdAt).toLocaleDateString()}
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
                    t('identity.sessions.revokeSession', 'Revoke')
                  )}
                </Button>
              </div>
            )}
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="sessions-empty">
            {t('identity.sessions.noOtherSessions', 'No other active sessions.')}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showRevokeAllConfirm}
        onOpenChange={setShowRevokeAllConfirm}
        title={t('identity.sessions.revokeAllConfirmTitle', 'Revoke all other sessions?')}
        description={t('identity.sessions.revokeAllConfirmDescription', 'This will sign out all other sessions for this identity. You will remain signed in on this device.')}
        confirmLabel={t('identity.sessions.revokeAllOthers', 'Revoke all other sessions')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={revokingAll}
        onConfirm={handleRevokeAllOthers}
      />
    </div>
  );
}

/**
 * Main Devices page component.
 */
export function Devices() {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const {
    devices,
    loading,
    error,
    fetchDevices,
    renameDevice,
    removeDevice,
    removeAllOtherDevices,
  } = useDeviceManagement();
  const { success: toastSuccess, error: toastError } = useToast();

  // Dialog states
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeAllDialogOpen, setRemoveAllDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string; isCurrent: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const otherDevicesCount = devices.filter((d) => !d.isCurrentDevice).length;

  const handleRenameClick = useCallback((deviceId: string, currentName: string) => {
    setSelectedDevice({ id: deviceId, name: currentName, isCurrent: false });
    setRenameDialogOpen(true);
  }, []);

  const handleRemoveClick = useCallback((deviceId: string, isCurrentDevice: boolean) => {
    const device = devices.find((d) => d.deviceId === deviceId);
    setSelectedDevice({ id: deviceId, name: device?.name ?? '', isCurrent: isCurrentDevice });
    setRemoveDialogOpen(true);
  }, [devices]);

  const handleRename = async (newName: string) => {
    if (!selectedDevice) return;

    setActionLoading(true);
    const result = await renameDevice(selectedDevice.id, newName);
    setActionLoading(false);

    if (result.success) {
      toastSuccess('Device renamed', `Device has been renamed to "${newName}"`);
      setRenameDialogOpen(false);
      setSelectedDevice(null);
    } else {
      throw new Error(result.error ?? 'Failed to rename device');
    }
  };

  const handleRemove = async (passphrase: string) => {
    if (!selectedDevice) return;

    setActionLoading(true);
    const result = await removeDevice(selectedDevice.id, passphrase);
    setActionLoading(false);

    if (result.success) {
      if (selectedDevice.isCurrent) {
        toastSuccess('Device deleted', 'You have been logged out');
      } else {
        toastSuccess('Device deleted', 'The device has been deleted');
        setRemoveDialogOpen(false);
        setSelectedDevice(null);
      }
    } else {
      throw new Error(result.error ?? 'Failed to delete device');
    }
  };

  const handleRemoveAll = async (passphrase: string) => {
    setActionLoading(true);
    const result = await removeAllOtherDevices(passphrase);
    setActionLoading(false);

    if (result.success) {
      toastSuccess('Devices deleted', `${otherDevicesCount} device(s) have been deleted`);
      setRemoveAllDialogOpen(false);
    } else {
      throw new Error(result.error ?? 'Failed to delete devices');
    }
  };

  const handleExportSuccess = useCallback(() => {
    toastSuccess(t('identity.devices.export.success', 'Backup exported successfully.'));
  }, [toastSuccess, t]);

  const handleImportSuccess = useCallback((result: { imported: number; skipped: number; ciphersImported: number; ciphersSkipped: number }) => {
    const parts: string[] = [];
    if (result.imported > 0 || result.skipped > 0) {
      parts.push(`${result.imported} device key(s)`);
    }
    if (result.ciphersImported > 0 || result.ciphersSkipped > 0) {
      parts.push(`${result.ciphersImported} cipher(s)`);
    }
    const totalSkipped = result.skipped + result.ciphersSkipped;
    const msg = totalSkipped > 0
      ? `Imported ${parts.join(', ')}. Skipped ${totalSkipped} existing.`
      : `Imported ${parts.join(', ')}.`;
    toastSuccess(msg);
    fetchDevices();
  }, [toastSuccess, fetchDevices]);

  if (!identity) {
    return (
      <div className="page-content">
        <div className="container">
          <Card variant="elevated">
            <p>Please log in to an identity to manage devices.</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('identity.devices.title', 'Devices')}</h1>
          <p className="page-subtitle">
            {t('identity.devices.subtitle', 'Manage devices that have access to your identity. Each device has its own encryption keys.')}
          </p>
        </div>

        <Tabs defaultTab="devices" className="slide-up">
          <TabList>
            <TabTrigger value="devices">
              {t('identity.devices.tabs.devices', 'Devices')}
            </TabTrigger>
            <TabTrigger value="sessions">
              {t('identity.devices.tabs.sessions', 'Sessions')}
            </TabTrigger>
            <TabTrigger value="activity">
              {t('identity.devices.tabs.activity', 'Activity')}
            </TabTrigger>
            <TabTrigger value="forward-secrecy">
              {t('identity.devices.tabs.forwardSecrecy', 'Forward Secrecy')}
            </TabTrigger>
          </TabList>

          <TabContent value="devices">
            {error && (
              <Card variant="elevated" className="devices-error-card">
                <p>{error}</p>
                <Button variant="secondary" size="sm" onClick={fetchDevices}>
                  {t('common.retry', 'Retry')}
                </Button>
              </Card>
            )}

            <Card variant="elevated">
              <div className="sessions-header">
                <div className="sessions-header-text">
                  <h3>{t('identity.devices.yourDevices', 'Your Devices')} ({devices.length})</h3>
                </div>
                <div className="sessions-header-actions">
                  {otherDevicesCount > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="session-revoke-btn"
                      onClick={() => setRemoveAllDialogOpen(true)}
                    >
                      {t('identity.devices.removeAllOthers', 'Delete all other devices')}
                    </Button>
                  )}
                </div>
              </div>

              {loading && devices.length === 0 ? (
                <div className="sessions-loading">
                  <Spinner size="md" />
                </div>
              ) : devices.length === 0 ? (
                <div className="sessions-empty">
                  <p>{t('identity.devices.noDevices', 'No devices found.')}</p>
                </div>
              ) : (
                <div className="session-list">
                  {devices.map((device) => (
                    <DeviceItem
                      key={device.deviceId}
                      device={device}
                      onRename={handleRenameClick}
                      onRemove={handleRemoveClick}
                    />
                  ))}
                </div>
              )}

              <div className="key-backup-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setExportDialogOpen(true)}
                >
                  <KeyBackupIcon />
                  {t('identity.devices.exportKeyBackup', 'Export Key Backup')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setImportDialogOpen(true)}
                >
                  <KeyImportIcon />
                  {t('identity.devices.importKeyBackup', 'Import Key Backup')}
                </Button>
              </div>
            </Card>
          </TabContent>

          <TabContent value="sessions">
            <Card variant="elevated">
              <IdentitySessionsList />
            </Card>
          </TabContent>

          <TabContent value="activity">
            <Card variant="elevated">
              <ActivityPreferences />
            </Card>
          </TabContent>

          <TabContent value="forward-secrecy">
            <Card variant="elevated">
              <ForwardSecrecySettings />
            </Card>
          </TabContent>
        </Tabs>
      </div>

      {/* Remove device dialog */}
      <PassphraseDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title={
          selectedDevice?.name === WEB_SHARED_DEVICE_NAME
            ? t('identity.e2e.webDeviceRevocation.confirmTitle')
            : selectedDevice?.isCurrent
              ? 'Delete This Device?'
              : 'Delete Device?'
        }
        description={
          selectedDevice?.name === WEB_SHARED_DEVICE_NAME
            ? t('identity.e2e.webDeviceRevocation.confirmBody')
            : selectedDevice?.isCurrent
              ? 'This will log you out and delete this device. You will need to log in again and register a new device.'
              : 'This will delete the device and its encryption keys. The device will no longer be able to decrypt messages.'
        }
        confirmLabel={
          selectedDevice?.name === WEB_SHARED_DEVICE_NAME
            ? t('identity.e2e.webDeviceRevocation.confirm')
            : 'Delete Device'
        }
        onConfirm={handleRemove}
        loading={actionLoading}
      />

      {/* Remove all devices dialog */}
      <PassphraseDialog
        open={removeAllDialogOpen}
        onOpenChange={setRemoveAllDialogOpen}
        title="Delete All Other Devices?"
        description={`This will delete ${otherDevicesCount} device(s) and their encryption keys. They will no longer be able to decrypt new messages.`}
        confirmLabel="Delete All"
        onConfirm={handleRemoveAll}
        loading={actionLoading}
      />

      {/* Rename dialog */}
      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        currentName={selectedDevice?.name ?? ''}
        onConfirm={handleRename}
        loading={actionLoading}
      />

      {/* Export key backup dialog */}
      <ExportKeyBackupModal
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onSuccess={handleExportSuccess}
        defaultContent={['devices']}
      />

      {/* Import key backup dialog */}
      <ImportKeyBackupModal
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}

/** Globe icon SVG for shared web device */
function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

/** Device icon SVG */
function DeviceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', flexShrink: 0 }}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

/** Download / export icon */
function KeyBackupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.375rem', flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Upload / import icon */
function KeyImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.375rem', flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export default Devices;
