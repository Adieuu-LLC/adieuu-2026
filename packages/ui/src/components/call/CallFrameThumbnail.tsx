import { useTranslation } from 'react-i18next';
import { VideoTrack, isTrackReference, type TrackReference } from '@livekit/components-react';
import { Avatar } from '../Avatar';
import {
  getParticipantDisplayName,
  isCameraEnabled,
  type CallFrame,
} from './callFrameTypes';

export interface CallFrameThumbnailProps {
  frame: CallFrame;
  isLocal: boolean;
  isActive: boolean;
  onSelect: () => void;
}

export function CallFrameThumbnail({
  frame,
  isLocal,
  isActive,
  onSelect,
}: CallFrameThumbnailProps) {
  const { t } = useTranslation();
  const { participant, source, trackRef } = frame;
  const displayName = getParticipantDisplayName(participant);
  const isScreen = source === 'screenshare';
  const hasVideo = isScreen
    ? trackRef && isTrackReference(trackRef)
    : isCameraEnabled(participant) && trackRef && isTrackReference(trackRef);

  const label = isScreen
    ? `${displayName} — ${t('call.screenShareLabel')}`
    : displayName;
  const isSpeaking = participant.isSpeaking;

  return (
    <button
      type="button"
      className={`call-conference__thumb${isActive ? ' call-conference__thumb--active' : ''}${isScreen ? ' call-conference__thumb--screen' : ''}${isSpeaking && !isActive ? ' call-conference__thumb--speaking' : ''}`}
      onClick={onSelect}
      aria-label={label}
      aria-pressed={isActive}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef as TrackReference}
          className={`call-conference__thumb-video${isLocal && !isScreen ? ' call-conference__thumb-video--local' : ''}`}
        />
      ) : (
        <Avatar name={displayName} size="sm" />
      )}
      {isScreen && (
        <span className="call-conference__thumb-badge">{t('call.screenShareLabel')}</span>
      )}
    </button>
  );
}
