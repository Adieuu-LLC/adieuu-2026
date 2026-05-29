/**
 * Call State Hook
 *
 * Tracks the active call for a conversation, listens to real-time WebSocket
 * events (call_initiated, call_participant_joined, call_participant_left,
 * call_ended, call_media_state_changed), and exposes methods for call
 * lifecycle management.
 *
 * @module hooks/useCall
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ChatIncomingMessage } from '@adieuu/shared';
import { useIdentity } from './useIdentity';
import { useAppConfig } from '../config';
import { useChatSocket } from './useChatSocket';
import {
  initiateCall as apiInitiateCall,
  joinCall as apiJoinCall,
  leaveCall as apiLeaveCall,
  endCall as apiEndCall,
  getActiveCall as apiGetActiveCall,
  type CallMediaOptions,
  type PublicCall,
  type PublicCallParticipant,
} from '../services/callService';
import { createApiClient } from '@adieuu/shared';

export type { PublicCall, PublicCallParticipant, CallMediaOptions } from '../services/callService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CallState {
  activeCall: PublicCall | null;
  loading: boolean;
}

export interface UseCallReturn {
  activeCall: PublicCall | null;
  isInCall: boolean;
  participants: PublicCallParticipant[];
  loading: boolean;
  startCall: (media: CallMediaOptions) => Promise<StartCallResult>;
  joinCall: (callId: string, media: CallMediaOptions) => Promise<JoinCallResult>;
  leaveCall: () => Promise<boolean>;
  endCall: () => Promise<boolean>;
  refetch: () => Promise<void>;
}

export interface StartCallResult {
  success: boolean;
  call?: PublicCall;
  jitsiToken?: string;
  error?: string;
}

export interface JoinCallResult {
  success: boolean;
  call?: PublicCall;
  jitsiToken?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCall(conversationId: string | null): UseCallReturn {
  const { identity, api: identityApi } = useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { subscribe, onStateChange } = useChatSocket();

  const client = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }).client,
    [apiBaseUrl]
  );

  const [state, setState] = useState<CallState>({
    activeCall: null,
    loading: false,
  });

  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const activeCallRef = useRef(state.activeCall);
  activeCallRef.current = state.activeCall;

  // ---- Fetch active call ----

  const fetchActiveCall = useCallback(async () => {
    const convId = conversationIdRef.current;
    if (!convId || !identityRef.current) return;

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const resp = await apiGetActiveCall(client, convId);
      if (resp.success && resp.data) {
        setState({ activeCall: resp.data.call, loading: false });
      } else {
        setState({ activeCall: null, loading: false });
      }
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [client]);

  // ---- Call lifecycle ----

  const startCall = useCallback(
    async (media: CallMediaOptions): Promise<StartCallResult> => {
      if (!conversationId || !identity) {
        return { success: false, error: 'Not authenticated' };
      }

      try {
        const resp = await apiInitiateCall(client, conversationId, media);
        if (resp.success && resp.data) {
          setState({ activeCall: resp.data.call, loading: false });
          return {
            success: true,
            call: resp.data.call,
            jitsiToken: resp.data.jitsiToken,
          };
        }
        return {
          success: false,
          error: resp.error?.message ?? 'Failed to start call',
        };
      } catch {
        return { success: false, error: 'Failed to start call' };
      }
    },
    [conversationId, identity, client]
  );

  const joinCallAction = useCallback(
    async (callId: string, media: CallMediaOptions): Promise<JoinCallResult> => {
      if (!conversationId || !identity) {
        return { success: false, error: 'Not authenticated' };
      }

      try {
        const resp = await apiJoinCall(client, conversationId, callId, media);
        if (resp.success && resp.data) {
          setState({ activeCall: resp.data.call, loading: false });
          return {
            success: true,
            call: resp.data.call,
            jitsiToken: resp.data.jitsiToken,
          };
        }
        return {
          success: false,
          error: resp.error?.message ?? 'Failed to join call',
        };
      } catch {
        return { success: false, error: 'Failed to join call' };
      }
    },
    [conversationId, identity, client]
  );

  const leaveCallAction = useCallback(async (): Promise<boolean> => {
    const call = activeCallRef.current;
    if (!conversationId || !call) return false;

    try {
      const resp = await apiLeaveCall(client, conversationId, call.id);
      if (resp.success && resp.data) {
        const updatedCall = resp.data.call;
        const stillActive = updatedCall.status !== 'ended';
        setState({
          activeCall: stillActive ? updatedCall : null,
          loading: false,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [conversationId, client]);

  const endCallAction = useCallback(async (): Promise<boolean> => {
    const call = activeCallRef.current;
    if (!conversationId || !call) return false;

    try {
      const resp = await apiEndCall(client, conversationId, call.id);
      if (resp.success) {
        setState({ activeCall: null, loading: false });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [conversationId, client]);

  // ---- WebSocket events ----

  useEffect(() => {
    const unsubscribe = subscribe((message: ChatIncomingMessage) => {
      const convId = conversationIdRef.current;
      if (!convId) return;

      switch (message.type) {
        case 'call_initiated': {
          const { call } = message.data;
          if (call.conversationId !== convId) return;
          setState({
            activeCall: {
              id: call.id,
              conversationId: call.conversationId,
              initiatorIdentityId: call.initiatorIdentityId,
              status: call.status as PublicCall['status'],
              allowedMedia: call.allowedMedia,
              participants: [],
              jitsiRoomName: call.jitsiRoomName,
              createdAt: call.createdAt,
              updatedAt: call.createdAt,
            },
            loading: false,
          });
          break;
        }

        case 'call_participant_joined': {
          const { callId, identityId, mediaState } = message.data;
          setState((prev) => {
            if (!prev.activeCall || prev.activeCall.id !== callId) return prev;
            const existing = prev.activeCall.participants.some(
              (p) => p.identityId === identityId && !p.leftAt
            );
            if (existing) return prev;
            return {
              ...prev,
              activeCall: {
                ...prev.activeCall,
                status: 'active',
                participants: [
                  ...prev.activeCall.participants,
                  {
                    identityId,
                    joinedAt: new Date().toISOString(),
                    mediaState,
                  },
                ],
              },
            };
          });
          break;
        }

        case 'call_participant_left': {
          const { callId, identityId } = message.data;
          setState((prev) => {
            if (!prev.activeCall || prev.activeCall.id !== callId) return prev;
            return {
              ...prev,
              activeCall: {
                ...prev.activeCall,
                participants: prev.activeCall.participants.map((p) =>
                  p.identityId === identityId && !p.leftAt
                    ? { ...p, leftAt: new Date().toISOString() }
                    : p
                ),
              },
            };
          });
          break;
        }

        case 'call_ended': {
          const { callId } = message.data;
          setState((prev) => {
            if (!prev.activeCall || prev.activeCall.id !== callId) return prev;
            return { activeCall: null, loading: false };
          });
          break;
        }

        case 'call_media_state_changed': {
          const { callId, identityId, mediaState } = message.data;
          setState((prev) => {
            if (!prev.activeCall || prev.activeCall.id !== callId) return prev;
            return {
              ...prev,
              activeCall: {
                ...prev.activeCall,
                participants: prev.activeCall.participants.map((p) =>
                  p.identityId === identityId && !p.leftAt
                    ? { ...p, mediaState }
                    : p
                ),
              },
            };
          });
          break;
        }
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // ---- Refetch on reconnect ----

  const fetchActiveCallRef = useRef(fetchActiveCall);
  fetchActiveCallRef.current = fetchActiveCall;

  useEffect(() => {
    const unsub = onStateChange((socketState) => {
      if (socketState === 'connected') {
        fetchActiveCallRef.current();
      }
    });
    return unsub;
  }, [onStateChange]);

  // ---- Reset on conversation change ----

  useEffect(() => {
    setState({ activeCall: null, loading: false });
    if (conversationId && identity) {
      fetchActiveCall();
    }
  }, [conversationId, identity?.id]);

  // ---- Derived state ----

  const isInCall = useMemo(() => {
    if (!state.activeCall || !identity) return false;
    return state.activeCall.participants.some(
      (p) => p.identityId === identity.id && !p.leftAt
    );
  }, [state.activeCall, identity]);

  const activeParticipants = useMemo(() => {
    if (!state.activeCall) return [];
    return state.activeCall.participants.filter((p) => !p.leftAt);
  }, [state.activeCall]);

  return {
    activeCall: state.activeCall,
    isInCall,
    participants: activeParticipants,
    loading: state.loading,
    startCall,
    joinCall: joinCallAction,
    leaveCall: leaveCallAction,
    endCall: endCallAction,
    refetch: fetchActiveCall,
  };
}
