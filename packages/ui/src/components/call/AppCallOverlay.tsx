import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallSession, type RemoteTrack } from '../../hooks/useCallSession';
import { useIdentity } from '../../hooks/useIdentity';
import { useConversations } from '../../hooks/useConversations';
import { useToast } from '../Toast';
import { CallOverlay } from './CallOverlay';
import { CallDeviceSetupModal } from './CallDeviceSetupModal';
import type { CallControlsProps } from './CallControls';
import type { CallParticipantInfo } from './CallParticipantGrid';

// ---------------------------------------------------------------------------
// Hidden audio element that plays a remote Jitsi audio track.
// Rendered outside the overlay so audio keeps playing when minimized.
// ---------------------------------------------------------------------------

function RemoteAudioElement({ track }: { track: RemoteTrack }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    track.attach(el);

    // Diagnostic: inspect the audio element state after attach
    const stream = el.srcObject as MediaStream | null;
    const audioTracks = stream?.getAudioTracks() ?? [];
    console.info('[RemoteAudio] after attach:', {
      trackId: track.id,
      hasSrcObject: !!stream,
      audioTrackCount: audioTracks.length,
      audioTrackStates: audioTracks.map((t) => ({
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
      })),
      elVolume: el.volume,
      elMuted: el.muted,
      elPaused: el.paused,
      elReadyState: el.readyState,
    });

    const tryPlay = () => {
      el.play().catch((err: unknown) => {
        console.warn('[RemoteAudio] play() failed:', (err as Error)?.name, (err as Error)?.message);
        if (!el.paused) return;
        el.addEventListener('canplay', () => {
          el.play().catch(() => {});
        }, { once: true });
      });
    };

    if (el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      tryPlay();
    } else {
      el.addEventListener('canplay', tryPlay, { once: true });
    }

    return () => {
      track.detach(el);
    };
  }, [track]);

  return <audio ref={ref} autoPlay playsInline />;
}

// ---------------------------------------------------------------------------
// AppCallOverlay
// ---------------------------------------------------------------------------

export function AppCallOverlay() {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const { conversations } = useConversations();
  const toast = useToast();

  const {
    activeSession,
    phase,
    pendingCallType,
    pendingIsJoin,
    confirmDeviceSetup,
    cancelDeviceSetup,
    leaveCall,
    endCall,
    callMedia,
    remoteTracks,
    jitsiParticipantMap,
    isAudioEnabled,
    toggleAudio,
  } = useCallSession();

  const [minimized, setMinimized] = useState(false);

  const handleConfirmDevices = useCallback(
    async (devices: { audioDeviceId?: string; videoDeviceId?: string }) => {
      try {
        await confirmDeviceSetup(devices);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('call.callStartFailed');
        toast.error(message);
      }
    },
    [confirmDeviceSetup, toast, t],
  );

  const conversationName = useMemo(() => {
    if (!activeSession) return undefined;
    const conv = conversations.find((c) => c.id === activeSession.conversationId);
    return conv?.decryptedName ?? undefined;
  }, [activeSession, conversations]);

  // Build a reverse map: identityId -> jitsiParticipantId(s)
  const identityToJitsiIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [jitsiId, identityId] of jitsiParticipantMap) {
      const existing = map.get(identityId);
      if (existing) {
        existing.push(jitsiId);
      } else {
        map.set(identityId, [jitsiId]);
      }
    }
    return map;
  }, [jitsiParticipantMap]);

  // Split remote tracks by type, indexed by Jitsi participant ID
  const { audioByJitsiId, videoByJitsiId } = useMemo(() => {
    const audio = new Map<string, RemoteTrack[]>();
    const video = new Map<string, RemoteTrack[]>();
    for (const t of remoteTracks) {
      const bucket = t.trackType === 'audio' ? audio : video;
      const existing = bucket.get(t.jitsiParticipantId);
      if (existing) {
        existing.push(t);
      } else {
        bucket.set(t.jitsiParticipantId, [t]);
      }
    }
    return { audioByJitsiId: audio, videoByJitsiId: video };
  }, [remoteTracks]);

  // All remote audio tracks (flat) -- we play every one regardless of mapping
  const remoteAudioTracks = useMemo(
    () => remoteTracks.filter((t) => t.trackType === 'audio'),
    [remoteTracks],
  );

  const participants: CallParticipantInfo[] = useMemo(() => {
    if (!activeSession) return [];

    return activeSession.call.participants
      .filter((p) => !p.leftAt)
      .map((p) => {
        const isLocal = p.identityId === identity?.id;

        // Look up this participant's Jitsi session(s) via the identity map
        const jitsiIds = identityToJitsiIds.get(p.identityId) ?? [];
        const remoteVideoTrack =
          !isLocal
            ? jitsiIds
                .flatMap((jid) => videoByJitsiId.get(jid) ?? [])
                .at(0) ?? null
            : null;

        return {
          identityId: p.identityId,
          displayName: p.identityId,
          isAudioEnabled: p.mediaState.audio,
          isVideoEnabled: p.mediaState.video,
          isScreensharing: p.mediaState.screenshare,
          localStream: isLocal ? callMedia.localStream : undefined,
          remoteVideoTrack: remoteVideoTrack ?? undefined,
        };
      });
  }, [activeSession, identity, callMedia.localStream, identityToJitsiIds, videoByJitsiId]);

  const isInitiator = activeSession?.call.initiatorIdentityId === identity?.id;

  const controls: CallControlsProps | null = activeSession
    ? {
        isAudioEnabled,
        isVideoEnabled: callMedia.isVideoEnabled,
        isScreensharing: callMedia.isScreensharing,
        audioAllowed: activeSession.call.allowedMedia.audio,
        videoAllowed: activeSession.call.allowedMedia.video,
        screenshareAllowed: activeSession.call.allowedMedia.screenshare,
        onToggleAudio: toggleAudio,
        onToggleVideo: callMedia.toggleVideo,
        onToggleScreenshare: callMedia.toggleScreenshare,
        onLeave: leaveCall,
        onEnd: isInitiator ? endCall : undefined,
      }
    : null;

  const overlayStatus =
    phase === 'connecting'
      ? 'connecting'
      : activeSession?.call.status === 'ringing'
        ? 'ringing'
        : 'active';

  return (
    <>
      <CallDeviceSetupModal
        open={phase === 'device-setup' && pendingCallType !== null}
        callType={pendingCallType ?? { audio: true, video: false, screenshare: false }}
        isJoin={pendingIsJoin}
        onConfirm={handleConfirmDevices}
        onCancel={cancelDeviceSetup}
      />

      {/* Remote audio must play even when the overlay is minimized */}
      {activeSession &&
        remoteAudioTracks.map((track) => (
          <RemoteAudioElement key={track.id} track={track} />
        ))}

      {activeSession && controls && !minimized && (
        <CallOverlay
          status={overlayStatus}
          participants={participants}
          localIdentityId={identity?.id ?? ''}
          controls={controls}
          conversationName={conversationName}
          onMinimize={() => setMinimized(true)}
        />
      )}
    </>
  );
}
