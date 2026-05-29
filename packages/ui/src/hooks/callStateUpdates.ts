/**
 * Pure call-state transitions driven by WebSocket events.
 * Extracted from useCall for unit testing.
 */

import type { ChatIncomingMessage } from '@adieuu/shared';
import type { PublicCall } from '../services/callService';

export interface CallHookState {
  activeCall: PublicCall | null;
  loading: boolean;
}

export function applyCallSocketMessage(
  prev: CallHookState,
  message: ChatIncomingMessage,
  conversationId: string
): CallHookState | null {
  switch (message.type) {
    case 'call_initiated': {
      const { call } = message.data;
      if (call.conversationId !== conversationId) return null;
      const participants =
        call.participants ?? (prev.activeCall?.id === call.id ? prev.activeCall.participants : []);

      return {
        activeCall: {
          id: call.id,
          conversationId: call.conversationId,
          initiatorIdentityId: call.initiatorIdentityId,
          status: call.status as PublicCall['status'],
          allowedMedia: call.allowedMedia,
          participants,
          jitsiRoomName: call.jitsiRoomName,
          createdAt: call.createdAt,
          updatedAt: call.createdAt,
        },
        loading: false,
      };
    }

    case 'call_participant_joined': {
      const { callId, identityId, mediaState } = message.data;
      if (!prev.activeCall || prev.activeCall.id !== callId) return null;
      const existing = prev.activeCall.participants.some(
        (p) => p.identityId === identityId && !p.leftAt
      );
      if (existing) return null;
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
    }

    case 'call_participant_left': {
      const { callId, identityId } = message.data;
      if (!prev.activeCall || prev.activeCall.id !== callId) return null;
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
    }

    case 'call_ended': {
      const { callId } = message.data;
      if (!prev.activeCall || prev.activeCall.id !== callId) return null;
      return { activeCall: null, loading: false };
    }

    case 'call_media_state_changed': {
      const { callId, identityId, mediaState } = message.data;
      if (!prev.activeCall || prev.activeCall.id !== callId) return null;
      return {
        ...prev,
        activeCall: {
          ...prev.activeCall,
          participants: prev.activeCall.participants.map((p) =>
            p.identityId === identityId && !p.leftAt ? { ...p, mediaState } : p
          ),
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Derive whether the current identity is an active call participant.
 */
export function isIdentityInCall(
  activeCall: PublicCall | null,
  identityId: string | undefined
): boolean {
  if (!activeCall || !identityId) return false;
  return activeCall.participants.some(
    (p) => p.identityId === identityId && !p.leftAt
  );
}

/**
 * Parse rate-limit retryAfter from API error details.
 */
export function parseRetryAfterSeconds(
  details: { retryAfter?: string | number } | undefined
): number | undefined {
  const raw = details?.retryAfter;
  if (raw === undefined) return undefined;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
