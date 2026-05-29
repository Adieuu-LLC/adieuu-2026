import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallSession } from '../../hooks/useCallSession';
import { useIdentity } from '../../hooks/useIdentity';
import { useConversations } from '../../hooks/useConversations';
import { useToast } from '../Toast';
import { CallOverlay } from './CallOverlay';
import { CallDeviceSetupModal } from './CallDeviceSetupModal';
import type { CallControlsProps } from './CallControls';
import type { CallParticipantInfo } from './CallParticipantGrid';

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

  const participants: CallParticipantInfo[] = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.call.participants
      .filter((p) => !p.leftAt)
      .map((p) => ({
        identityId: p.identityId,
        displayName: p.identityId,
        isAudioEnabled: p.mediaState.audio,
        isVideoEnabled: p.mediaState.video,
        isScreensharing: p.mediaState.screenshare,
      }));
  }, [activeSession]);

  const isInitiator = activeSession?.call.initiatorIdentityId === identity?.id;

  const controls: CallControlsProps | null = activeSession
    ? {
        isAudioEnabled: callMedia.isAudioEnabled,
        isVideoEnabled: callMedia.isVideoEnabled,
        isScreensharing: callMedia.isScreensharing,
        audioAllowed: activeSession.call.allowedMedia.audio,
        videoAllowed: activeSession.call.allowedMedia.video,
        screenshareAllowed: activeSession.call.allowedMedia.screenshare,
        onToggleAudio: callMedia.toggleAudio,
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
