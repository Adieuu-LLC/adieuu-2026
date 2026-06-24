/**
 * Grid display of call participants with their video/audio state.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../Avatar';
import { Icon } from '../../icons/Icon';

/** Track handle for attaching remote video to a DOM element. */
export interface RemoteTrack {
  id: string;
  trackType: 'audio' | 'video';
  attach: (element: HTMLElement) => void;
  detach: (element: HTMLElement) => void;
}

export interface CallParticipantInfo {
  identityId: string;
  displayName: string;
  avatarUrl?: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreensharing: boolean;
  /** Local participant's camera stream (from getUserMedia). */
  localStream?: MediaStream | null;
  /** Remote participant's video track. */
  remoteVideoTrack?: RemoteTrack | null;
}

export interface CallParticipantGridProps {
  participants: CallParticipantInfo[];
  localIdentityId: string;
}

// ---------------------------------------------------------------------------
// Sub-components for media attachment
// ---------------------------------------------------------------------------

/** Renders the local camera preview via srcObject. */
function LocalVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className="call-participant-video"
    />
  );
}

/** Renders a remote video track by attaching it to a video element. */
function RemoteVideo({ track }: { track: RemoteTrack }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    // biome-ignore lint/a11y/useMediaCaption: live video call stream; captions not applicable
    <video
      ref={ref}
      autoPlay
      playsInline
      className="call-participant-video"
    />
  );
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

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
      {participants.map((p) => {
        const isLocal = p.identityId === localIdentityId;
        const showLocalVideo = isLocal && p.isVideoEnabled && !!p.localStream;
        const showRemoteVideo = !isLocal && p.isVideoEnabled && !!p.remoteVideoTrack;

        return (
          <div
            key={p.identityId}
            className={`call-participant-tile ${isLocal ? 'call-participant-tile--local' : ''}`}
          >
            {showLocalVideo ? (
              <LocalVideo stream={p.localStream!} />
            ) : showRemoteVideo ? (
              <RemoteVideo track={p.remoteVideoTrack!} />
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
                {isLocal ? t('call.you', 'You') : p.displayName}
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
        );
      })}
    </div>
  );
}
