import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from '../Button';
import { enumerateMediaDevices, type MediaDeviceInfo } from '../../hooks/useCallMedia';

export interface CallDeviceSetupModalProps {
  open: boolean;
  isJoin: boolean;
  onConfirm: (devices: { audioDeviceId?: string }) => void;
  onCancel: () => void;
}

export function CallDeviceSetupModal({
  open,
  isJoin,
  onConfirm,
  onCancel,
}: CallDeviceSetupModalProps) {
  const { t } = useTranslation();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const audioDevices = devices.filter((d) => d.kind === 'audioinput');

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await enumerateMediaDevices();
      setDevices(result);

      const firstMic = result.find((d) => d.kind === 'audioinput');
      if (firstMic) {
        setAudioDeviceId(firstMic.deviceId);
      } else {
        setAudioDeviceId('');
      }
    } catch {
      setAudioDeviceId('');
      setDevices([]);
      setError(t('call.permissionDenied'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) {
      void loadDevices();
    }
  }, [open, loadDevices]);

  const handleConfirm = () => {
    onConfirm({ audioDeviceId: audioDeviceId || undefined });
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) handleCancel(); }}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content" style={{ maxWidth: '440px' }}>
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('call.deviceSetupTitle')}
              </Dialog.Title>
            </div>

            <div className="call-device-setup__body">
              {error && (
                <div className="call-device-setup__error">
                  <span>{error}</span>
                  <Button variant="ghost" size="sm" onClick={loadDevices}>
                    {t('call.retryPermission')}
                  </Button>
                </div>
              )}

              <div className="call-device-setup__field">
                <label htmlFor="call-mic-select">
                  {t('call.selectMicrophone')}
                </label>
                <select
                  id="call-mic-select"
                  value={audioDeviceId}
                  onChange={(e) => setAudioDeviceId(e.target.value)}
                  disabled={loading || audioDevices.length === 0}
                >
                  {audioDevices.length === 0 && (
                    <option value="">{t('call.noDevicesFound')}</option>
                  )}
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="call-device-setup__note">
                {t('call.deviceSetupHint')}
              </p>
            </div>

            <div className="call-device-setup__actions">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                {t('call.cancelSetup')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={loading || (!audioDeviceId && audioDevices.length > 0)}
              >
                {isJoin ? t('call.confirmJoin') : t('call.confirmCall')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
