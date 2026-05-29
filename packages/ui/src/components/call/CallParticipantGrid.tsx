/**
 * Grid display of call participants with their video/audio state.
 */

import { useTranslation } from 'react-i18next';
import { Avatar } from '../Avatar';
import { Icon } from '../../icons/Icon';

export interface CallParticipantInfo {
  identityId: string;
  displayName: string;
  avatarUrl?: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreensharing: boolean;
  videoElement?: HTMLVideoElement | null;
}

export interface CallParticipantGridProps {
  participants: CallParticipantInfo[];
  localIdentityId: string;
}

export function CallParticipantGrid({
  participants,
  localIdentityId,
}: CallParticipantGridProps) {
  const { t } = useTranslation();

  const gridClass =
    participants.length <= 1
      ? 'call-grid call-grid--single'
      : participants.length <= 4
        ? 'call-grid call-grid--small'
        : 'call-grid call-grid--large';

  return (
    <div className={gridClass}>
      {participants.map((p) => (
        <div
          key={p.identityId}
          className={`call-participant-tile ${p.identityId === localIdentityId ? 'call-participant-tile--local' : ''}`}
        >
          {p.isVideoEnabled && p.videoElement ? (
            <video
              ref={(el) => {
                if (el && p.videoElement) {
                  el.srcObject = p.videoElement.srcObject;
                }
              }}
              autoPlay
              playsInline
              muted={p.identityId === localIdentityId}
              className="call-participant-video"
            />
          ) : (
            <div className="call-participant-avatar">
              <Avatar
                name={p.displayName}
                src={p.avatarUrl}
                size="lg"
              />
            </div>
          )}

          <div className="call-participant-info">
            <span className="call-participant-name">
              {p.identityId === localIdentityId
                ? t('call.you', 'You')
                : p.displayName}
            </span>
            <div className="call-participant-indicators">
              {!p.isAudioEnabled && (
                <span className="call-indicator call-indicator--muted" title={t('call.muted', 'Muted')}>
                  <Icon name="microphoneSlash" size="xs" />
                </span>
              )}
              {p.isScreensharing && (
                <span className="call-indicator call-indicator--sharing" title={t('call.sharing', 'Sharing screen')}>
                  <Icon name="screenShare" size="xs" />
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
