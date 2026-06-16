import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveKitRoom } from '@livekit/components-react';
import { ExternalE2EEKeyProvider } from 'livekit-client';
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
    callE2EEKey,
    e2eeSupported,
  } = useCallSession();

  // ---- E2EE key provider (stable instance across the session) ----

  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null);

  const e2eeWorker = useMemo(() => {
    if (!e2eeSupported) return undefined;
    try {
      return new Worker(
        new URL('livekit-client/e2ee-worker', import.meta.url),
      );
    } catch {
      console.warn('[AppCallOverlay] Failed to create E2EE worker — E2EE will be disabled.');
      return undefined;
    }
  }, [e2eeSupported]);

  if (!keyProviderRef.current && e2eeSupported) {
    keyProviderRef.current = new ExternalE2EEKeyProvider();
  }

  useEffect(() => {
    const keyProvider = keyProviderRef.current;
    if (!keyProvider || !callE2EEKey) return;
    void keyProvider.setKey(callE2EEKey.buffer.slice(
      callE2EEKey.byteOffset,
      callE2EEKey.byteOffset + callE2EEKey.byteLength,
    ) as ArrayBuffer);
  }, [callE2EEKey]);

  const roomOptions = useMemo(() => {
    const opts: Record<string, unknown> = {};

    if (streamQualityCaps) {
      opts.videoCaptureDefaults = {
        resolution: {
          width: streamQualityCaps.camera.width,
          height: streamQualityCaps.camera.height,
          frameRate: 30,
        },
      };
      opts.publishDefaults = {
        videoSimulcastLayers: [],
        screenShareSimulcastLayers: [],
      };
      opts.screenShareCaptureDefaults = {
        resolution: {
          width: streamQualityCaps.screenshare.width,
          height: streamQualityCaps.screenshare.height,
          frameRate: 15,
        },
      };
    }

    if (callE2EEKey && keyProviderRef.current && e2eeWorker) {
      opts.e2ee = {
        keyProvider: keyProviderRef.current,
        worker: e2eeWorker,
      };
    }

    return Object.keys(opts).length > 0 ? opts : undefined;
  }, [streamQualityCaps, callE2EEKey, e2eeWorker]);

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

  const handleConnected = useCallback(() => {
    console.info(
      '[AppCallOverlay] LiveKit room connected:',
      { e2eeActive: !!callE2EEKey, e2eeSupported },
    );
  }, [callE2EEKey, e2eeSupported]);

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
            onConnected={handleConnected}
            onDisconnected={handleDisconnected}
            options={roomOptions}
          >
            <CallConferenceView e2eeActive={!!callE2EEKey} />
          </LiveKitRoom>
        </div>
      )}
    </>
  );
}
