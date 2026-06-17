import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { VideoTrack, isTrackReference, type TrackReference } from '@livekit/components-react';
import { Avatar } from '../Avatar';
import { Icon } from '../../icons/Icon';
import { Tooltip } from '../Tooltip';
import {
  getParticipantDisplayName,
  isCameraEnabled,
  isMicEnabled,
  isScreenShareEnabled,
  type CallFrame,
} from './callFrameTypes';
import { useTrackAspectRatio } from './useTrackAspectRatio';

function MicOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.34 2.18" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export type CallFrameTileVariant = 'hero' | 'sidebar' | 'grid' | 'stage';

export interface CallFrameTileProps {
  frame: CallFrame;
  isLocal: boolean;
  variant?: CallFrameTileVariant;
  className?: string;
  isPinned?: boolean;
  onTogglePin?: () => void;
  showPinControl?: boolean;
}

export function CallFrameTile({
  frame,
  isLocal,
  variant = 'grid',
  className,
  isPinned = false,
  onTogglePin,
  showPinControl = false,
}: CallFrameTileProps) {
  const { t } = useTranslation();
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { participant, source, trackRef } = frame;
  const displayName = getParticipantDisplayName(participant);
  const hasMic = isMicEnabled(participant);
  const isScreen = source === 'screenshare';
  const canRenderVideo = isScreen
    ? trackRef && isTrackReference(trackRef)
    : isCameraEnabled(participant) && trackRef && isTrackReference(trackRef);
  const showScreenPlaceholder = isScreen && isScreenShareEnabled(participant) && !canRenderVideo;
  const detectPortrait = variant === 'hero' || variant === 'grid' || variant === 'stage';
  const isPortrait = useTrackAspectRatio(videoContainerRef, detectPortrait && !!canRenderVideo);

  const tileClass = [
    'call-conference__tile',
    isLocal && !isScreen ? 'call-conference__tile--local' : '',
    isScreen ? 'call-conference__tile--screen' : '',
    variant === 'hero' || variant === 'stage' ? 'call-conference__tile--stage' : '',
    variant === 'sidebar' ? 'call-conference__tile--sidebar' : '',
    isPortrait ? 'call-conference__tile--portrait' : '',
    isPinned ? 'call-conference__tile--pinned' : '',
    className,
  ].filter(Boolean).join(' ');

  const videoClass = [
    'call-conference__video',
    isPortrait ? 'call-conference__video--portrait' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={tileClass}>
      <div ref={videoContainerRef} className="call-conference__video-wrap">
        {canRenderVideo ? (
          <VideoTrack
            trackRef={trackRef as TrackReference}
            className={videoClass}
          />
        ) : showScreenPlaceholder ? (
          <div className="call-conference__screen-placeholder">
            <Icon name="screenShare" size="lg" />
          </div>
        ) : (
          <div className="call-conference__avatar">
            <Avatar name={displayName} size="xl" />
          </div>
        )}
      </div>

      <div className="call-conference__overlay">
        <span className="call-conference__name">
          {displayName}
          {isLocal ? ` (${t('call.youLabel')})` : ''}
          {isScreen ? ` — ${t('call.screenShareLabel')}` : ''}
        </span>
        {!hasMic && !isScreen && (
          <span className="call-conference__muted-icon" title={t('call.mutedLabel')}>
            <MicOffIcon />
          </span>
        )}
        {showPinControl && onTogglePin && (
          <Tooltip
            content={isPinned ? t('call.unpinFrame') : t('call.pinFrame')}
            position="top"
          >
            <button
              type="button"
              className={`call-conference__pin-btn${isPinned ? ' call-conference__pin-btn--active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePin();
              }}
              aria-label={isPinned ? t('call.unpinFrame') : t('call.pinFrame')}
              aria-pressed={isPinned}
            >
              <Icon name="pin" size="sm" fixedWidth />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
