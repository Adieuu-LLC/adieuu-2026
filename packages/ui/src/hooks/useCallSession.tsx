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
import { useToast } from '../components/Toast';
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
import {
  getAvJoinMediaFlags,
  getAvShowDeviceSetup,
  setAvMicDeviceId,
  setAvCameraDeviceId,
  setAvSpeakerDeviceId,
} from './avPreferenceStorage';
import type { CallDeviceSelection } from '../components/call/CallDeviceSetupModal';

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

  confirmDeviceSetup: (devices: CallDeviceSelection) => Promise<void>;
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
  const toast = useToast();
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
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Synchronous pending snapshot so we can connect without waiting for setState.
  const pendingRef = useRef<{
    callType: CallMediaOptions | null;
    conversationId: string | null;
    isJoin: boolean;
    callId: string | null;
  }>({ callType: null, conversationId: null, isJoin: false, callId: null });

  const setPending = useCallback(
    (next: {
      callType: CallMediaOptions | null;
      conversationId: string | null;
      isJoin: boolean;
      callId: string | null;
    }) => {
      pendingRef.current = next;
      setPendingCallType(next.callType);
      setPendingConversationId(next.conversationId);
      setPendingIsJoin(next.isJoin);
      setPendingCallId(next.callId);
    },
    [],
  );

  // ---- Leave (defined early so request handlers can leave-then-join) ----

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

  // ---- Single call at a time: leave any current session, then set up ----

  const resolveJoinMedia = useCallback((_media: CallMediaOptions): CallMediaOptions => {
    const flags = getAvJoinMediaFlags();
    return {
      audio: flags.audio,
      video: flags.video,
      screenshare: false,
    };
  }, []);

  const cancelDeviceSetup = useCallback(() => {
    setPending({ callType: null, conversationId: null, isJoin: false, callId: null });
    setPhase('idle');
  }, [setPending]);

  const persistDeviceSelection = useCallback((devices: CallDeviceSelection) => {
    if (devices.audioDeviceId !== undefined) {
      setAvMicDeviceId(devices.audioDeviceId);
    }
    if (devices.videoDeviceId !== undefined) {
      setAvCameraDeviceId(devices.videoDeviceId);
    }
    if (devices.speakerDeviceId !== undefined) {
      setAvSpeakerDeviceId(devices.speakerDeviceId);
    }
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
    async (devices: CallDeviceSelection = {}) => {
      const pending = pendingRef.current;
      if (!pending.callType || !pending.conversationId || !identity) {
        cancelDeviceSetup();
        return;
      }

      persistDeviceSelection(devices);
      setPhase('connecting');

      const { callType, conversationId, isJoin, callId } = pending;

      try {
        let call: PublicCall;
        let livekitToken: string | undefined;
        let livekitUrl: string | undefined;
        let streamQualityCaps: StreamQualityCaps | undefined;
        let callE2EEKey: Uint8Array | undefined;

        if (isJoin && callId) {
          const resp = await apiJoinCall(client, conversationId, callId, callType);
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
                await apiLeaveCall(client, conversationId, call.id);
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
              const recipients = await buildCallKeyRecipients(conversationId);
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

          const resp = await apiInitiateCall(client, conversationId, callType, wrappedE2EEKeys);
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
          conversationId,
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
        setPending({ callType: null, conversationId: null, isJoin: false, callId: null });
      }
    },
    [
      identity,
      client,
      t,
      e2eeSupported,
      cancelDeviceSetup,
      loadDevicePrivateKeys,
      buildCallKeyRecipients,
      persistDeviceSelection,
      setPending,
    ],
  );

  const beginCallRequest = useCallback(
    async (opts: {
      conversationId: string;
      media: CallMediaOptions;
      isJoin: boolean;
      callId: string | null;
    }) => {
      if (phaseRef.current === 'device-setup' || phaseRef.current === 'connecting') return;
      if (sessionRef.current !== null) {
        await leaveCallAction();
      }
      await clearOtherMediaSession('conversation');

      const callType = resolveJoinMedia(opts.media);
      setPending({
        callType,
        conversationId: opts.conversationId,
        isJoin: opts.isJoin,
        callId: opts.callId,
      });

      if (getAvShowDeviceSetup()) {
        setPhase('device-setup');
        return;
      }

      try {
        await confirmDeviceSetup({});
      } catch (err) {
        if (err instanceof CallSessionError && err.code === 'ALREADY_IN_CALL') {
          toast.error(t('call.alreadyJoinedCall'));
          return;
        }
        const message = err instanceof Error ? err.message : t('call.callStartFailed');
        toast.error(message);
      }
    },
    [leaveCallAction, resolveJoinMedia, setPending, confirmDeviceSetup, toast, t],
  );

  const requestStartCall = useCallback(
    (conversationId: string, media: CallMediaOptions) => {
      void beginCallRequest({
        conversationId,
        media,
        isJoin: false,
        callId: null,
      });
    },
    [beginCallRequest],
  );

  const requestJoinCall = useCallback(
    (conversationId: string, callId: string, media: CallMediaOptions) => {
      void beginCallRequest({
        conversationId,
        media,
        isJoin: true,
        callId,
      });
    },
    [beginCallRequest],
  );

  // ---- End ----

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
