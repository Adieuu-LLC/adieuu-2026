import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from '../Button';
import {
  enumerateMediaDevices,
  isBrowserDefaultDeviceId,
  type MediaDeviceInfo,
} from '../../hooks/useCallMedia';
import {
  getAvMicDeviceId,
  getAvCameraDeviceId,
  getAvSpeakerDeviceId,
  getAvJoinCameraOff,
} from '../../hooks/avPreferenceStorage';
import { CameraPreviewVideo } from './CameraPreviewVideo';

export interface CallDeviceSelection {
  audioDeviceId?: string | null;
  videoDeviceId?: string | null;
  speakerDeviceId?: string | null;
}

export interface CallDeviceSetupModalProps {
  open: boolean;
  /** Conversation call start vs join; ignored when `variant` is `voice`. */
  isJoin?: boolean;
  /** Affects confirm button copy. */
  variant?: 'call' | 'voice';
  onConfirm: (devices: CallDeviceSelection) => void;
  onCancel: () => void;
}

function pickInitialDeviceId(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceInfo['kind'],
  saved: string | null,
): string {
  if (saved && !isBrowserDefaultDeviceId(saved)) {
    const match = devices.find((d) => d.kind === kind && d.deviceId === saved);
    if (match) return match.deviceId;
  }
  return '';
}

export function CallDeviceSetupModal({
  open,
  isJoin = true,
  variant = 'call',
  onConfirm,
  onCancel,
}: CallDeviceSetupModalProps) {
  const { t } = useTranslation();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [speakerDeviceId, setSpeakerDeviceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewGenRef = useRef(0);

  const showCameraPreview = !getAvJoinCameraOff();

  const audioDevices = devices.filter((d) => d.kind === 'audioinput');
  const videoDevices = devices.filter((d) => d.kind === 'videoinput');
  const speakerDevices = devices.filter((d) => d.kind === 'audiooutput');
  const supportsSinkId =
    typeof document !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  const stopPreview = useCallback(() => {
    previewGenRef.current += 1;
    if (previewStreamRef.current) {
      for (const track of previewStreamRef.current.getTracks()) track.stop();
      previewStreamRef.current = null;
    }
    setPreviewStream(null);
  }, []);

  const startPreview = useCallback(async (cameraId: string) => {
    if (!showCameraPreview) {
      stopPreview();
      return;
    }
    const gen = previewGenRef.current + 1;
    previewGenRef.current = gen;
    if (previewStreamRef.current) {
      for (const track of previewStreamRef.current.getTracks()) track.stop();
      previewStreamRef.current = null;
    }
    setPreviewStream(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(cameraId ? { deviceId: { ideal: cameraId } } : {}),
        },
        audio: false,
      });
      if (gen !== previewGenRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      previewStreamRef.current = stream;
      setPreviewStream(stream);
    } catch {
      if (gen !== previewGenRef.current) return;
      previewStreamRef.current = null;
      setPreviewStream(null);
    }
  }, [showCameraPreview, stopPreview]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await enumerateMediaDevices();
      setDevices(result);

      const nextMic = pickInitialDeviceId(result, 'audioinput', getAvMicDeviceId());
      const nextCam = pickInitialDeviceId(result, 'videoinput', getAvCameraDeviceId());
      const nextSpeaker = pickInitialDeviceId(result, 'audiooutput', getAvSpeakerDeviceId());
      setAudioDeviceId(nextMic);
      setVideoDeviceId(nextCam);
      setSpeakerDeviceId(nextSpeaker);

      if (showCameraPreview) {
        void startPreview(nextCam);
      }
    } catch {
      setAudioDeviceId('');
      setVideoDeviceId('');
      setSpeakerDeviceId('');
      setDevices([]);
      setError(t('call.permissionDenied'));
      stopPreview();
    } finally {
      setLoading(false);
    }
  }, [t, showCameraPreview, startPreview, stopPreview]);

  useEffect(() => {
    if (open) {
      void loadDevices();
    } else {
      stopPreview();
    }
    return () => stopPreview();
  }, [open, loadDevices, stopPreview]);

  const handleConfirm = () => {
    stopPreview();
    onConfirm({
      audioDeviceId: audioDeviceId || null,
      videoDeviceId: videoDeviceId || null,
      speakerDeviceId: speakerDeviceId || null,
    });
  };

  const handleCancel = () => {
    stopPreview();
    onCancel();
  };

  const confirmLabel =
    variant === 'voice'
      ? t('call.confirmJoinVoice')
      : isJoin
        ? t('call.confirmJoin')
        : t('call.confirmCall');

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
                  <Button variant="ghost" size="sm" onClick={() => void loadDevices()}>
                    {t('call.retryPermission')}
                  </Button>
                </div>
              )}

              <div className="call-device-setup__field">
                <label htmlFor="call-mic-select">{t('call.selectMicrophone')}</label>
                <select
                  id="call-mic-select"
                  value={audioDeviceId}
                  onChange={(e) => setAudioDeviceId(e.target.value)}
                  disabled={loading}
                >
                  <option value="">{t('call.systemDefault')}</option>
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="call-device-setup__field">
                <label htmlFor="call-speaker-select">{t('call.selectSpeaker')}</label>
                <select
                  id="call-speaker-select"
                  value={speakerDeviceId}
                  onChange={(e) => setSpeakerDeviceId(e.target.value)}
                  disabled={loading || !supportsSinkId}
                >
                  <option value="">{t('call.systemDefault')}</option>
                  {speakerDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {!supportsSinkId && (
                  <p className="call-device-setup__note">{t('call.speakerUnsupported')}</p>
                )}
              </div>

              <div className="call-device-setup__field">
                <label htmlFor="call-camera-select">{t('call.selectCamera')}</label>
                <select
                  id="call-camera-select"
                  value={videoDeviceId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setVideoDeviceId(next);
                    if (showCameraPreview) void startPreview(next);
                  }}
                  disabled={loading}
                >
                  <option value="">{t('call.systemDefault')}</option>
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {showCameraPreview && (
                <div className="call-device-setup__preview">
                  {previewStream ? (
                    <div className="call-device-setup__preview-mirror">
                      <CameraPreviewVideo
                        stream={previewStream}
                        className="call-device-setup__preview-video"
                      />
                    </div>
                  ) : (
                    <p className="call-device-setup__preview-placeholder">
                      {t('call.cameraPreviewIdle')}
                    </p>
                  )}
                </div>
              )}

              <p className="call-device-setup__note">
                {showCameraPreview
                  ? t('call.deviceSetupHintWithCamera')
                  : t('call.deviceSetupHint')}
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
                disabled={loading}
              >
                {confirmLabel}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
