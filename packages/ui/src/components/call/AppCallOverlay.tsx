import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../../config/PlatformContext';
import { useCall } from '../../hooks/useCall';
import { CallSessionError, useCallSession } from '../../hooks/useCallSession';
import { useCallFullscreen } from '../../hooks/useCallFullscreen';
import { useCallOverlayResize } from '../../hooks/useCallOverlayResize';
import { useConversations } from '../../hooks/useConversations';
import { forceEndCall as apiForceEndCall } from '../../services/callService';
import { setCallOverlayHeightCssVar } from '../../services/callOverlayPreferences';
import { useToast } from '../Toast';
import { CallDeviceSetupModal, type CallDeviceSelection } from './CallDeviceSetupModal';
import { CallTroubleshootModal } from './CallTroubleshootModal';

// The LiveKit room (and its heavy bundle) loads only when a call is active.
const CallRoom = lazy(() => import('./CallRoom'));

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
  const { heightPx, committedHeightPx, resizeHandleProps } = useCallOverlayResize({
    disabled: isExpanded,
  });

  // Warm the LiveKit chunk as soon as a call is being set up so it's ready by
  // the time the room mounts (import() is deduped, so this is cheap).
  useEffect(() => {
    if (phase === 'device-setup' || activeSession) {
      void import('./CallRoom');
    }
  }, [phase, activeSession]);

  const handleConfirmDevices = useCallback(
    async (devices: CallDeviceSelection) => {
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
    if (!conversationId || !callId) return false;

    try {
      const result = await apiForceEndCall(apiClient, conversationId, callId);
      if (result.success) {
        toast.success(t('call.forceEndSuccess'));
        await leaveCall();
        await refetchActiveCall();
        return true;
      }
      toast.error(t('call.forceEndFailed'));
      return false;
    } catch (err) {
      console.warn('[AppCallOverlay] force end call failed', err);
      toast.error(t('call.forceEndFailed'));
      return false;
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

  useEffect(() => {
    if (!isViewingCallConversation || isExpanded) {
      setCallOverlayHeightCssVar(null);
      return;
    }
    setCallOverlayHeightCssVar(committedHeightPx);
  }, [isViewingCallConversation, isExpanded, committedHeightPx]);

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
            <Suspense fallback={null}>
              <CallRoom
                serverUrl={livekitUrl}
                token={livekitToken}
                callE2EEKey={callE2EEKey}
                e2eeSupported={e2eeSupported}
                streamQualityCaps={streamQualityCaps}
                isDm={isCallDm}
                isExpanded={isExpanded}
                onToggleFullscreen={() => void toggleFullscreen()}
                onTroubleshoot={() => setTroubleshootOpen(true)}
                onConnected={handleConnected}
                onDisconnected={handleDisconnected}
              />
            </Suspense>
            {!isExpanded && (
              <hr
                className="call-overlay__resize-handle"
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
