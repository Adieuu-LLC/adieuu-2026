import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatIncomingMessage } from '@adieuu/shared';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import { useChatSocket } from './useChatSocket';
import { useCallMedia } from './useCallMedia';
import type { JitsiService, JitsiServiceConfig } from '../services/jitsiService';
import {
  initiateCall as apiInitiateCall,
  joinCall as apiJoinCall,
  leaveCall as apiLeaveCall,
  endCall as apiEndCall,
  type CallMediaOptions,
  type PublicCall,
} from '../services/callService';
import { applyCallSocketMessage } from './callStateUpdates';
import { parseRetryAfterSeconds } from './callStateUpdates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CallSessionPhase = 'idle' | 'device-setup' | 'connecting' | 'active';

interface CallSession {
  conversationId: string;
  call: PublicCall;
  jitsiToken?: string;
}

export interface CallSessionContextValue {
  activeSession: CallSession | null;
  phase: CallSessionPhase;
  pendingCallType: CallMediaOptions | null;
  pendingConversationId: string | null;
  pendingIsJoin: boolean;
  pendingCallId: string | null;

  requestStartCall: (conversationId: string, media: CallMediaOptions) => void;
  requestJoinCall: (conversationId: string, callId: string, media: CallMediaOptions) => void;

  confirmDeviceSetup: (devices: { audioDeviceId?: string; videoDeviceId?: string }) => Promise<void>;
  cancelDeviceSetup: () => void;

  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;

  callMedia: ReturnType<typeof useCallMedia>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CallSessionContext = createContext<CallSessionContextValue | null>(null);

export function useCallSession(): CallSessionContextValue {
  const ctx = useContext(CallSessionContext);
  if (!ctx) {
    throw new Error('useCallSession must be used within a CallSessionProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Helper: derive Jitsi config from base URL
// ---------------------------------------------------------------------------

function jitsiConfigFromBaseUrl(baseUrl: string): JitsiServiceConfig {
  const url = new URL(baseUrl);
  return {
    serverHost: url.hostname,
    serviceUrl: `wss://${url.hostname}/xmpp-websocket`,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const { apiBaseUrl, jitsiBaseUrl } = useAppConfig();
  const { subscribe } = useChatSocket();
  const callMedia = useCallMedia();

  const client = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }).client,
    [apiBaseUrl],
  );

  const [session, setSession] = useState<CallSession | null>(null);
  const [phase, setPhase] = useState<CallSessionPhase>('idle');
  const [pendingCallType, setPendingCallType] = useState<CallMediaOptions | null>(null);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [pendingIsJoin, setPendingIsJoin] = useState(false);
  const [pendingCallId, setPendingCallId] = useState<string | null>(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const jitsiRef = useRef<JitsiService | null>(null);

  // ---- Single-call guard ----

  const isSessionActive = session !== null || phase !== 'idle';

  const requestStartCall = useCallback(
    (conversationId: string, media: CallMediaOptions) => {
      if (isSessionActive) return;
      setPendingCallType(media);
      setPendingConversationId(conversationId);
      setPendingIsJoin(false);
      setPendingCallId(null);
      setPhase('device-setup');
    },
    [isSessionActive],
  );

  const requestJoinCall = useCallback(
    (conversationId: string, callId: string, media: CallMediaOptions) => {
      if (isSessionActive) return;
      setPendingCallType(media);
      setPendingConversationId(conversationId);
      setPendingIsJoin(true);
      setPendingCallId(callId);
      setPhase('device-setup');
    },
    [isSessionActive],
  );

  const cancelDeviceSetup = useCallback(() => {
    setPendingCallType(null);
    setPendingConversationId(null);
    setPendingIsJoin(false);
    setPendingCallId(null);
    setPhase('idle');
  }, []);

  // ---- Confirm device setup -> initiate or join ----

  const confirmDeviceSetup = useCallback(
    async (devices: { audioDeviceId?: string; videoDeviceId?: string }) => {
      if (!pendingCallType || !pendingConversationId || !identity) {
        cancelDeviceSetup();
        return;
      }

      setPhase('connecting');

      try {
        let call: PublicCall;
        let jitsiToken: string | undefined;

        if (pendingIsJoin && pendingCallId) {
          const resp = await apiJoinCall(client, pendingConversationId, pendingCallId, pendingCallType);
          if (!resp.success || !resp.data) {
            throw new Error(resp.error?.message ?? t('call.callJoinFailed'));
          }
          call = resp.data.call;
          jitsiToken = resp.data.jitsiToken;
        } else {
          const resp = await apiInitiateCall(client, pendingConversationId, pendingCallType);
          if (!resp.success || !resp.data) {
            const errorCode = resp.error?.code;
            if (errorCode === 'RATE_LIMITED') {
              const retryAfterSeconds = parseRetryAfterSeconds(resp.error?.details) ?? 30;
              throw new Error(t('call.rateLimited', { seconds: retryAfterSeconds }));
            }
            if (errorCode === 'JITSI_UNAVAILABLE') {
              throw new Error(t('call.jitsiUnavailable'));
            }
            throw new Error(resp.error?.message ?? t('call.callStartFailed'));
          }
          call = resp.data.call;
          jitsiToken = resp.data.jitsiToken;
        }

        const newSession: CallSession = {
          conversationId: pendingConversationId,
          call,
          jitsiToken,
        };
        setSession(newSession);

        // Start local media
        if (pendingCallType.audio || pendingCallType.video) {
          await callMedia.startMedia({
            audio: pendingCallType.audio,
            video: pendingCallType.video,
            audioDeviceId: devices.audioDeviceId,
            videoDeviceId: devices.videoDeviceId,
          });
        }

        // Connect to Jitsi if configured (lazy-load to avoid bundling lib-jitsi-meet at startup)
        if (jitsiBaseUrl && jitsiToken) {
          const jitsiConfig = jitsiConfigFromBaseUrl(jitsiBaseUrl);
          const { JitsiService: JitsiServiceImpl } = await import(
            /* @vite-ignore */ '../services/jitsiService'
          );
          const jitsi = new JitsiServiceImpl(jitsiConfig);
          jitsiRef.current = jitsi;

          await jitsi.connect(call.jitsiRoomName, jitsiToken);

          if (pendingCallType.audio || pendingCallType.video) {
            await jitsi.createLocalTracks({
              audio: pendingCallType.audio,
              video: pendingCallType.video,
            });
          }

          if (pendingCallType.screenshare) {
            await jitsi.startScreenshare();
          }
        } else if (pendingCallType.screenshare) {
          await callMedia.toggleScreenshare();
        }

        setPhase('active');
      } catch (err) {
        console.error('[CallSession] Failed to start/join call:', err);
        cleanupJitsi();
        callMedia.stopAllMedia();
        setSession(null);
        setPhase('idle');
        throw err;
      } finally {
        setPendingCallType(null);
        setPendingConversationId(null);
        setPendingIsJoin(false);
        setPendingCallId(null);
      }
    },
    [
      pendingCallType,
      pendingConversationId,
      pendingIsJoin,
      pendingCallId,
      identity,
      client,
      jitsiBaseUrl,
      callMedia,
      t,
      cancelDeviceSetup,
    ],
  );

  // ---- Leave / End ----

  const cleanupJitsi = useCallback(() => {
    if (jitsiRef.current) {
      void jitsiRef.current.dispose();
      jitsiRef.current = null;
    }
  }, []);

  const leaveCallAction = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    try {
      await apiLeaveCall(client, currentSession.conversationId, currentSession.call.id);
    } catch {
      // Best-effort server notification
    }

    cleanupJitsi();
    callMedia.stopAllMedia();
    setSession(null);
    setPhase('idle');
  }, [client, cleanupJitsi, callMedia]);

  const endCallAction = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    try {
      await apiEndCall(client, currentSession.conversationId, currentSession.call.id);
    } catch {
      // Best-effort server notification
    }

    cleanupJitsi();
    callMedia.stopAllMedia();
    setSession(null);
    setPhase('idle');
  }, [client, cleanupJitsi, callMedia]);

  // ---- Listen for WS events to update session call state ----

  useEffect(() => {
    const unsubscribe = subscribe((message: ChatIncomingMessage) => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;

      switch (message.type) {
        case 'call_ended': {
          const { callId } = message.data;
          if (callId === currentSession.call.id) {
            cleanupJitsi();
            callMedia.stopAllMedia();
            setSession(null);
            setPhase('idle');
          }
          break;
        }
        case 'call_participant_joined':
        case 'call_participant_left':
        case 'call_media_state_changed': {
          const prev = { activeCall: currentSession.call, loading: false };
          const next = applyCallSocketMessage(prev, message, currentSession.conversationId);
          if (next?.activeCall) {
            setSession((s) =>
              s ? { ...s, call: next.activeCall! } : null,
            );
          }
          break;
        }
      }
    });

    return unsubscribe;
  }, [subscribe, cleanupJitsi, callMedia]);

  // ---- Cleanup on unmount (app close) ----

  useEffect(() => {
    return () => {
      const currentSession = sessionRef.current;
      if (currentSession) {
        void apiLeaveCall(client, currentSession.conversationId, currentSession.call.id).catch(
          () => {},
        );
      }
      if (jitsiRef.current) {
        void jitsiRef.current.dispose();
        jitsiRef.current = null;
      }
    };
  }, [client]);

  // ---- Context value ----

  const value = useMemo<CallSessionContextValue>(
    () => ({
      activeSession: session,
      phase,
      pendingCallType,
      pendingConversationId,
      pendingIsJoin,
      pendingCallId,
      requestStartCall,
      requestJoinCall,
      confirmDeviceSetup,
      cancelDeviceSetup,
      leaveCall: leaveCallAction,
      endCall: endCallAction,
      callMedia,
    }),
    [
      session,
      phase,
      pendingCallType,
      pendingConversationId,
      pendingIsJoin,
      pendingCallId,
      requestStartCall,
      requestJoinCall,
      confirmDeviceSetup,
      cancelDeviceSetup,
      leaveCallAction,
      endCallAction,
      callMedia,
    ],
  );

  return (
    <CallSessionContext.Provider value={value}>
      {children}
    </CallSessionContext.Provider>
  );
}
