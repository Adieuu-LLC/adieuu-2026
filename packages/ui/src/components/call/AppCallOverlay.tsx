import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveKitRoom } from '@livekit/components-react';
import '@livekit/components-styles';
import { useCallSession } from '../../hooks/useCallSession';
import { useConversations } from '../../hooks/useConversations';
import { useToast } from '../Toast';
import { CallDeviceSetupModal } from './CallDeviceSetupModal';
import { CallConferenceView } from './CallConferenceView';

/**
 * AppCallOverlay
 *
 * Renders the LiveKit VideoConference when a call is active.
 * - Always mounted globally so the audio connection persists across navigation.
 * - Only shows the video UI when the user is viewing the conversation
 *   the call belongs to (via data-call-visible attribute for CSS).
 * - Positioned within the conversation body area (top half), not full viewport.
 */
export function AppCallOverlay() {
  const { t } = useTranslation();
  const { activeConversationId } = useConversations();
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
    streamQualityCaps,
  } = useCallSession();

  const roomOptions = useMemo(() => {
    if (!streamQualityCaps) return undefined;
    return {
      videoCaptureDefaults: {
        resolution: {
          width: streamQualityCaps.camera.width,
          height: streamQualityCaps.camera.height,
          frameRate: 30,
        },
      },
      publishDefaults: {
        videoSimulcastLayers: [],
        screenShareSimulcastLayers: [],
      },
      screenShareCaptureDefaults: {
        resolution: {
          width: streamQualityCaps.screenshare.width,
          height: streamQualityCaps.screenshare.height,
          frameRate: 15,
        },
      },
    };
  }, [streamQualityCaps]);

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

  const handleDisconnected = useCallback(() => {
    void leaveCall();
  }, [leaveCall]);

  const isViewingCallConversation =
    activeSession !== null && activeConversationId === activeSession.conversationId;

  return (
    <>
      <CallDeviceSetupModal
        open={phase === 'device-setup' && pendingCallType !== null}
        isJoin={pendingIsJoin}
        onConfirm={handleConfirmDevices}
        onCancel={cancelDeviceSetup}
      />

      {activeSession && livekitUrl && livekitToken && (
        <div
          className="call-overlay"
          data-phase={phase}
          data-call-visible={isViewingCallConversation}
        >
          <LiveKitRoom
            serverUrl={livekitUrl}
            token={livekitToken}
            connect={true}
            audio={true}
            video={false}
            onDisconnected={handleDisconnected}
            options={roomOptions}
          >
            <CallConferenceView />
          </LiveKitRoom>
        </div>
      )}
    </>
  );
}
