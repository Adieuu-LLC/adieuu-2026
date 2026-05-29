/**
 * Call control bar for managing audio, video, screenshare, and call lifecycle.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { Icon } from '../../icons/Icon';

export interface CallControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreensharing: boolean;
  audioAllowed: boolean;
  videoAllowed: boolean;
  screenshareAllowed: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenshare: () => void;
  onLeave: () => void;
  onEnd?: () => void;
}

export function CallControls({
  isAudioEnabled,
  isVideoEnabled,
  isScreensharing,
  audioAllowed,
  videoAllowed,
  screenshareAllowed,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenshare,
  onLeave,
  onEnd,
}: CallControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="call-controls">
      {audioAllowed && (
        <Button
          variant="ghost"
          size="sm"
          className={`call-control-btn ${isAudioEnabled ? '' : 'call-control-btn--muted'}`}
          onClick={onToggleAudio}
          title={isAudioEnabled
            ? t('call.muteAudio', 'Mute')
            : t('call.unmuteAudio', 'Unmute')}
        >
          <Icon name={isAudioEnabled ? 'microphone' : 'microphoneSlash'} />
        </Button>
      )}

      {videoAllowed && (
        <Button
          variant="ghost"
          size="sm"
          className={`call-control-btn ${isVideoEnabled ? '' : 'call-control-btn--muted'}`}
          onClick={onToggleVideo}
          title={isVideoEnabled
            ? t('call.disableVideo', 'Turn off camera')
            : t('call.enableVideo', 'Turn on camera')}
        >
          <Icon name={isVideoEnabled ? 'video' : 'videoSlash'} />
        </Button>
      )}

      {screenshareAllowed && (
        <Button
          variant="ghost"
          size="sm"
          className={`call-control-btn ${isScreensharing ? 'call-control-btn--active' : ''}`}
          onClick={onToggleScreenshare}
          title={isScreensharing
            ? t('call.stopScreenshare', 'Stop sharing')
            : t('call.startScreenshare', 'Share screen')}
        >
          <Icon name="screenShare" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="call-control-btn call-control-btn--leave"
        onClick={onLeave}
        title={t('call.leave', 'Leave call')}
      >
        <Icon name="phoneHangup" />
      </Button>

      {onEnd && (
        <Button
          variant="ghost"
          size="sm"
          className="call-control-btn call-control-btn--end"
          onClick={onEnd}
          title={t('call.end', 'End call for everyone')}
        >
          <Icon name="phoneHangup" />
          <span className="call-control-label">{t('call.endForAll', 'End')}</span>
        </Button>
      )}
    </div>
  );
}
