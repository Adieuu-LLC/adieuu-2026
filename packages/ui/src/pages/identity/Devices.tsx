/**
 * Devices page for managing identity devices.
 *
 * Allows users to:
 * - View all registered devices
 * - Rename devices
 * - Remove devices (with passphrase confirmation)
 * - Remove all other devices
 * - Configure activity tracking preferences
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useDeviceManagement, type DeviceWithStatus, type ActivityTrackingMode, type ActivityInterval } from '../../hooks/useDeviceManagement';
import { useIdentity } from '../../hooks/useIdentity';
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
  return (
    <div className={`device-item ${device.isCurrentDevice ? 'device-item-current' : ''}`}>
      <div className="device-icon">
        <DeviceIcon />
      </div>
      <div className="device-info">
        <div className="device-name">
          {device.name}
          {device.isCurrentDevice && (
            <span className="device-badge">This device</span>
          )}
        </div>
        <div className="device-meta">
          <span className="device-id" title={device.deviceId}>
            ID: {device.deviceId.slice(0, 8)}...
          </span>
          {device.lastActiveAt && (
            <>
              <span className="device-separator">|</span>
              <span className="device-last-active">
                Active: {formatLastActive(device.lastActiveAt)}
              </span>
            </>
          )}
          {device.registeredAt && (
            <>
              <span className="device-separator">|</span>
              <span className="device-registered">
                Added: {new Date(device.registeredAt).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="device-actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRename(device.deviceId, device.name)}
        >
          Rename
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="btn-danger-outline"
          onClick={() => onRemove(device.deviceId, device.isCurrentDevice)}
        >
          Remove
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
 * Activity preferences section.
 */
function ActivityPreferences() {
  const { activityPrefs, setActivityPreferences } = useDeviceManagement();

  const handleModeChange = (mode: ActivityTrackingMode) => {
    setActivityPreferences({ ...activityPrefs, mode });
  };

  const handleIntervalChange = (interval: ActivityInterval) => {
    setActivityPreferences({ ...activityPrefs, intervalMinutes: interval });
  };

  return (
    <div className="activity-preferences">
      <h3 className="activity-preferences-title">Activity Tracking</h3>
      <p className="activity-preferences-description">
        Choose how your device activity is tracked. This helps you see when each device was last used.
      </p>

      <div className="activity-mode-options">
        <label className="activity-mode-option">
          <input
            type="radio"
            name="activityMode"
            checked={activityPrefs.mode === 'active-only'}
            onChange={() => handleModeChange('active-only')}
          />
          <span className="activity-mode-label">
            <strong>When active</strong>
            <span>Only update when you interact with the app</span>
          </span>
        </label>

        <label className="activity-mode-option">
          <input
            type="radio"
            name="activityMode"
            checked={activityPrefs.mode === 'periodic'}
            onChange={() => handleModeChange('periodic')}
          />
          <span className="activity-mode-label">
            <strong>Periodic</strong>
            <span>Update at regular intervals while the app is open</span>
          </span>
        </label>

        <label className="activity-mode-option">
          <input
            type="radio"
            name="activityMode"
            checked={activityPrefs.mode === 'disabled'}
            onChange={() => handleModeChange('disabled')}
          />
          <span className="activity-mode-label">
            <strong>Disabled</strong>
            <span>Don't track activity (last active won't update)</span>
          </span>
        </label>
      </div>

      {activityPrefs.mode !== 'disabled' && (
        <div className="activity-interval">
          <label htmlFor="activityInterval">Update interval:</label>
          <select
            id="activityInterval"
            value={activityPrefs.intervalMinutes}
            onChange={(e) => handleIntervalChange(Number(e.target.value) as ActivityInterval)}
          >
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour</option>
          </select>
        </div>
      )}
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
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string; isCurrent: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const otherDevicesCount = devices.filter((d) => !d.isCurrentDevice).length;

  const handleRenameClick = useCallback((deviceId: string, currentName: string) => {
    setSelectedDevice({ id: deviceId, name: currentName, isCurrent: false });
    setRenameDialogOpen(true);
  }, []);

  const handleRemoveClick = useCallback((deviceId: string, isCurrentDevice: boolean) => {
    setSelectedDevice({ id: deviceId, name: '', isCurrent: isCurrentDevice });
    setRemoveDialogOpen(true);
  }, []);

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
        toastSuccess('Device removed', 'You have been logged out');
      } else {
        toastSuccess('Device removed', 'The device has been removed');
        setRemoveDialogOpen(false);
        setSelectedDevice(null);
      }
    } else {
      throw new Error(result.error ?? 'Failed to remove device');
    }
  };

  const handleRemoveAll = async (passphrase: string) => {
    setActionLoading(true);
    const result = await removeAllOtherDevices(passphrase);
    setActionLoading(false);

    if (result.success) {
      toastSuccess('Devices removed', `${otherDevicesCount} device(s) have been removed`);
      setRemoveAllDialogOpen(false);
    } else {
      throw new Error(result.error ?? 'Failed to remove devices');
    }
  };

  if (!identity) {
    return (
      <div className="devices-page">
        <Card>
          <p>Please log in to an identity to manage devices.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="devices-page">
      <div className="devices-header">
        <h1>Devices</h1>
        <p className="devices-subtitle">
          Manage devices that have access to your identity. Each device has its own encryption keys.
        </p>
      </div>

      {error && (
        <div className="devices-error">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchDevices}>
            Retry
          </Button>
        </div>
      )}

      <Card className="devices-card">
        <div className="devices-card-header">
          <h2>Your Devices ({devices.length})</h2>
          {otherDevicesCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="btn-danger-outline"
              onClick={() => setRemoveAllDialogOpen(true)}
            >
              Remove all other devices
            </Button>
          )}
        </div>

        {loading && devices.length === 0 ? (
          <div className="devices-loading">
            <span className="spinner spinner-md" />
          </div>
        ) : devices.length === 0 ? (
          <div className="devices-empty">
            <p>No devices found.</p>
          </div>
        ) : (
          <div className="devices-list">
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
      </Card>

      <Card className="devices-card">
        <ActivityPreferences />
      </Card>

      {/* Remove device dialog */}
      <PassphraseDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title={selectedDevice?.isCurrent ? 'Remove This Device?' : 'Remove Device?'}
        description={
          selectedDevice?.isCurrent
            ? 'This will log you out and remove this device. You will need to log in again on this device to use it.'
            : 'This will remove the device and revoke its access. The device will no longer be able to decrypt messages.'
        }
        confirmLabel="Remove Device"
        onConfirm={handleRemove}
        loading={actionLoading}
      />

      {/* Remove all devices dialog */}
      <PassphraseDialog
        open={removeAllDialogOpen}
        onOpenChange={setRemoveAllDialogOpen}
        title="Remove All Other Devices?"
        description={`This will remove ${otherDevicesCount} device(s) and revoke their access. They will no longer be able to decrypt new messages.`}
        confirmLabel="Remove All"
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
    </div>
  );
}

/** Device icon SVG */
function DeviceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export default Devices;
