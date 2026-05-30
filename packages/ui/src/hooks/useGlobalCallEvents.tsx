/**
 * Global incoming call event listener.
 *
 * Subscribes to `call_initiated` and `call_ended` WS events across ALL
 * conversations (not filtered by the currently active one). Powers the
 * sidebar widget and ringtone regardless of which conversation the user
 * is viewing.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ChatIncomingMessage } from '@adieuu/shared';
import { useChatSocket } from './useChatSocket';
import { useIdentity } from './useIdentity';
import { useConversations } from './useConversations';
import { useCallSession } from './useCallSession';

export interface IncomingCall {
  conversationId: string;
  callId: string;
  initiatorIdentityId: string;
  conversationName: string | undefined;
  receivedAt: number;
}

export interface GlobalCallEventsContextValue {
  incomingCalls: IncomingCall[];
  /** Set of conversation IDs that currently have an ongoing call. */
  activeCallConversationIds: Set<string>;
  dismissIncoming: (callId: string) => void;
}

const GlobalCallEventsContext = createContext<GlobalCallEventsContextValue | null>(null);

export function useGlobalCallEvents(): GlobalCallEventsContextValue {
  const ctx = useContext(GlobalCallEventsContext);
  if (!ctx) {
    throw new Error('useGlobalCallEvents must be used within a GlobalCallEventsProvider');
  }
  return ctx;
}

export function GlobalCallEventsProvider({ children }: { children: ReactNode }) {
  const { subscribe } = useChatSocket();
  const { identity } = useIdentity();
  const { conversations } = useConversations();
  const { activeSession } = useCallSession();

  const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>([]);
  const [activeCallMap, setActiveCallMap] = useState<Map<string, string>>(new Map());
  const dismissedRef = useRef(new Set<string>());
  const identityIdRef = useRef(identity?.id);
  identityIdRef.current = identity?.id;

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const dismissIncoming = useCallback((callId: string) => {
    dismissedRef.current.add(callId);
    setIncomingCalls((prev) => prev.filter((c) => c.callId !== callId));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe((message: ChatIncomingMessage) => {
      const myId = identityIdRef.current;
      if (!myId) return;

      switch (message.type) {
        case 'call_initiated': {
          const { call } = message.data;

          setActiveCallMap((prev) => {
            const next = new Map(prev);
            next.set(call.conversationId, call.id);
            return next;
          });

          if (dismissedRef.current.has(call.id)) return;

          const alreadyIn = call.participants?.some(
            (p: { identityId: string; leftAt?: string }) =>
              p.identityId === myId && !p.leftAt
          );
          if (alreadyIn) return;

          if (call.initiatorIdentityId === myId) return;

          const conv = conversationsRef.current.find((c) => c.id === call.conversationId);

          setIncomingCalls((prev) => {
            if (prev.some((ic) => ic.callId === call.id)) return prev;
            return [
              ...prev,
              {
                conversationId: call.conversationId,
                callId: call.id,
                initiatorIdentityId: call.initiatorIdentityId,
                conversationName: conv?.decryptedName ?? undefined,
                receivedAt: Date.now(),
              },
            ];
          });
          break;
        }

        case 'call_ended': {
          const { callId } = message.data;
          dismissedRef.current.delete(callId);
          setIncomingCalls((prev) => prev.filter((c) => c.callId !== callId));
          setActiveCallMap((prev) => {
            const next = new Map(prev);
            for (const [convId, cId] of next) {
              if (cId === callId) {
                next.delete(convId);
                break;
              }
            }
            return next;
          });
          break;
        }
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // Clear incoming calls for the active session (user joined) and track it as active
  useEffect(() => {
    if (activeSession) {
      setIncomingCalls((prev) =>
        prev.filter((c) => c.callId !== activeSession.call.id)
      );
      setActiveCallMap((prev) => {
        if (prev.get(activeSession.conversationId) === activeSession.call.id) return prev;
        const next = new Map(prev);
        next.set(activeSession.conversationId, activeSession.call.id);
        return next;
      });
    }
  }, [activeSession]);

  const activeCallConversationIds = useMemo(
    () => new Set(activeCallMap.keys()),
    [activeCallMap]
  );

  const value = useMemo<GlobalCallEventsContextValue>(
    () => ({ incomingCalls, activeCallConversationIds, dismissIncoming }),
    [incomingCalls, activeCallConversationIds, dismissIncoming]
  );

  return (
    <GlobalCallEventsContext.Provider value={value}>
      {children}
    </GlobalCallEventsContext.Provider>
  );
}
