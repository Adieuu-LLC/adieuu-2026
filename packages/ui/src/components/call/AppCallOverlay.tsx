import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { useCallSession } from '../../hooks/useCallSession';
import { useIdentity } from '../../hooks/useIdentity';
import { useConversations } from '../../hooks/useConversations';
import { useToast } from '../Toast';
import { CallDeviceSetupModal } from './CallDeviceSetupModal';

// ---------------------------------------------------------------------------
// AppCallOverlay
//
// Renders the LiveKit VideoConference prefab when a call is active.
// The prefab provides: participant grid, control bar (mute, camera,
// screen share, leave), screen share layout, connection indicators.
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
    livekitUrl,
    livekitToken,
  } = useCallSession();

  const [_minimized, _setMinimized] = useState(false);

  const handleConfirmDevices = useCallback(
    async (devices: { audioDeviceId?: string }) => {
      try {
        await confirmDeviceSetup(devices);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('call.callStartFailed');
        toast.error(message);
      }
    },
    [confirmDeviceSetup, toast, t],
  );

  const activeConversation = useMemo(() => {
    if (!activeSession) return undefined;
    return conversations.find((c) => c.id === activeSession.conversationId);
  }, [activeSession, conversations]);

  const _conversationName = activeConversation?.decryptedName ?? undefined;

  const handleDisconnected = useCallback(() => {
    void leaveCall();
  }, [leaveCall]);

  return (
    <>
      <CallDeviceSetupModal
        open={phase === 'device-setup' && pendingCallType !== null}
        isJoin={pendingIsJoin}
        onConfirm={handleConfirmDevices}
        onCancel={cancelDeviceSetup}
      />

      {activeSession && livekitUrl && livekitToken && (
        <div className="call-overlay" data-phase={phase}>
          <LiveKitRoom
            serverUrl={livekitUrl}
            token={livekitToken}
            connect={true}
            audio={activeSession.call.allowedMedia.audio}
            video={activeSession.call.allowedMedia.video}
            onDisconnected={handleDisconnected}
          >
            <VideoConference />
          </LiveKitRoom>
        </div>
      )}
    </>
  );
}
