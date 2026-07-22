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
import type { ChatIncomingMessage, StreamQualityCaps, SerializedWrappedCallKey } from '@adieuu/shared';
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
import {
  generateCallE2EEKey,
  wrapAndSerializeCallKey,
  deserializeAndUnwrapCallKey,
  zeroCallKey,
  clearBytes,
  isE2EESupported,
  type CallKeyRecipient,
} from '../services/callCryptoService';
import { getDeviceKeysForIdentity, decryptDeviceKeys } from '../services/deviceKeyStorage';
import {
  clearOtherMediaSession,
  registerConversationCallLeave,
} from '../services/mediaSessionExclusive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class CallSessionError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'CallSessionError';
    this.code = code;
  }
}

export type CallSessionPhase = 'idle' | 'device-setup' | 'connecting' | 'active';

interface CallSession {
  conversationId: string;
  call: PublicCall;
  livekitToken?: string;
  livekitUrl?: string;
  streamQualityCaps?: StreamQualityCaps;
  callE2EEKey?: Uint8Array;
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
  /** Call E2EE symmetric key (32 bytes) for LiveKit Insertable Streams. Null when E2EE is unavailable. */
  callE2EEKey: Uint8Array | null;
  /** Whether the browser supports LiveKit E2EE (Insertable Streams). */
  e2eeSupported: boolean;

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
  const { identity, getCurrentDeviceId, getWrappingKey } = useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { subscribe } = useChatSocket();

  const e2eeSupported = useMemo(() => isE2EESupported(), []);

  const apiBundle = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }),
    [apiBaseUrl],
  );
  const client = apiBundle.client;

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
      void clearOtherMediaSession('conversation');
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
      void clearOtherMediaSession('conversation');
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

  // ---- Load device private keys for E2EE unwrapping ----

  const loadDevicePrivateKeys = useCallback(async (): Promise<{
    ecdhPrivateKey: Uint8Array;
    kemPrivateKey: Uint8Array;
  } | null> => {
    if (!identity) return null;
    const deviceId = getCurrentDeviceId();
    const wrappingKey = getWrappingKey();
    if (!deviceId || !wrappingKey) return null;

    try {
      const storedKeys = await getDeviceKeysForIdentity(identity.id);
      const myDeviceKeys = storedKeys.find((k) => k.deviceId === deviceId);
      if (!myDeviceKeys) return null;

      const decrypted = await decryptDeviceKeys(myDeviceKeys, wrappingKey);
      return {
        ecdhPrivateKey: decrypted.ecdhPrivateKey,
        kemPrivateKey: decrypted.kemPrivateKey,
      };
    } catch (err) {
      console.error('[CallSession] Failed to load device keys for E2EE:', err);
      return null;
    }
  }, [identity, getCurrentDeviceId, getWrappingKey]);

  // ---- Build CallKeyRecipient[] from conversation participant devices ----

  const buildCallKeyRecipients = useCallback(async (
    conversationId: string
  ): Promise<CallKeyRecipient[]> => {
    try {
      const convResp = await apiBundle.conversations.get(conversationId);
      if (!convResp.data) return [];

      const participantIds: string[] = convResp.data.participants;
      const recipients: CallKeyRecipient[] = [];

      for (const participantId of participantIds) {
        try {
          const keysResp = await apiBundle.identity.getPublicKeys(participantId);
          if (!keysResp.data) continue;

          const { signingPublicKey, preferredCryptoProfile, devices } = keysResp.data;

          for (const device of devices) {
            if (!device.kemPublicKey) continue;
            recipients.push({
              identityId: participantId,
              ecdhPublicKey: device.ecdhPublicKey,
              kemPublicKey: device.kemPublicKey,
              signingPublicKey,
              preferredCryptoProfile: (preferredCryptoProfile ?? 'default') as 'default' | 'cnsa2',
            });
          }
        } catch {
          console.warn('[CallSession] Failed to fetch keys for participant:', participantId);
        }
      }

      return recipients;
    } catch (err) {
      console.error('[CallSession] Failed to build call key recipients:', err);
      return [];
    }
  }, [apiBundle]);

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
        let callE2EEKey: Uint8Array | undefined;

        if (pendingIsJoin && pendingCallId) {
          const resp = await apiJoinCall(client, pendingConversationId, pendingCallId, pendingCallType);
          if (!resp.success || !resp.data) {
            if (resp.error?.code === 'ALREADY_IN_CALL') {
              throw new CallSessionError(t('call.alreadyJoinedCall'), 'ALREADY_IN_CALL');
            }
            throw new CallSessionError(
              resp.error?.message ?? t('call.callJoinFailed'),
              resp.error?.code,
            );
          }
          call = resp.data.call;
          livekitToken = resp.data.livekitToken;
          livekitUrl = resp.data.livekitUrl;
          streamQualityCaps = resp.data.streamQualityCaps;

          if (e2eeSupported && call.wrappedE2EEKeys && call.wrappedE2EEKeys.length > 0) {
            const deviceKeys = await loadDevicePrivateKeys();
            if (!deviceKeys) {
              throw new Error(t('call.e2eeFailed'));
            }
            try {
              const unwrapped = deserializeAndUnwrapCallKey(
                call.wrappedE2EEKeys,
                identity.id,
                deviceKeys.ecdhPrivateKey,
                deviceKeys.kemPrivateKey,
              );
              if (!unwrapped) {
                throw new Error(t('call.e2eeFailed'));
              }
              callE2EEKey = unwrapped;
            } catch (e2eeErr) {
              try {
                await apiLeaveCall(client, pendingConversationId, call.id);
              } catch {
                /* Best-effort rollback so a failed unwrap does not leave a ghost participant */
              }
              throw e2eeErr;
            } finally {
              clearBytes(deviceKeys.ecdhPrivateKey);
              clearBytes(deviceKeys.kemPrivateKey);
            }
          }
        } else {
          let wrappedE2EEKeys: SerializedWrappedCallKey[] | undefined;

          if (e2eeSupported) {
            callE2EEKey = generateCallE2EEKey();
            try {
              const recipients = await buildCallKeyRecipients(pendingConversationId);
              if (recipients.length > 0) {
                wrappedE2EEKeys = wrapAndSerializeCallKey(callE2EEKey, recipients);
              } else {
                console.warn('[CallSession] No recipients for E2EE key wrapping; call will proceed without E2EE.');
                zeroCallKey(callE2EEKey);
                callE2EEKey = undefined;
              }
            } catch (wrapErr) {
              if (callE2EEKey) {
                zeroCallKey(callE2EEKey);
                callE2EEKey = undefined;
              }
              throw wrapErr;
            }
          }

          const resp = await apiInitiateCall(client, pendingConversationId, pendingCallType, wrappedE2EEKeys);
          if (!resp.success || !resp.data) {
            if (callE2EEKey) {
              zeroCallKey(callE2EEKey);
              callE2EEKey = undefined;
            }
            const errorCode = resp.error?.code;
            if (errorCode === 'ALREADY_IN_CALL') {
              throw new CallSessionError(t('call.alreadyJoinedCall'), 'ALREADY_IN_CALL');
            }
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
          callE2EEKey,
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
      e2eeSupported,
      cancelDeviceSetup,
      loadDevicePrivateKeys,
      buildCallKeyRecipients,
    ],
  );

  // ---- Leave / End ----

  const cleanup = useCallback(() => {
    const currentSession = sessionRef.current;
    if (currentSession?.callE2EEKey) {
      zeroCallKey(currentSession.callE2EEKey);
    }
    setSession(null);
    setPhase('idle');
  }, []);

  const leaveCallAction = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      cleanup();
      return;
    }

    cleanup();

    try {
      await apiLeaveCall(client, currentSession.conversationId, currentSession.call.id);
    } catch {
      // Best-effort server notification; session already cleaned up above
    }
  }, [client, cleanup]);

  useEffect(() => {
    registerConversationCallLeave(leaveCallAction);
    return () => registerConversationCallLeave(null);
  }, [leaveCallAction]);

  const endCallAction = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      cleanup();
      return;
    }

    cleanup();

    try {
      await apiEndCall(client, currentSession.conversationId, currentSession.call.id);
    } catch {
      // Best-effort server notification; session already cleaned up above
    }
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
      callE2EEKey: session?.callE2EEKey ?? null,
      e2eeSupported,
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
      e2eeSupported,
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
