/**
 * Custom call conference UI.
 *
 * Replaces LiveKit's VideoConference prefab to always show participant tiles
 * (with avatars and display names) even in audio-only calls.
 * Uses LiveKit hooks and the ControlBar prefab for media controls.
 */

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useLocalParticipant,
  useParticipants,
  ControlBar,
  RoomAudioRenderer,
  isTrackReference,
} from '@livekit/components-react';
import { Track, VideoQuality } from 'livekit-client';
import type { RemoteTrackPublication } from 'livekit-client';
import { InfoTip } from '../InfoTip';
import { Icon } from '../../icons/Icon';
import { useCallSession } from '../../hooks/useCallSession';
import { useIsMobile } from '../../hooks/useIsMobile';
import { CallFrameThumbnail } from './CallFrameThumbnail';
import { CallFrameTile } from './CallFrameTile';
import { useCallFrameLayout } from './useCallFrameLayout';
import { useCallFrames } from './useCallFrames';

const E2EE_STATUS_INFO_ROWS = [
  { labelKey: 'call.e2eeActive', infoKey: 'call.e2eeStatusInfoActive' },
  { labelKey: 'call.e2eeFailed', infoKey: 'call.e2eeStatusInfoFailed' },
  { labelKey: 'call.e2eeNotSupported', infoKey: 'call.e2eeStatusInfoNotSupported' },
] as const;

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
  isDm?: boolean;
  onTroubleshoot?: () => void;
}

export function CallConferenceView({
  e2eeActive = false,
  isDm = false,
  onTroubleshoot,
}: CallConferenceViewProps) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const { streamQualityCaps, e2eeSupported } = useCallSession();
  const isMobile = useIsMobile();
  const { frames, cameraTrackMap, screenTrackMap } = useCallFrames();

  const layout = useCallFrameLayout({
    frames,
    localIdentity: localParticipant.identity,
    participantCount: participants.length,
    isDm,
    isMobile,
  });

  useEffect(() => {
    if (!streamQualityCaps) return;

    const cameraQuality = resolutionToVideoQuality(streamQualityCaps.camera.height);
    const screenQuality = resolutionToVideoQuality(streamQualityCaps.screenshare.height);

    for (const [, trackRef] of cameraTrackMap) {
      if (
        trackRef.participant &&
        trackRef.participant.identity !== localParticipant.identity &&
        isTrackReference(trackRef)
      ) {
        const pub = trackRef.publication as RemoteTrackPublication | undefined;
        pub?.setVideoQuality(cameraQuality);
      }
    }
    for (const [, trackRef] of screenTrackMap) {
      if (
        trackRef.participant &&
        trackRef.participant.identity !== localParticipant.identity &&
        isTrackReference(trackRef)
      ) {
        const pub = trackRef.publication as RemoteTrackPublication | undefined;
        pub?.setVideoQuality(screenQuality);
      }
    }
  }, [cameraTrackMap, screenTrackMap, streamQualityCaps, localParticipant.identity]);

  const conferenceClass = useMemo(() => {
    const classes = ['call-conference'];
    if (layout.mode === 'pinned') classes.push('call-conference--pinned');
    if (layout.mode === 'dm-split') classes.push('call-conference--dm-split');
    if (layout.mode === 'mobile-stage') classes.push('call-conference--mobile-focus');
    return classes.join(' ');
  }, [layout.mode]);

  const renderFrameTile = (
    frame: typeof frames[number],
    variant: 'hero' | 'sidebar' | 'grid' | 'stage',
    extraClass?: string,
  ) => {
    const isLocal = frame.participantIdentity === localParticipant.identity;
    return (
      <CallFrameTile
        key={frame.id}
        frame={frame}
        isLocal={isLocal}
        variant={variant}
        className={extraClass}
        isPinned={layout.isFramePinned(frame.id)}
        onTogglePin={() => layout.togglePinFrame(frame.id)}
        showPinControl
      />
    );
  };

  return (
    <div className={conferenceClass}>
      <RoomAudioRenderer />
      <E2EEStatusBanner
        e2eeActive={!!e2eeActive}
        e2eeSupported={e2eeSupported}
        onTroubleshoot={onTroubleshoot}
      />

      {layout.mode === 'pinned' && layout.heroFrame && (
        <>
          <div className="call-conference__pinned-body">
            <div className="call-conference__sidebar">
              {layout.sidebarFrames.map((frame) => renderFrameTile(frame, 'sidebar'))}
            </div>
            <div className="call-conference__hero">
              {renderFrameTile(layout.heroFrame, 'hero')}
            </div>
          </div>
          {layout.overflowFrames.length > 0 && (
            <div className="call-conference__overflow-thumbs" role="tablist">
              {layout.overflowFrames.map((frame) => (
                <CallFrameThumbnail
                  key={frame.id}
                  frame={frame}
                  isLocal={frame.participantIdentity === localParticipant.identity}
                  isActive={false}
                  onSelect={() => layout.promoteFromOverflow(frame.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {layout.mode === 'dm-split' && (
        <div className="call-conference__dm-split">
          {layout.dmSplitFrames.map((frame) => renderFrameTile(frame, 'grid'))}
        </div>
      )}

      {layout.mode === 'mobile-stage' && layout.heroFrame && (
        <>
          <div className="call-conference__mobile-stage">
            {renderFrameTile(layout.heroFrame, 'stage')}
          </div>
          {layout.thumbnailFrames.length > 0 && (
            <div className="call-conference__mobile-thumbnails" role="tablist">
              {layout.thumbnailFrames.map((frame) => (
                <CallFrameThumbnail
                  key={frame.id}
                  frame={frame}
                  isLocal={frame.participantIdentity === localParticipant.identity}
                  isActive={frame.id === layout.focusedFrameId}
                  onSelect={() => layout.selectFocusedFrame(frame.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {layout.mode === 'grid' && (
        <div className={layout.gridClass}>
          {frames.map((frame) => renderFrameTile(frame, 'grid'))}
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
