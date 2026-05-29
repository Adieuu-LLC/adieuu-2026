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
import { useTranslation } from 'react-i18next';
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
  errorCode?: string;
  retryAfterSeconds?: number;
}

export interface JoinCallResult {
  success: boolean;
  call?: PublicCall;
  jitsiToken?: string;
  error?: string;
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

import {
  applyCallSocketMessage,
  isIdentityInCall,
  parseRetryAfterSeconds,
} from './callStateUpdates';

export function useCall(conversationId: string | null): UseCallReturn {
  const { t } = useTranslation();
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
        const errorCode = resp.error?.code;
        if (errorCode === 'RATE_LIMITED') {
          const retryAfterSeconds = parseRetryAfterSeconds(resp.error?.details) ?? 30;
          return {
            success: false,
            error: t('call.rateLimited', { seconds: retryAfterSeconds }),
            errorCode,
            retryAfterSeconds,
          };
        }
        if (errorCode === 'JITSI_UNAVAILABLE') {
          return {
            success: false,
            error: t('call.jitsiUnavailable'),
            errorCode,
          };
        }
        return {
          success: false,
          error: resp.error?.message ?? 'Failed to start call',
          errorCode,
        };
      } catch {
        return { success: false, error: 'Failed to start call' };
      }
    },
    [conversationId, identity, client, t]
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
        const errorCode = resp.error?.code;
        if (errorCode === 'JITSI_UNAVAILABLE') {
          return {
            success: false,
            error: t('call.jitsiUnavailable'),
            errorCode,
          };
        }
        return {
          success: false,
          error: resp.error?.message ?? 'Failed to join call',
          errorCode,
        };
      } catch {
        return { success: false, error: 'Failed to join call' };
      }
    },
    [conversationId, identity, client, t]
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
        case 'call_initiated':
        case 'call_participant_joined':
        case 'call_participant_left':
        case 'call_ended':
        case 'call_media_state_changed': {
          setState((prev) => {
            const next = applyCallSocketMessage(prev, message, convId);
            return next ?? prev;
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
    return isIdentityInCall(state.activeCall, identity?.id);
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
