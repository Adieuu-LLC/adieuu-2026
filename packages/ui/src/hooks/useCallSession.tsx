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
import type { ChatIncomingMessage, StreamQualityCaps } from '@adieuu/shared';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import { useChatSocket } from './useChatSocket';
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
  livekitToken?: string;
  livekitUrl?: string;
  streamQualityCaps?: StreamQualityCaps;
}

export interface CallSessionContextValue {
  activeSession: CallSession | null;
  phase: CallSessionPhase;
  pendingCallType: CallMediaOptions | null;
  pendingConversationId: string | null;
  pendingIsJoin: boolean;
  pendingCallId: string | null;

  /** LiveKit server URL for the active session. */
  livekitUrl: string | null;
  /** LiveKit JWT token for the active session. */
  livekitToken: string | null;
  /** Per-user streaming resolution caps (camera + screenshare). */
  streamQualityCaps: StreamQualityCaps | null;

  requestStartCall: (conversationId: string, media: CallMediaOptions) => void;
  requestJoinCall: (conversationId: string, callId: string, media: CallMediaOptions) => void;

  confirmDeviceSetup: (devices: { audioDeviceId?: string }) => Promise<void>;
  cancelDeviceSetup: () => void;

  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;
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
// Provider
// ---------------------------------------------------------------------------

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { subscribe } = useChatSocket();

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
    async (_devices: { audioDeviceId?: string }) => {
      if (!pendingCallType || !pendingConversationId || !identity) {
        cancelDeviceSetup();
        return;
      }

      setPhase('connecting');

      try {
        let call: PublicCall;
        let livekitToken: string | undefined;
        let livekitUrl: string | undefined;
        let streamQualityCaps: StreamQualityCaps | undefined;

        if (pendingIsJoin && pendingCallId) {
          const resp = await apiJoinCall(client, pendingConversationId, pendingCallId, pendingCallType);
          if (!resp.success || !resp.data) {
            throw new Error(resp.error?.message ?? t('call.callJoinFailed'));
          }
          call = resp.data.call;
          livekitToken = resp.data.livekitToken;
          livekitUrl = resp.data.livekitUrl;
          streamQualityCaps = resp.data.streamQualityCaps;
        } else {
          const resp = await apiInitiateCall(client, pendingConversationId, pendingCallType);
          if (!resp.success || !resp.data) {
            const errorCode = resp.error?.code;
            if (errorCode === 'RATE_LIMITED') {
              const retryAfterSeconds = parseRetryAfterSeconds(resp.error?.details) ?? 30;
              throw new Error(t('call.rateLimited', { seconds: retryAfterSeconds }));
            }
            if (errorCode === 'LIVEKIT_UNAVAILABLE') {
              throw new Error(t('call.callServiceUnavailable'));
            }
            throw new Error(resp.error?.message ?? t('call.callStartFailed'));
          }
          call = resp.data.call;
          livekitToken = resp.data.livekitToken;
          livekitUrl = resp.data.livekitUrl;
          streamQualityCaps = resp.data.streamQualityCaps;
        }

        if (!livekitToken || !livekitUrl) {
          console.warn(
            '[CallSession] LiveKit is not configured — media will NOT be relayed to other participants.',
            !livekitUrl ? 'Server did not return livekitUrl (set LIVEKIT_URL).' : '',
            !livekitToken ? 'Server did not return livekitToken (set LIVEKIT_ENABLED=true in the API .env).' : '',
          );
        }

        const newSession: CallSession = {
          conversationId: pendingConversationId,
          call,
          livekitToken,
          livekitUrl,
          streamQualityCaps,
        };
        setSession(newSession);
        setPhase('active');
      } catch (err) {
        console.error('[CallSession] Failed to start/join call:', err);
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
      t,
      cancelDeviceSetup,
    ],
  );

  // ---- Leave / End ----

  const cleanup = useCallback(() => {
    setSession(null);
    setPhase('idle');
  }, []);

  const leaveCallAction = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    try {
      await apiLeaveCall(client, currentSession.conversationId, currentSession.call.id);
    } catch {
      // Best-effort server notification
    }

    cleanup();
  }, [client, cleanup]);

  const endCallAction = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    try {
      await apiEndCall(client, currentSession.conversationId, currentSession.call.id);
    } catch {
      // Best-effort server notification
    }

    cleanup();
  }, [client, cleanup]);

  // ---- Listen for WS events to update session call state ----

  useEffect(() => {
    const unsubscribe = subscribe((message: ChatIncomingMessage) => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;

      switch (message.type) {
        case 'call_ended': {
          const { callId } = message.data;
          if (callId === currentSession.call.id) {
            cleanup();
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
  }, [subscribe, cleanup]);

  // ---- Cleanup on unmount (app close) ----

  useEffect(() => {
    return () => {
      const currentSession = sessionRef.current;
      if (currentSession) {
        void apiLeaveCall(client, currentSession.conversationId, currentSession.call.id).catch(
          () => {},
        );
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
      livekitUrl: session?.livekitUrl ?? null,
      livekitToken: session?.livekitToken ?? null,
      streamQualityCaps: session?.streamQualityCaps ?? null,
      requestStartCall,
      requestJoinCall,
      confirmDeviceSetup,
      cancelDeviceSetup,
      leaveCall: leaveCallAction,
      endCall: endCallAction,
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
    ],
  );

  return (
    <CallSessionContext.Provider value={value}>
      {children}
    </CallSessionContext.Provider>
  );
}
