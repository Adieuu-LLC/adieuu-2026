import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient } from '@adieuu/shared';
import { LiveKitRoom } from '@livekit/components-react';
import { ExternalE2EEKeyProvider } from 'livekit-client';
import '@livekit/components-styles';
import { useAppConfig } from '../../config/PlatformContext';
import { useCall } from '../../hooks/useCall';
import { CallSessionError, useCallSession } from '../../hooks/useCallSession';
import { useCallFullscreen } from '../../hooks/useCallFullscreen';
import { useCallOverlayResize } from '../../hooks/useCallOverlayResize';
import { useConversations } from '../../hooks/useConversations';
import { forceEndCall as apiForceEndCall } from '../../services/callService';
import { useToast } from '../Toast';
import { CallDeviceSetupModal } from './CallDeviceSetupModal';
import { CallConferenceView } from './CallConferenceView';
import { CallTroubleshootModal } from './CallTroubleshootModal';

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
  const { apiBaseUrl } = useAppConfig();
  const { activeConversationId, conversations } = useConversations();
  const { activeCall, refetch: refetchActiveCall } = useCall(activeConversationId);
  const toast = useToast();
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const apiClient = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }).client,
    [apiBaseUrl],
  );

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

  const { isExpanded, toggle: toggleFullscreen } = useCallFullscreen(overlayRef);
  const { heightPx, resizeHandleProps } = useCallOverlayResize({ disabled: isExpanded });

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
        if (err instanceof CallSessionError && err.code === 'ALREADY_IN_CALL') {
          toast.toast({
            title: t('call.alreadyJoinedCall'),
            variant: 'error',
            action: {
              label: t('call.troubleshootLink'),
              onClick: () => setTroubleshootOpen(true),
            },
          });
          return;
        }
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

  const handleForceEndCall = useCallback(async () => {
    const conversationId = activeSession?.conversationId ?? activeConversationId;
    const callId = activeSession?.call.id ?? activeCall?.id;
    if (!conversationId || !callId) return;

    const result = await apiForceEndCall(apiClient, conversationId, callId);
    if (result.success) {
      toast.success(t('call.forceEndSuccess'));
      await leaveCall();
      await refetchActiveCall();
    } else {
      toast.error(t('call.forceEndFailed'));
    }
  }, [
    activeSession?.conversationId,
    activeSession?.call.id,
    activeConversationId,
    activeCall?.id,
    apiClient,
    toast,
    t,
    leaveCall,
    refetchActiveCall,
  ]);

  const isViewingCallConversation =
    activeSession !== null && activeConversationId === activeSession.conversationId;

  const isCallDm = useMemo(() => {
    if (!activeSession) return false;
    const conversation = conversations.find((c) => c.id === activeSession.conversationId);
    return conversation?.type === 'dm';
  }, [activeSession, conversations]);

  const overlayClassName = [
    'call-overlay',
    isExpanded ? 'call-overlay--expanded' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <CallDeviceSetupModal
        open={phase === 'device-setup' && pendingCallType !== null}
        isJoin={pendingIsJoin}
        onConfirm={handleConfirmDevices}
        onCancel={cancelDeviceSetup}
      />

      {activeSession && livekitUrl && livekitToken && (
        <>
          <div
            ref={overlayRef}
            className={overlayClassName}
            style={isExpanded ? undefined : { height: `${heightPx}px` }}
            data-phase={phase}
            data-call-visible={isViewingCallConversation}
            data-call-expanded={isExpanded}
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
              <CallConferenceView
                e2eeActive={!!callE2EEKey}
                isDm={isCallDm}
                isExpanded={isExpanded}
                onToggleFullscreen={() => void toggleFullscreen()}
                onTroubleshoot={() => setTroubleshootOpen(true)}
              />
            </LiveKitRoom>
            {!isExpanded && (
              <div
                className="call-overlay__resize-handle"
                role="separator"
                aria-orientation="horizontal"
                aria-label={t('call.resizeOverlay')}
                {...resizeHandleProps}
              />
            )}
          </div>
        </>
      )}

      <CallTroubleshootModal
        open={troubleshootOpen}
        onOpenChange={setTroubleshootOpen}
        onForceEnd={handleForceEndCall}
      />
    </>
  );
}
