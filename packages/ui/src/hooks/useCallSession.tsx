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
  updateMediaState as apiUpdateMediaState,
  type CallMediaOptions,
  type PublicCall,
} from '../services/callService';
import { applyCallSocketMessage } from './callStateUpdates';
import { parseRetryAfterSeconds } from './callStateUpdates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CallSessionPhase = 'idle' | 'device-setup' | 'connecting' | 'active';

/**
 * Thin wrapper around a Jitsi remote track that hides lib-jitsi-meet types
 * from the rest of the UI layer.
 */
export interface RemoteTrack {
  id: string;
  /** Jitsi-assigned participant ID (XMPP resource). */
  jitsiParticipantId: string;
  trackType: 'audio' | 'video';
  attach: (element: HTMLElement) => void;
  detach: (element: HTMLElement) => void;
}

interface CallSession {
  conversationId: string;
  call: PublicCall;
  jitsiToken?: string;
  jitsiDomain?: string;
  jitsiMucDomain?: string;
}

export interface CallSessionContextValue {
  activeSession: CallSession | null;
  phase: CallSessionPhase;
  pendingCallType: CallMediaOptions | null;
  pendingConversationId: string | null;
  pendingIsJoin: boolean;
  pendingCallId: string | null;

  remoteTracks: RemoteTrack[];
  /**
   * Maps Jitsi participant IDs to Adieuu identity IDs.
   * Populated via `setLocalParticipantProperty` + PARTICIPANT_PROPERTY_CHANGED.
   */
  jitsiParticipantMap: ReadonlyMap<string, string>;

  /**
   * Unified audio state -- delegates to Jitsi when a conference is active,
   * falls back to callMedia when Jitsi is not configured.
   */
  isAudioEnabled: boolean;
  toggleAudio: () => void;

  isVideoEnabled: boolean;
  toggleVideo: () => void;

  isScreensharing: boolean;
  toggleScreenshare: () => void;

  /** Switch microphone input device mid-call (Jitsi). */
  switchAudioInput: (deviceId: string) => Promise<void>;
  /** Switch camera input device mid-call (Jitsi). */
  switchVideoInput: (deviceId: string) => Promise<void>;
  /** Selected audio output device ID for setSinkId on remote audio elements. */
  audioOutputDeviceId: string | null;
  setAudioOutput: (deviceId: string) => void;

  requestStartCall: (conversationId: string, media: CallMediaOptions) => void;
  requestJoinCall: (conversationId: string, callId: string, media: CallMediaOptions) => void;

  confirmDeviceSetup: (devices: { audioDeviceId?: string }) => Promise<void>;
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

function jitsiConfigFromBaseUrl(
  baseUrl: string,
  xmppDomain?: string,
  mucDomain?: string,
): JitsiServiceConfig {
  const url = new URL(baseUrl);
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    serverHost: url.hostname,
    // url.host preserves the port (e.g. "localhost:8443") unlike url.hostname
    serviceUrl: `${wsProtocol}//${url.host}/xmpp-websocket`,
    xmppDomain,
    mucDomain,
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
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [jitsiParticipantMap, setJitsiParticipantMap] = useState<Map<string, string>>(new Map());
  // null = Jitsi not managing audio (use callMedia), boolean = Jitsi owns audio
  const [jitsiAudioEnabled, setJitsiAudioEnabled] = useState<boolean | null>(null);
  const [jitsiVideoEnabled, setJitsiVideoEnabled] = useState<boolean | null>(null);
  const [jitsiScreensharing, setJitsiScreensharing] = useState(false);
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string | null>(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const jitsiRef = useRef<JitsiService | null>(null);
  const jitsiUnsubRef = useRef<(() => void) | null>(null);

  // ---- Helper: sync media state to API ----

  const syncMediaState = useCallback(
    (audio: boolean, video: boolean, screenshare: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      void apiUpdateMediaState(client, s.conversationId, s.call.id, { audio, video, screenshare });
    },
    [client],
  );

  // ---- Unified audio toggle (Jitsi-first, callMedia fallback) ----

  const isAudioEnabled = jitsiAudioEnabled !== null ? jitsiAudioEnabled : callMedia.isAudioEnabled;

  const toggleAudio = useCallback(() => {
    if (jitsiRef.current && jitsiAudioEnabled !== null) {
      const newEnabled = !jitsiAudioEnabled;
      void jitsiRef.current.setTrackMuted('audio', !newEnabled);
      setJitsiAudioEnabled(newEnabled);
      syncMediaState(newEnabled, jitsiVideoEnabled === true, jitsiScreensharing);
    } else {
      callMedia.toggleAudio();
    }
  }, [jitsiAudioEnabled, jitsiVideoEnabled, jitsiScreensharing, callMedia, syncMediaState]);

  // ---- Unified video toggle ----

  const isVideoEnabled = jitsiVideoEnabled !== null ? jitsiVideoEnabled : callMedia.isVideoEnabled;

  const toggleVideo = useCallback(() => {
    const jitsi = jitsiRef.current;
    if (jitsi) {
      if (jitsiVideoEnabled) {
        void jitsi.setTrackMuted('video', true);
        setJitsiVideoEnabled(false);
        syncMediaState(jitsiAudioEnabled === true, false, jitsiScreensharing);
      } else {
        if (jitsiVideoEnabled === null) {
          void jitsi.createLocalTracks({ audio: false, video: true }).then(() => {
            setJitsiVideoEnabled(true);
            syncMediaState(jitsiAudioEnabled === true, true, jitsiScreensharing);
          });
        } else {
          void jitsi.setTrackMuted('video', false);
          setJitsiVideoEnabled(true);
          syncMediaState(jitsiAudioEnabled === true, true, jitsiScreensharing);
        }
      }
    } else {
      callMedia.toggleVideo();
    }
  }, [jitsiVideoEnabled, jitsiAudioEnabled, jitsiScreensharing, callMedia, syncMediaState]);

  // ---- Unified screenshare toggle ----

  const isScreensharing = jitsiRef.current ? jitsiScreensharing : callMedia.isScreensharing;

  const toggleScreenshare = useCallback(() => {
    const jitsi = jitsiRef.current;
    if (jitsi) {
      if (jitsiScreensharing) {
        void jitsi.stopScreenshare().then(() => {
          setJitsiScreensharing(false);
          syncMediaState(jitsiAudioEnabled === true, jitsiVideoEnabled === true, false);
        });
      } else {
        void jitsi.startScreenshare().then((track) => {
          if (track) {
            setJitsiScreensharing(true);
            syncMediaState(jitsiAudioEnabled === true, jitsiVideoEnabled === true, true);
          }
        });
      }
    } else {
      callMedia.toggleScreenshare();
    }
  }, [jitsiScreensharing, jitsiAudioEnabled, jitsiVideoEnabled, callMedia, syncMediaState]);

  // ---- Device switching ----

  const switchAudioInput = useCallback(async (deviceId: string) => {
    const jitsi = jitsiRef.current;
    if (jitsi) {
      await jitsi.replaceAudioTrack(deviceId);
    }
  }, []);

  const switchVideoInput = useCallback(async (deviceId: string) => {
    const jitsi = jitsiRef.current;
    if (jitsi) {
      await jitsi.replaceVideoTrack(deviceId);
    }
  }, []);

  const setAudioOutput = useCallback((deviceId: string) => {
    setAudioOutputDeviceId(deviceId);
  }, []);

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
    async (devices: { audioDeviceId?: string }) => {
      if (!pendingCallType || !pendingConversationId || !identity) {
        cancelDeviceSetup();
        return;
      }

      setPhase('connecting');

      try {
        let call: PublicCall;
        let jitsiToken: string | undefined;
        let jitsiDomain: string | undefined;
        let jitsiMucDomain: string | undefined;

        if (pendingIsJoin && pendingCallId) {
          const resp = await apiJoinCall(client, pendingConversationId, pendingCallId, pendingCallType);
          if (!resp.success || !resp.data) {
            throw new Error(resp.error?.message ?? t('call.callJoinFailed'));
          }
          call = resp.data.call;
          jitsiToken = resp.data.jitsiToken;
          jitsiDomain = resp.data.jitsiDomain;
          jitsiMucDomain = resp.data.jitsiMucDomain;
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
          jitsiDomain = resp.data.jitsiDomain;
          jitsiMucDomain = resp.data.jitsiMucDomain;
        }

        const newSession: CallSession = {
          conversationId: pendingConversationId,
          call,
          jitsiToken,
          jitsiDomain,
          jitsiMucDomain,
        };
        setSession(newSession);

        const jitsiConfigured = !!(jitsiBaseUrl && jitsiToken);

        // When Jitsi is not configured, use callMedia as the fallback
        // for local media capture (audio only, since calls start audio-only).
        if (!jitsiConfigured && pendingCallType.audio) {
          await callMedia.startMedia({
            audio: true,
            video: false,
            audioDeviceId: devices.audioDeviceId,
          });
        }

        if (!jitsiConfigured) {
          console.warn(
            '[CallSession] Jitsi is not configured — audio/video will NOT be relayed to other participants.',
            !jitsiBaseUrl ? 'Missing jitsiBaseUrl (set VITE_JITSI_BASE_URL).' : '',
            !jitsiToken ? 'Server did not return a jitsiToken (set JITSI_ENABLED=true in the API .env).' : '',
          );
        }
        if (jitsiConfigured) {
          const jitsiConfig = jitsiConfigFromBaseUrl(jitsiBaseUrl, jitsiDomain, jitsiMucDomain);
          const { JitsiService: JitsiServiceImpl } = await import(
            /* @vite-ignore */ '../services/jitsiService'
          );
          const jitsi = new JitsiServiceImpl(jitsiConfig);
          jitsiRef.current = jitsi;

          // Subscribe before connecting so we don't miss early events.
          jitsiUnsubRef.current = jitsi.on((event) => {
            switch (event.type) {
              // ---------- Track lifecycle ----------
              case 'remote_track_added': {
                console.info(
                  '[CallSession] Remote track added:',
                  event.track.getType(),
                  'from participant',
                  event.participantId,
                );
                const rt: RemoteTrack = {
                  id: event.track.getId(),
                  jitsiParticipantId: event.participantId,
                  trackType: event.track.getType(),
                  attach: (el: HTMLElement) => event.track.attach(el),
                  detach: (el: HTMLElement) => event.track.detach(el),
                };
                setRemoteTracks((prev) => [...prev, rt]);
                break;
              }
              case 'remote_track_removed': {
                const removedId = event.track.getId();
                setRemoteTracks((prev) => prev.filter((t) => t.id !== removedId));
                break;
              }

              // ---------- Participant identity mapping ----------
              case 'participant_joined': {
                if (event.identityId) {
                  setJitsiParticipantMap((prev) => {
                    const next = new Map(prev);
                    next.set(event.participantId, event.identityId!);
                    return next;
                  });
                }
                break;
              }
              case 'participant_left': {
                setJitsiParticipantMap((prev) => {
                  if (!prev.has(event.participantId)) return prev;
                  const next = new Map(prev);
                  next.delete(event.participantId);
                  return next;
                });
                setRemoteTracks((prev) =>
                  prev.filter((t) => t.jitsiParticipantId !== event.participantId),
                );
                break;
              }
              case 'participant_property_changed': {
                if (event.propertyName === 'identityId' && typeof event.value === 'string') {
                  setJitsiParticipantMap((prev) => {
                    const next = new Map(prev);
                    next.set(event.participantId, event.value as string);
                    return next;
                  });
                }
                break;
              }
            }
          });

          await jitsi.connect(call.jitsiRoomName, jitsiToken!);

          // Advertise our identity to all current and future participants.
          jitsi.setLocalProperty('identityId', identity.id);

          if (pendingCallType.audio) {
            await jitsi.createLocalTracks({ audio: true, video: false });
            setJitsiAudioEnabled(true);
          }
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
    if (jitsiUnsubRef.current) {
      jitsiUnsubRef.current();
      jitsiUnsubRef.current = null;
    }
    if (jitsiRef.current) {
      void jitsiRef.current.dispose();
      jitsiRef.current = null;
    }
    setRemoteTracks([]);
    setJitsiParticipantMap(new Map());
    setJitsiAudioEnabled(null);
    setJitsiVideoEnabled(null);
    setJitsiScreensharing(false);
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
      remoteTracks,
      jitsiParticipantMap,
      isAudioEnabled,
      toggleAudio,
      isVideoEnabled,
      toggleVideo,
      isScreensharing,
      toggleScreenshare,
      switchAudioInput,
      switchVideoInput,
      audioOutputDeviceId,
      setAudioOutput,
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
      remoteTracks,
      jitsiParticipantMap,
      isAudioEnabled,
      toggleAudio,
      isVideoEnabled,
      toggleVideo,
      isScreensharing,
      toggleScreenshare,
      switchAudioInput,
      switchVideoInput,
      audioOutputDeviceId,
      setAudioOutput,
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
