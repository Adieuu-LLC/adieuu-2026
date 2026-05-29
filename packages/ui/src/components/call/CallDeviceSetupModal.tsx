import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from '../Button';
import { enumerateMediaDevices, type MediaDeviceInfo } from '../../hooks/useCallMedia';
import type { CallMediaOptions } from '../../services/callService';

export interface CallDeviceSetupModalProps {
  open: boolean;
  callType: CallMediaOptions;
  isJoin: boolean;
  onConfirm: (devices: { audioDeviceId?: string; videoDeviceId?: string }) => void;
  onCancel: () => void;
}

export function CallDeviceSetupModal({
  open,
  callType,
  isJoin,
  onConfirm,
  onCancel,
}: CallDeviceSetupModalProps) {
  const { t } = useTranslation();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState<string>('');
  const [videoDeviceId, setVideoDeviceId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const needsAudio = callType.audio;
  const needsVideo = callType.video;
  const isScreenshareOnly = callType.screenshare && !callType.audio && !callType.video;

  const audioDevices = devices.filter((d) => d.kind === 'audioinput');
  const videoDevices = devices.filter((d) => d.kind === 'videoinput');

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await enumerateMediaDevices();
      setDevices(result);

      const firstMic = result.find((d) => d.kind === 'audioinput');
      const firstCam = result.find((d) => d.kind === 'videoinput');
      if (firstMic) setAudioDeviceId(firstMic.deviceId);
      if (firstCam) setVideoDeviceId(firstCam.deviceId);
    } catch {
      setError(t('call.permissionDenied'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open && !isScreenshareOnly) {
      void loadDevices();
    }
    return () => {
      stopPreview();
    };
  }, [open, isScreenshareOnly, loadDevices]);

  useEffect(() => {
    if (!open || !needsVideo || !videoDeviceId) {
      stopPreview();
      return;
    }

    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({
        video: { deviceId: { exact: videoDeviceId } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        stopPreview();
        previewStreamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        // Preview is best-effort
      });

    return () => {
      cancelled = true;
    };
  }, [open, needsVideo, videoDeviceId]);

  function stopPreview() {
    if (previewStreamRef.current) {
      for (const track of previewStreamRef.current.getTracks()) track.stop();
      previewStreamRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }

  const handleConfirm = () => {
    stopPreview();
    onConfirm({
      audioDeviceId: needsAudio ? audioDeviceId || undefined : undefined,
      videoDeviceId: needsVideo ? videoDeviceId || undefined : undefined,
    });
  };

  const handleCancel = () => {
    stopPreview();
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

              {isScreenshareOnly ? (
                <p className="call-device-setup__note">
                  {t('call.screenshareNote')}
                </p>
              ) : (
                <>
                  {needsAudio && (
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
                  )}

                  {needsVideo && (
                    <>
                      <div className="call-device-setup__field">
                        <label htmlFor="call-camera-select">
                          {t('call.selectCamera')}
                        </label>
                        <select
                          id="call-camera-select"
                          value={videoDeviceId}
                          onChange={(e) => setVideoDeviceId(e.target.value)}
                          disabled={loading || videoDevices.length === 0}
                        >
                          {videoDevices.length === 0 && (
                            <option value="">{t('call.noDevicesFound')}</option>
                          )}
                          {videoDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="call-device-setup__preview">
                        <video ref={previewRef} autoPlay muted playsInline />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="call-device-setup__actions">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                {t('call.cancelSetup')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={loading || (!isScreenshareOnly && needsAudio && !audioDeviceId && audioDevices.length > 0)}
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
