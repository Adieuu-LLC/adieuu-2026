/**
 * Compact in-call control strip (mic, camera, screen share, deafen) rendered
 * inside the sidebar call widget for both conversation calls and Space voice.
 *
 * Toggles operate on the active LiveKit room via `useActiveCallControls`.
 * When `onMediaChange` is provided (Space voice) it is called with the latest
 * local media state so presence can be kept in sync.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../icons/Icon';
import { useActiveCallControls } from '../../hooks/useActiveCallControls';

export interface CallControlsRowProps {
  className?: string;
  onMediaChange?: (state: {
    micEnabled: boolean;
    cameraEnabled: boolean;
    screenShareEnabled: boolean;
  }) => void;
}

export function CallControlsRow({ className, onMediaChange }: CallControlsRowProps) {
  const { t } = useTranslation();
  const {
    hasRoom,
    micEnabled,
    cameraEnabled,
    screenShareEnabled,
    deafened,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    toggleDeafen,
  } = useActiveCallControls();

  const onMediaChangeRef = useRef(onMediaChange);
  onMediaChangeRef.current = onMediaChange;

  useEffect(() => {
    if (!hasRoom) return;
    onMediaChangeRef.current?.({ micEnabled, cameraEnabled, screenShareEnabled });
  }, [hasRoom, micEnabled, cameraEnabled, screenShareEnabled]);

  const rowClass = ['call-controls-row', className].filter(Boolean).join(' ');

  return (
    <div className={rowClass} role="group" aria-label={t('call.controlsLabel')}>
      <button
        type="button"
        className={`call-controls-row__btn${micEnabled ? ' call-controls-row__btn--active' : ' call-controls-row__btn--muted'}`}
        onClick={() => void toggleMic()}
        disabled={!hasRoom}
        aria-pressed={!micEnabled}
        title={micEnabled ? t('call.muteAudio') : t('call.unmuteAudio')}
        aria-label={micEnabled ? t('call.muteAudio') : t('call.unmuteAudio')}
      >
        <Icon name={micEnabled ? 'microphone' : 'microphoneSlash'} size="sm" />
      </button>

      <button
        type="button"
        className={`call-controls-row__btn${cameraEnabled ? ' call-controls-row__btn--active' : ' call-controls-row__btn--off'}`}
        onClick={() => void toggleCamera()}
        disabled={!hasRoom}
        aria-pressed={cameraEnabled}
        title={cameraEnabled ? t('call.disableVideo') : t('call.enableVideo')}
        aria-label={cameraEnabled ? t('call.disableVideo') : t('call.enableVideo')}
      >
        <Icon name={cameraEnabled ? 'video' : 'videoSlash'} size="sm" />
      </button>

      <button
        type="button"
        className={`call-controls-row__btn${screenShareEnabled ? ' call-controls-row__btn--active' : ' call-controls-row__btn--off'}`}
        onClick={() => void toggleScreenShare()}
        disabled={!hasRoom}
        aria-pressed={screenShareEnabled}
        title={screenShareEnabled ? t('call.stopScreenshare') : t('call.startScreenshareControl')}
        aria-label={screenShareEnabled ? t('call.stopScreenshare') : t('call.startScreenshareControl')}
      >
        <Icon name="screenShare" size="sm" />
      </button>

      <button
        type="button"
        className={`call-controls-row__btn${deafened ? ' call-controls-row__btn--muted' : ' call-controls-row__btn--active'}`}
        onClick={() => void toggleDeafen()}
        disabled={!hasRoom}
        aria-pressed={deafened}
        title={deafened ? t('call.undeafen') : t('call.deafen')}
        aria-label={deafened ? t('call.undeafen') : t('call.deafen')}
      >
        <Icon name={deafened ? 'volumeMute' : 'volumeHigh'} size="sm" />
      </button>
    </div>
  );
}
