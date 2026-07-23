/**
 * Identity-level Audio & Video settings.
 *
 * Lets the user pick default microphone / camera / speakers and set input and
 * output levels used when joining calls and Space voice channels. Preferences
 * are client-side / localStorage (device-scoped) but live under the Identity
 * menu for organisational clarity, mirroring Notifications.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import { SectionNav, type NavSection } from '../../components/SectionNav';
import { useIdentity } from '../../hooks/useIdentity';
import {
  enumerateMediaDevices,
  isBrowserDefaultDeviceId,
  type MediaDeviceInfo,
} from '../../hooks/useCallMedia';
import { useAvPreferences } from '../../hooks/useAvPreferences';
import {
  MAX_AV_GAIN,
  setAvMicDeviceId,
  setAvCameraDeviceId,
  setAvSpeakerDeviceId,
  setAvInputVolume,
  setAvOutputVolume,
} from '../../hooks/avPreferenceStorage';
import {
  DEFAULT_CALL_RINGTONE_SOUND_ID,
  getBuiltinNotificationSoundSrc,
} from '../../constants/builtinNotificationSounds';

type AudioElementWithSink = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

/** Attaches a live camera stream to a video element (same pattern as call local preview). */
function CameraPreviewVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;

    const tryPlay = () => {
      void el.play().catch(() => {});
    };

    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay();
    } else {
      el.addEventListener('loadeddata', tryPlay, { once: true });
    }

    return () => {
      el.removeEventListener('loadeddata', tryPlay);
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      controls={false}
      className="app-settings-av-preview-video"
    />
  );
}

export function IdentityAudioVideo() {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const prefs = useAvPreferences();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permissionError, setPermissionError] = useState(false);
  const [loading, setLoading] = useState(false);

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setPermissionError(false);
    try {
      const result = await enumerateMediaDevices();
      setDevices(result);
    } catch {
      setDevices([]);
      setPermissionError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (identityStatus !== 'logged_in') return;
    void loadDevices();
    const onChange = () => void loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
    };
  }, [identityStatus, loadDevices]);

  // ---- Microphone test (live level meter) ----

  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRafRef = useRef<number | null>(null);

  const stopMicTest = useCallback(() => {
    if (micRafRef.current !== null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) track.stop();
      micStreamRef.current = null;
    }
    if (micCtxRef.current) {
      void micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
    setMicLevel(0);
    setMicTesting(false);
  }, []);

  const startMicTest = useCallback(async () => {
    try {
      const micId =
        prefs.micDeviceId && !isBrowserDefaultDeviceId(prefs.micDeviceId)
          ? prefs.micDeviceId
          : null;
      const constraints: MediaStreamConstraints = {
        audio: micId ? { deviceId: { exact: micId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      setMicTesting(true);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = ((data[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const scaled = Math.min(1, rms * 2.5 * prefs.inputVolume);
        setMicLevel(scaled);
        micRafRef.current = requestAnimationFrame(tick);
      };
      micRafRef.current = requestAnimationFrame(tick);
    } catch {
      setPermissionError(true);
      stopMicTest();
    }
  }, [prefs.micDeviceId, prefs.inputVolume, stopMicTest]);

  useEffect(() => stopMicTest, [stopMicTest]);

  // Stop an in-progress mic test when the selected device changes.
  useEffect(() => {
    stopMicTest();
  }, [prefs.micDeviceId, stopMicTest]);

  // ---- Camera live preview (button-triggered) ----

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraPreviewGenRef = useRef(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraPreviewError, setCameraPreviewError] = useState(false);
  const cameraPreviewing = cameraStream !== null;

  const stopCameraPreview = useCallback(() => {
    cameraPreviewGenRef.current += 1;
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) track.stop();
      cameraStreamRef.current = null;
    }
    setCameraStream(null);
  }, []);

  const startCameraPreview = useCallback(async () => {
    const gen = cameraPreviewGenRef.current + 1;
    cameraPreviewGenRef.current = gen;
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) track.stop();
      cameraStreamRef.current = null;
    }
    setCameraStream(null);
    setCameraPreviewError(false);
    try {
      const cameraId =
        prefs.cameraDeviceId && !isBrowserDefaultDeviceId(prefs.cameraDeviceId)
          ? prefs.cameraDeviceId
          : null;
      // Prefer ideal (not exact) + explicit size — avoids black frames on some
      // Linux/PipeWire stacks when only a deviceId constraint is supplied.
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        ...(cameraId ? { deviceId: { ideal: cameraId } } : {}),
      };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      if (gen !== cameraPreviewGenRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      for (const track of stream.getVideoTracks()) {
        track.enabled = true;
      }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch {
      if (gen !== cameraPreviewGenRef.current) return;
      setPermissionError(true);
      setCameraPreviewError(true);
      cameraStreamRef.current = null;
      setCameraStream(null);
    }
  }, [prefs.cameraDeviceId]);

  useEffect(() => stopCameraPreview, [stopCameraPreview]);

  // Stop preview when the selected camera changes; user can start again.
  useEffect(() => {
    stopCameraPreview();
  }, [prefs.cameraDeviceId, stopCameraPreview]);

  // ---- Speaker test (default ringtone through selected output) ----

  const playTestTone = useCallback(async () => {
    try {
      const src = getBuiltinNotificationSoundSrc(DEFAULT_CALL_RINGTONE_SOUND_ID);
      const ctx = new AudioContext();
      const res = await fetch(src);
      if (!res.ok) {
        void ctx.close().catch(() => {});
        return;
      }
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(MAX_AV_GAIN, Math.max(0, prefs.outputVolume));

      // Route through an <audio> element so setSinkId can target the chosen speakers.
      const dest = ctx.createMediaStreamDestination();
      source.connect(gain).connect(dest);

      const audio = new Audio() as AudioElementWithSink;
      audio.srcObject = dest.stream;
      const speakerId =
        prefs.speakerDeviceId && !isBrowserDefaultDeviceId(prefs.speakerDeviceId)
          ? prefs.speakerDeviceId
          : null;
      if (speakerId && typeof audio.setSinkId === 'function') {
        try {
          await audio.setSinkId(speakerId);
        } catch {
          /* fall back to default output */
        }
      }
      await audio.play().catch(() => {});
      source.start();

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        audio.pause();
        audio.srcObject = null;
        void ctx.close().catch(() => {});
      };
      source.onended = cleanup;
      window.setTimeout(cleanup, Math.ceil(buffer.duration * 1000) + 500);
    } catch {
      /* ignore */
    }
  }, [prefs.outputVolume, prefs.speakerDeviceId]);

  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  const videoInputs = devices.filter((d) => d.kind === 'videoinput');
  const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
  const supportsSinkId =
    typeof document !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  /** Map stored browser pseudo-ids to the System default option. */
  const selectDeviceId = (id: string | null): string =>
    !id || isBrowserDefaultDeviceId(id) ? '' : id;

  const sections: NavSection[] = [
    { id: 'input', label: t('identity.audioVideo.sections.input') },
    { id: 'output', label: t('identity.audioVideo.sections.output') },
    { id: 'camera', label: t('identity.audioVideo.sections.camera') },
    { id: 'advanced', label: t('identity.audioVideo.sections.advanced') },
  ];

  const maxPercent = Math.round(MAX_AV_GAIN * 100);

  if (identityStatus !== 'logged_in') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('identity.audioVideo.title')}</h1>
          </div>
          <Alert variant="warning">{t('identity.audioVideo.notLoggedIn')}</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('identity.audioVideo.title')}</h1>
          <p className="page-subtitle">{t('identity.audioVideo.subtitle')}</p>
        </div>

        <div className="appearance-layout">
          <SectionNav
            sections={sections}
            sectionRefs={sectionRefs}
            ariaLabel={t('identity.audioVideo.title')}
          />

          <div className="appearance-sections">
            {permissionError && (
              <Alert variant="warning" className="app-settings-alert">
                {t('identity.audioVideo.permissionDenied')}
              </Alert>
            )}

            <Card
              variant="elevated"
              className="slide-up app-settings-card app-settings-card-sound"
              ref={(el) => setSectionRef('input', el)}
              data-section="input"
            >
              <h2 className="app-settings-section-title">{t('identity.audioVideo.inputTitle')}</h2>
              <p className="app-settings-section-desc">{t('identity.audioVideo.inputDescription')}</p>

              <div className="app-settings-av-field">
                <label htmlFor="av-mic-select">{t('identity.audioVideo.microphoneLabel')}</label>
                <select
                  id="av-mic-select"
                  value={selectDeviceId(prefs.micDeviceId)}
                  disabled={loading}
                  onChange={(e) => setAvMicDeviceId(e.target.value || null)}
                >
                  <option value="">{t('identity.audioVideo.systemDefault')}</option>
                  {audioInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="app-settings-test-notification">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading}
                  onClick={() => void loadDevices()}
                >
                  {t('identity.audioVideo.refresh')}
                </button>
                <span className="app-settings-test-notification-hint">
                  {t('identity.audioVideo.permissionHint')}
                </span>
              </div>

              <div className="app-settings-sound-volume">
                <label htmlFor="av-input-volume" className="app-settings-sound-volume-label">
                  {t('identity.audioVideo.inputVolumeLabel')}
                </label>
                <div className="app-settings-sound-volume-row">
                  <input
                    id="av-input-volume"
                    type="range"
                    className="app-settings-sound-volume-slider"
                    min={0}
                    max={maxPercent}
                    step={1}
                    value={Math.round(prefs.inputVolume * 100)}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setAvInputVolume(parseInt(e.target.value, 10) / 100)
                    }
                    aria-valuemin={0}
                    aria-valuemax={maxPercent}
                    aria-valuenow={Math.round(prefs.inputVolume * 100)}
                    aria-valuetext={`${Math.round(prefs.inputVolume * 100)}%`}
                  />
                  <span className="app-settings-sound-volume-value" aria-hidden>
                    {Math.round(prefs.inputVolume * 100)}%
                  </span>
                </div>
                <p className="app-settings-sound-volume-hint">{t('identity.audioVideo.inputVolumeHint')}</p>
              </div>

              <div className="app-settings-av-meter">
                <span className="app-settings-av-meter-label">{t('identity.audioVideo.testMicLevelLabel')}</span>
                <div className="app-settings-av-meter-track" aria-hidden>
                  <div
                    className="app-settings-av-meter-fill"
                    style={{ width: `${Math.round(micLevel * 100)}%` }}
                  />
                </div>
              </div>

              <div className="app-settings-test-notification">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => (micTesting ? stopMicTest() : void startMicTest())}
                >
                  {micTesting ? t('identity.audioVideo.testMicStop') : t('identity.audioVideo.testMicStart')}
                </button>
              </div>
            </Card>

            <Card
              variant="elevated"
              className="slide-up app-settings-card app-settings-card-sound"
              ref={(el) => setSectionRef('output', el)}
              data-section="output"
            >
              <h2 className="app-settings-section-title">{t('identity.audioVideo.outputTitle')}</h2>
              <p className="app-settings-section-desc">{t('identity.audioVideo.outputDescription')}</p>

              <div className="app-settings-av-field">
                <label htmlFor="av-speaker-select">{t('identity.audioVideo.speakerLabel')}</label>
                <select
                  id="av-speaker-select"
                  value={selectDeviceId(prefs.speakerDeviceId)}
                  disabled={loading || !supportsSinkId}
                  onChange={(e) => setAvSpeakerDeviceId(e.target.value || null)}
                >
                  <option value="">{t('identity.audioVideo.systemDefault')}</option>
                  {audioOutputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {!supportsSinkId && (
                  <p className="app-settings-sound-volume-hint">
                    {t('identity.audioVideo.speakerUnsupported')}
                  </p>
                )}
              </div>

              <div className="app-settings-test-notification">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading}
                  onClick={() => void loadDevices()}
                >
                  {t('identity.audioVideo.refresh')}
                </button>
              </div>

              <div className="app-settings-sound-volume">
                <label htmlFor="av-output-volume" className="app-settings-sound-volume-label">
                  {t('identity.audioVideo.outputVolumeLabel')}
                </label>
                <div className="app-settings-sound-volume-row">
                  <input
                    id="av-output-volume"
                    type="range"
                    className="app-settings-sound-volume-slider"
                    min={0}
                    max={maxPercent}
                    step={1}
                    value={Math.round(prefs.outputVolume * 100)}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setAvOutputVolume(parseInt(e.target.value, 10) / 100)
                    }
                    aria-valuemin={0}
                    aria-valuemax={maxPercent}
                    aria-valuenow={Math.round(prefs.outputVolume * 100)}
                    aria-valuetext={`${Math.round(prefs.outputVolume * 100)}%`}
                  />
                  <span className="app-settings-sound-volume-value" aria-hidden>
                    {Math.round(prefs.outputVolume * 100)}%
                  </span>
                </div>
                <p className="app-settings-sound-volume-hint">{t('identity.audioVideo.outputVolumeHint')}</p>
              </div>

              <div className="app-settings-test-notification">
                <button type="button" className="btn btn-secondary" onClick={() => void playTestTone()}>
                  {t('identity.audioVideo.testSpeaker')}
                </button>
              </div>
            </Card>

            <Card
              variant="elevated"
              className="slide-up app-settings-card"
              ref={(el) => setSectionRef('camera', el)}
              data-section="camera"
            >
              <h2 className="app-settings-section-title">{t('identity.audioVideo.cameraTitle')}</h2>
              <p className="app-settings-section-desc">{t('identity.audioVideo.cameraDescription')}</p>

              <div className="app-settings-av-field">
                <label htmlFor="av-camera-select">{t('identity.audioVideo.cameraLabel')}</label>
                <select
                  id="av-camera-select"
                  value={selectDeviceId(prefs.cameraDeviceId)}
                  disabled={loading}
                  onChange={(e) => setAvCameraDeviceId(e.target.value || null)}
                >
                  <option value="">{t('identity.audioVideo.systemDefault')}</option>
                  {videoInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="app-settings-test-notification">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading}
                  onClick={() => void loadDevices()}
                >
                  {t('identity.audioVideo.refresh')}
                </button>
                <span className="app-settings-test-notification-hint">
                  {t('identity.audioVideo.permissionHint')}
                </span>
              </div>

              <div className="app-settings-av-preview">
                <span className="app-settings-av-preview-label">
                  {t('identity.audioVideo.cameraPreviewLabel')}
                </span>
                <div
                  className={`app-settings-av-preview-frame${cameraPreviewing ? ' is-live' : ''}`}
                >
                  {cameraStream ? (
                    <div className="app-settings-av-preview-mirror">
                      <CameraPreviewVideo stream={cameraStream} />
                    </div>
                  ) : (
                    <p className="app-settings-av-preview-placeholder">
                      {cameraPreviewError
                        ? t('identity.audioVideo.cameraPreviewError')
                        : t('identity.audioVideo.cameraPreviewIdle')}
                    </p>
                  )}
                </div>
              </div>

              <div className="app-settings-test-notification">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    cameraPreviewing ? stopCameraPreview() : void startCameraPreview()
                  }
                >
                  {cameraPreviewing
                    ? t('identity.audioVideo.cameraPreviewStop')
                    : t('identity.audioVideo.cameraPreviewStart')}
                </button>
              </div>
            </Card>

            <Card
              variant="elevated"
              className="slide-up app-settings-card"
              ref={(el) => setSectionRef('advanced', el)}
              data-section="advanced"
            >
              <h2 className="app-settings-section-title">{t('identity.audioVideo.advancedTitle')}</h2>
              <p className="app-settings-section-desc">{t('identity.audioVideo.advancedDescription')}</p>

              <label className="app-settings-toggle app-settings-toggle--disabled">
                <input type="checkbox" checked={false} disabled />
                <span className="app-settings-toggle-label">
                  <span className="app-settings-toggle-title">{t('identity.audioVideo.noiseSuppression')}</span>
                  <span className="app-settings-toggle-hint">{t('identity.audioVideo.noiseSuppressionHint')}</span>
                </span>
              </label>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
