/**
 * Space voice-channel session: presence join/leave + lazy LiveKit auto-connect.
 */

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
import {
  createApiClient,
  type ChatIncomingMessage,
  type PublicSpaceVoiceSession,
  type SpaceVoiceMediaState,
} from '@adieuu/shared';
import { deriveVoiceChannelMediaKey, type CommunityCipher } from '@adieuu/crypto';
import { isE2EESupported } from '../services/callCryptoService';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import { useChatSocket } from './useChatSocket';
import { useSpaces } from './spaces/useSpaces';
import { useCipherStore } from './useCipherStore';
import {
  getChannelCipherLink,
  getSpaceCipherLink,
} from '../services/spaceCipherService';
import {
  clearOtherMediaSession,
  registerVoiceChannelLeave,
} from '../services/mediaSessionExclusive';
import { useToast } from '../components/Toast';
import {
  getAvJoinMediaFlags,
  getAvShowDeviceSetup,
  setAvMicDeviceId,
  setAvCameraDeviceId,
  setAvSpeakerDeviceId,
} from './avPreferenceStorage';
import type { CallDeviceSelection } from '../components/call/CallDeviceSetupModal';

export type VoiceChannelPhase = 'idle' | 'device-setup' | 'present' | 'connecting' | 'live';

interface VoiceChannelSessionState {
  spaceId: string;
  channelId: string;
  session: PublicSpaceVoiceSession;
  livekitToken?: string;
  livekitUrl?: string;
  callE2EEKey?: Uint8Array;
  mediaState: SpaceVoiceMediaState;
}

export interface VoiceChannelSessionContextValue {
  /** Presence sessions keyed by channelId for the active Space. */
  presenceByChannel: Record<string, PublicSpaceVoiceSession>;
  /** Locally joined voice channel (presence), if any. */
  joined: VoiceChannelSessionState | null;
  phase: VoiceChannelPhase;
  /** Pending space/channel while the pre-join device modal is open. */
  pendingDeviceSetup: { spaceId: string; channelId: string } | null;
  livekitUrl: string | null;
  livekitToken: string | null;
  callE2EEKey: Uint8Array | null;
  e2eeSupported: boolean;
  mediaState: SpaceVoiceMediaState;

  joinVoiceChannel: (spaceId: string, channelId: string) => Promise<void>;
  confirmVoiceDeviceSetup: (devices: CallDeviceSelection) => Promise<void>;
  cancelVoiceDeviceSetup: () => void;
  leaveVoiceChannel: () => Promise<void>;
  setMediaState: (patch: Partial<SpaceVoiceMediaState>) => Promise<void>;
}

const VoiceChannelSessionContext = createContext<VoiceChannelSessionContextValue | null>(null);

export function useVoiceChannelSession(): VoiceChannelSessionContextValue {
  const ctx = useContext(VoiceChannelSessionContext);
  if (!ctx) {
    throw new Error('useVoiceChannelSession must be used within a VoiceChannelSessionProvider');
  }
  return ctx;
}

/** Safe for trees that may not mount the provider (public shell). */
export function useOptionalVoiceChannelSession(): VoiceChannelSessionContextValue | null {
  return useContext(VoiceChannelSessionContext);
}

function defaultMedia(): SpaceVoiceMediaState {
  const flags = getAvJoinMediaFlags();
  return { audio: flags.audio, video: flags.video, screenshare: false };
}

function resolveVoiceCipher(
  spaceId: string,
  channelId: string,
  getCipherKey: (id: string) => CommunityCipher | null,
): CommunityCipher | null {
  const localId = getChannelCipherLink(channelId) ?? getSpaceCipherLink(spaceId);
  if (!localId) return null;
  return getCipherKey(localId);
}

export function VoiceChannelSessionProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { identity } = useIdentity();
  const { subscribe } = useChatSocket();
  const { activeSpace, channels } = useSpaces();
  const { getCipherKey } = useCipherStore();
  const e2eeSupported = useMemo(() => isE2EESupported(), []);

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [presenceByChannel, setPresenceByChannel] = useState<
    Record<string, PublicSpaceVoiceSession>
  >({});
  const [joined, setJoined] = useState<VoiceChannelSessionState | null>(null);
  const [phase, setPhase] = useState<VoiceChannelPhase>('idle');
  const [pendingDeviceSetup, setPendingDeviceSetup] = useState<{
    spaceId: string;
    channelId: string;
  } | null>(null);

  const joinedRef = useRef(joined);
  joinedRef.current = joined;
  const pendingDeviceSetupRef = useRef(pendingDeviceSetup);
  pendingDeviceSetupRef.current = pendingDeviceSetup;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const deriveMediaKey = useCallback(
    (spaceId: string, channelId: string, channelHasCipher: boolean): Uint8Array | null => {
      if (!channelHasCipher) return null;
      const cipher = resolveVoiceCipher(spaceId, channelId, getCipherKey);
      if (!cipher) return null;
      if (!e2eeSupported) return null;
      return deriveVoiceChannelMediaKey(cipher, spaceId, channelId);
    },
    [getCipherKey, e2eeSupported],
  );

  const applyLiveConnection = useCallback(
    (
      spaceId: string,
      channelId: string,
      session: PublicSpaceVoiceSession,
      livekitToken: string,
      livekitUrl: string,
      mediaState: SpaceVoiceMediaState,
    ) => {
      const channel = channels.find((c) => c.id === channelId);
      const needsCipher = !!channel?.cipherCheck;
      if (needsCipher) {
        const key = deriveMediaKey(spaceId, channelId, true);
        if (!key) {
          toast.error(t('spaces.voice.cipherRequired'));
          return;
        }
        setJoined({
          spaceId,
          channelId,
          session,
          livekitToken,
          livekitUrl,
          callE2EEKey: key,
          mediaState,
        });
        setPhase('live');
        return;
      }
      setJoined({
        spaceId,
        channelId,
        session,
        livekitToken,
        livekitUrl,
        mediaState,
      });
      setPhase('live');
    },
    [channels, deriveMediaKey, toast, t],
  );

  const leaveVoiceChannel = useCallback(async () => {
    const current = joinedRef.current;
    if (!current) {
      setPendingDeviceSetup(null);
      setPhase('idle');
      return;
    }
    const { spaceId, channelId } = current;
    setJoined(null);
    setPendingDeviceSetup(null);
    setPhase('idle');
    try {
      await api.spaces.leaveVoiceChannel(spaceId, channelId);
    } catch {
      /* best-effort */
    }
  }, [api]);

  useEffect(() => {
    registerVoiceChannelLeave(leaveVoiceChannel);
    return () => registerVoiceChannelLeave(null);
  }, [leaveVoiceChannel]);

  // Hydrate presence when the active Space changes.
  useEffect(() => {
    if (!activeSpace?.id) {
      setPresenceByChannel({});
      return;
    }
    let cancelled = false;
    void api.spaces.listVoicePresence(activeSpace.id).then((res) => {
      if (cancelled || !res.success || !res.data?.sessions) return;
      const next: Record<string, PublicSpaceVoiceSession> = {};
      for (const s of res.data.sessions) {
        if (s.status === 'ended') continue;
        next[s.channelId] = s;
      }
      setPresenceByChannel(next);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSpace?.id, api]);

  // Socket: presence + auto-connect tokens.
  useEffect(() => {
    return subscribe((message: ChatIncomingMessage) => {
      if (message.type === 'voice_channel_presence_updated') {
        const { spaceId, channelId, session } = message.data;
        if (activeSpace?.id && spaceId !== activeSpace.id) return;
        setPresenceByChannel((prev) => {
          const active = session.participants.filter((p) => !p.leftAt);
          if (active.length === 0 && !session.roomName) {
            const { [channelId]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [channelId]: session };
        });
        setJoined((prev) =>
          prev && prev.channelId === channelId ? { ...prev, session } : prev,
        );
        return;
      }

      if (message.type === 'voice_channel_call_started') {
        const { spaceId, channelId, session, livekitToken, livekitUrl } = message.data;
        const current = joinedRef.current;
        if (!current || current.channelId !== channelId || current.spaceId !== spaceId) {
          return;
        }
        setPresenceByChannel((prev) => ({ ...prev, [channelId]: session }));
        applyLiveConnection(
          spaceId,
          channelId,
          session,
          livekitToken,
          livekitUrl,
          current.mediaState,
        );
        return;
      }

      if (message.type === 'voice_channel_call_ended') {
        const { channelId } = message.data;
        setPresenceByChannel((prev) => {
          const existing = prev[channelId];
          if (!existing) return prev;
          return {
            ...prev,
            [channelId]: { ...existing, roomName: null, status: 'waiting' },
          };
        });
        setJoined((prev) => {
          if (!prev || prev.channelId !== channelId) return prev;
          setPhase('present');
          return {
            ...prev,
            livekitToken: undefined,
            livekitUrl: undefined,
            callE2EEKey: undefined,
            session: { ...prev.session, roomName: null, status: 'waiting' },
          };
        });
        return;
      }

      if (message.type === 'voice_channel_media_state_changed') {
        const { channelId, identityId, mediaState } = message.data;
        setPresenceByChannel((prev) => {
          const session = prev[channelId];
          if (!session) return prev;
          return {
            ...prev,
            [channelId]: {
              ...session,
              participants: session.participants.map((p) =>
                p.identityId === identityId && !p.leftAt ? { ...p, mediaState } : p,
              ),
            },
          };
        });
      }
    });
  }, [subscribe, activeSpace?.id, applyLiveConnection]);

  const completeVoiceJoin = useCallback(
    async (spaceId: string, channelId: string) => {
      const mediaState = defaultMedia();
      setPhase('connecting');

      const res = await api.spaces.joinVoiceChannel(spaceId, channelId, mediaState);
      if (!res.success || !res.data?.session) {
        setPhase(joinedRef.current ? 'present' : 'idle');
        toast.error(
          typeof res.error === 'string' ? res.error : t('spaces.voice.joinFailed'),
        );
        return;
      }

      const session = res.data.session;
      setPresenceByChannel((prev) => ({ ...prev, [channelId]: session }));

      if (res.data.livekitToken && res.data.livekitUrl) {
        applyLiveConnection(
          spaceId,
          channelId,
          session,
          res.data.livekitToken,
          res.data.livekitUrl,
          mediaState,
        );
        return;
      }

      setJoined({
        spaceId,
        channelId,
        session,
        mediaState,
      });
      setPhase('present');
    },
    [api, applyLiveConnection, toast, t],
  );

  const cancelVoiceDeviceSetup = useCallback(() => {
    setPendingDeviceSetup(null);
    setPhase(joinedRef.current ? (joinedRef.current.livekitToken ? 'live' : 'present') : 'idle');
  }, []);

  const confirmVoiceDeviceSetup = useCallback(
    async (devices: CallDeviceSelection) => {
      const pending = pendingDeviceSetupRef.current;
      if (!pending) {
        cancelVoiceDeviceSetup();
        return;
      }
      if (devices.audioDeviceId !== undefined) setAvMicDeviceId(devices.audioDeviceId);
      if (devices.videoDeviceId !== undefined) setAvCameraDeviceId(devices.videoDeviceId);
      if (devices.speakerDeviceId !== undefined) setAvSpeakerDeviceId(devices.speakerDeviceId);
      setPendingDeviceSetup(null);
      await completeVoiceJoin(pending.spaceId, pending.channelId);
    },
    [cancelVoiceDeviceSetup, completeVoiceJoin],
  );

  const joinVoiceChannel = useCallback(
    async (spaceId: string, channelId: string) => {
      if (!identity?.id) return;
      if (phaseRef.current === 'device-setup' || phaseRef.current === 'connecting') return;

      const channel = channels.find((c) => c.id === channelId);
      if (channel?.cipherCheck) {
        const cipher = resolveVoiceCipher(spaceId, channelId, getCipherKey);
        if (!cipher) {
          toast.error(t('spaces.voice.cipherRequired'));
          return;
        }
      }

      const current = joinedRef.current;
      if (current && (current.channelId !== channelId || current.spaceId !== spaceId)) {
        await leaveVoiceChannel();
      }

      await clearOtherMediaSession('voice');

      if (getAvShowDeviceSetup()) {
        setPendingDeviceSetup({ spaceId, channelId });
        setPhase('device-setup');
        return;
      }

      await completeVoiceJoin(spaceId, channelId);
    },
    [
      identity?.id,
      channels,
      getCipherKey,
      toast,
      t,
      leaveVoiceChannel,
      completeVoiceJoin,
    ],
  );

  const setMediaState = useCallback(
    async (patch: Partial<SpaceVoiceMediaState>) => {
      const current = joinedRef.current;
      if (!current) return;
      const next = { ...current.mediaState, ...patch };
      setJoined({ ...current, mediaState: next });
      try {
        await api.spaces.updateVoiceMedia(current.spaceId, current.channelId, next);
      } catch {
        /* ignore */
      }
    },
    [api],
  );

  const value = useMemo<VoiceChannelSessionContextValue>(
    () => ({
      presenceByChannel,
      joined,
      phase,
      pendingDeviceSetup,
      livekitUrl: joined?.livekitUrl ?? null,
      livekitToken: joined?.livekitToken ?? null,
      callE2EEKey: joined?.callE2EEKey ?? null,
      e2eeSupported,
      mediaState: joined?.mediaState ?? defaultMedia(),
      joinVoiceChannel,
      confirmVoiceDeviceSetup,
      cancelVoiceDeviceSetup,
      leaveVoiceChannel,
      setMediaState,
    }),
    [
      presenceByChannel,
      joined,
      phase,
      pendingDeviceSetup,
      e2eeSupported,
      joinVoiceChannel,
      confirmVoiceDeviceSetup,
      cancelVoiceDeviceSetup,
      leaveVoiceChannel,
      setMediaState,
    ],
  );

  return (
    <VoiceChannelSessionContext.Provider value={value}>
      {children}
    </VoiceChannelSessionContext.Provider>
  );
}
