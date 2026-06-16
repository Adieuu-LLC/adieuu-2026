/**
 * Custom call conference UI.
 *
 * Replaces LiveKit's VideoConference prefab to always show participant tiles
 * (with avatars and display names) even in audio-only calls.
 * Uses LiveKit hooks and the ControlBar prefab for media controls.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useParticipants,
  useLocalParticipant,
  useTracks,
  ControlBar,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { Track, VideoQuality } from 'livekit-client';
import type { Participant, RemoteTrackPublication } from 'livekit-client';
import { Avatar } from '../Avatar';
import { InfoTip } from '../InfoTip';
import { Icon } from '../../icons/Icon';
import { useCallSession } from '../../hooks/useCallSession';
import { useIsMobile } from '../../hooks/useIsMobile';

const E2EE_STATUS_INFO_ROWS = [
  { labelKey: 'call.e2eeActive', infoKey: 'call.e2eeStatusInfoActive' },
  { labelKey: 'call.e2eeFailed', infoKey: 'call.e2eeStatusInfoFailed' },
  { labelKey: 'call.e2eeNotSupported', infoKey: 'call.e2eeStatusInfoNotSupported' },
] as const;

function getParticipantDisplayName(participant: Participant): string {
  return participant.name || participant.identity || 'Unknown';
}

function isCameraEnabled(participant: Participant): boolean {
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  return camPub !== undefined && !camPub.isMuted && camPub.isSubscribed !== false;
}

function isScreenShareEnabled(participant: Participant): boolean {
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  return screenPub !== undefined && !screenPub.isMuted && screenPub.isSubscribed !== false;
}

function isMicEnabled(participant: Participant): boolean {
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  return micPub !== undefined && !micPub.isMuted;
}

interface ParticipantTileProps {
  participant: Participant;
  videoTrackRef?: TrackReferenceOrPlaceholder;
  isLocal: boolean;
  className?: string;
}

function ParticipantTile({ participant, videoTrackRef, isLocal, className }: ParticipantTileProps) {
  const displayName = getParticipantDisplayName(participant);
  const hasVideo = isCameraEnabled(participant);
  const hasMic = isMicEnabled(participant);
  const canRenderVideo = hasVideo && videoTrackRef && isTrackReference(videoTrackRef);
  const tileClass = [
    'call-conference__tile',
    isLocal ? 'call-conference__tile--local' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={tileClass}>
      {canRenderVideo ? (
        <VideoTrack
          trackRef={videoTrackRef}
          className="call-conference__video"
        />
      ) : (
        <div className="call-conference__avatar">
          <Avatar
            name={displayName}
            size="xl"
          />
        </div>
      )}

      <div className="call-conference__overlay">
        <span className="call-conference__name">
          {displayName}{isLocal ? ' (You)' : ''}
        </span>
        {!hasMic && (
          <span className="call-conference__muted-icon" title="Muted">
            <MicOffIcon />
          </span>
        )}
      </div>
    </div>
  );
}

interface ParticipantThumbnailProps {
  participant: Participant;
  videoTrackRef?: TrackReferenceOrPlaceholder;
  isLocal: boolean;
  isActive: boolean;
  onSelect: () => void;
}

function ParticipantThumbnail({
  participant,
  videoTrackRef,
  isLocal,
  isActive,
  onSelect,
}: ParticipantThumbnailProps) {
  const displayName = getParticipantDisplayName(participant);
  const hasVideo = isCameraEnabled(participant);
  const canRenderVideo = hasVideo && videoTrackRef && isTrackReference(videoTrackRef);

  return (
    <button
      type="button"
      className={`call-conference__thumb${isActive ? ' call-conference__thumb--active' : ''}`}
      onClick={onSelect}
      aria-label={displayName}
      aria-pressed={isActive}
    >
      {canRenderVideo ? (
        <VideoTrack
          trackRef={videoTrackRef}
          className={`call-conference__thumb-video${isLocal ? ' call-conference__thumb-video--local' : ''}`}
        />
      ) : (
        <Avatar name={displayName} size="sm" />
      )}
    </button>
  );
}

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

/**
 * Maps a resolution height to the best-fit LiveKit VideoQuality tier
 * for receive-side simulcast layer selection.
 */
function resolutionToVideoQuality(height: number): VideoQuality {
  if (height >= 1080) return VideoQuality.HIGH;
  if (height >= 720) return VideoQuality.MEDIUM;
  return VideoQuality.LOW;
}

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UnlockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 4.33 2.5" />
    </svg>
  );
}

function E2EEStatusInfoTip() {
  const { t } = useTranslation();

  return (
    <InfoTip
      mode="popover"
      position="bottom"
      className="call-e2ee-info-tooltip"
      content={
        <ul className="call-e2ee-info-list">
          {E2EE_STATUS_INFO_ROWS.map(({ labelKey, infoKey }) => (
            <li key={infoKey}>
              <strong>{t(labelKey)}</strong>
              {': '}
              {t(infoKey)}
            </li>
          ))}
        </ul>
      }
    >
      <span
        className="call-conference__e2ee-info-icon"
        aria-label={t('call.e2eeStatusInfoLabel')}
      >
        <Icon name="info" size="sm" />
      </span>
    </InfoTip>
  );
}

function E2EEStatusBanner({
  e2eeActive,
  e2eeSupported,
  onTroubleshoot,
}: {
  e2eeActive: boolean;
  e2eeSupported: boolean;
  onTroubleshoot?: () => void;
}) {
  const { t } = useTranslation();

  const statusMessage = e2eeActive
    ? t('call.e2eeActive')
    : e2eeSupported
      ? t('call.e2eeFailed')
      : t('call.e2eeNotSupported');

  const bannerClass = e2eeActive
    ? 'call-conference__e2ee-badge call-conference__e2ee-badge--active'
    : 'call-conference__e2ee-banner call-conference__e2ee-banner--warning';

  return (
    <div
      className={bannerClass}
      role={e2eeActive ? undefined : 'alert'}
    >
      <div className="call-conference__e2ee-status">
        {e2eeActive ? <LockIcon /> : <UnlockIcon />}
        <span>{statusMessage}</span>
        <E2EEStatusInfoTip />
      </div>
      {onTroubleshoot && (
        <button
          type="button"
          className="active-call-banner__troubleshoot"
          onClick={onTroubleshoot}
        >
          {t('call.troubleshootLink')}
        </button>
      )}
    </div>
  );
}

export interface CallConferenceViewProps {
  e2eeActive?: boolean;
  onTroubleshoot?: () => void;
}

export function CallConferenceView({ e2eeActive = false, onTroubleshoot }: CallConferenceViewProps) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const { streamQualityCaps, e2eeSupported } = useCallSession();
  const isMobile = useIsMobile();
  const [focusedIdentity, setFocusedIdentity] = useState(localParticipant.identity);

  useEffect(() => {
    setFocusedIdentity((current) => {
      if (participants.some((participant) => participant.identity === current)) {
        return current;
      }
      return localParticipant.identity;
    });
  }, [participants, localParticipant.identity]);

  const useMobileFocusLayout = isMobile && participants.length > 1;

  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const screenTracks = useTracks(
    [Track.Source.ScreenShare],
    { onlySubscribed: false },
  );

  // Apply receive-side quality caps on remote video subscriptions.
  // Maps our resolution cap to a LiveKit VideoQuality tier to limit
  // the simulcast layer the SFU sends, reducing egress bandwidth.
  useEffect(() => {
    if (!streamQualityCaps) return;

    const cameraQuality = resolutionToVideoQuality(streamQualityCaps.camera.height);
    const screenQuality = resolutionToVideoQuality(streamQualityCaps.screenshare.height);

    for (const trackRef of cameraTracks) {
      if (
        trackRef.participant &&
        trackRef.participant.identity !== localParticipant.identity &&
        isTrackReference(trackRef)
      ) {
        const pub = trackRef.publication as RemoteTrackPublication | undefined;
        pub?.setVideoQuality(cameraQuality);
      }
    }
    for (const trackRef of screenTracks) {
      if (
        trackRef.participant &&
        trackRef.participant.identity !== localParticipant.identity &&
        isTrackReference(trackRef)
      ) {
        const pub = trackRef.publication as RemoteTrackPublication | undefined;
        pub?.setVideoQuality(screenQuality);
      }
    }
  }, [cameraTracks, screenTracks, streamQualityCaps, localParticipant.identity]);

  const cameraTrackMap = useMemo(() => {
    const map = new Map<string, TrackReferenceOrPlaceholder>();
    for (const t of cameraTracks) {
      if (t.participant) {
        map.set(t.participant.identity, t);
      }
    }
    return map;
  }, [cameraTracks]);

  const screenTrackMap = useMemo(() => {
    const map = new Map<string, TrackReferenceOrPlaceholder>();
    for (const t of screenTracks) {
      if (t.participant) {
        map.set(t.participant.identity, t);
      }
    }
    return map;
  }, [screenTracks]);

  const gridClass = participants.length <= 1
    ? 'call-conference__grid call-conference__grid--single'
    : participants.length <= 4
      ? 'call-conference__grid call-conference__grid--small'
      : 'call-conference__grid call-conference__grid--large';

  const focusedParticipant = participants.find((participant) => participant.identity === focusedIdentity)
    ?? localParticipant;
  const focusedIsLocal = focusedParticipant.identity === localParticipant.identity;
  const focusedVideoTrackRef = cameraTrackMap.get(focusedParticipant.identity);
  const focusedScreenTrackRef = screenTrackMap.get(focusedParticipant.identity);
  const focusedHasScreenShare = isScreenShareEnabled(focusedParticipant)
    && focusedScreenTrackRef
    && isTrackReference(focusedScreenTrackRef);

  return (
    <div className={`call-conference${useMobileFocusLayout ? ' call-conference--mobile-focus' : ''}`}>
      <RoomAudioRenderer />
      <E2EEStatusBanner
        e2eeActive={!!e2eeActive}
        e2eeSupported={e2eeSupported}
        onTroubleshoot={onTroubleshoot}
      />

      {useMobileFocusLayout ? (
        <>
          <div className="call-conference__mobile-stage">
            {focusedHasScreenShare ? (
              <div className="call-conference__tile call-conference__tile--screen call-conference__tile--stage">
                <VideoTrack
                  trackRef={focusedScreenTrackRef}
                  className="call-conference__video"
                />
                <div className="call-conference__overlay">
                  <span className="call-conference__name">
                    {getParticipantDisplayName(focusedParticipant)} - Screen
                  </span>
                </div>
              </div>
            ) : (
              <ParticipantTile
                participant={focusedParticipant}
                videoTrackRef={focusedVideoTrackRef}
                isLocal={focusedIsLocal}
                className="call-conference__tile--stage"
              />
            )}
          </div>

          <div className="call-conference__mobile-thumbnails" role="tablist">
            {participants.map((participant) => {
              const isLocal = participant.identity === localParticipant.identity;
              const videoTrackRef = cameraTrackMap.get(participant.identity);

              return (
                <ParticipantThumbnail
                  key={participant.identity}
                  participant={participant}
                  videoTrackRef={videoTrackRef}
                  isLocal={isLocal}
                  isActive={participant.identity === focusedIdentity}
                  onSelect={() => setFocusedIdentity(participant.identity)}
                />
              );
            })}
          </div>
        </>
      ) : (
        <div className={gridClass}>
          {participants.map((participant) => {
            const isLocal = participant.identity === localParticipant.identity;
            const videoTrackRef = cameraTrackMap.get(participant.identity);
            const screenTrackRef = screenTrackMap.get(participant.identity);

            return (
              <div key={participant.identity} className="call-conference__tile-wrapper">
                <ParticipantTile
                  participant={participant}
                  videoTrackRef={videoTrackRef}
                  isLocal={isLocal}
                />
                {isScreenShareEnabled(participant) && screenTrackRef && isTrackReference(screenTrackRef) && (
                  <div className="call-conference__tile call-conference__tile--screen">
                    <VideoTrack
                      trackRef={screenTrackRef}
                      className="call-conference__video"
                    />
                    <div className="call-conference__overlay">
                      <span className="call-conference__name">
                        {getParticipantDisplayName(participant)} - Screen
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="call-conference__controls">
        <ControlBar
          controls={{
            microphone: true,
            camera: true,
            screenShare: true,
            leave: true,
            chat: false,
            settings: false,
          }}
          variation={isMobile ? 'minimal' : 'verbose'}
        />
      </div>
    </div>
  );
}
