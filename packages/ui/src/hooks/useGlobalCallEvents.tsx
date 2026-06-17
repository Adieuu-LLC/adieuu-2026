/**
 * Global incoming call event listener.
 *
 * Subscribes to call WebSocket events across ALL conversations (not filtered
 * by the currently active one). Powers the sidebar call indicator and incoming
 * call UI regardless of which conversation the user is viewing.
 *
 * On connect/reconnect, active calls are fetched from the API so users who
 * were offline when a call started still see the sidebar phone icon.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type ChatIncomingMessage } from '@adieuu/shared';
import { useAppConfig } from '../config/PlatformContext';
import { fetchActiveCallIdsByConversation } from '../services/callService';
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

function mergeActiveCallMaps(
  prev: Map<string, string>,
  synced: Map<string, string>,
  conversationIds: string[],
): Map<string, string> {
  const next = new Map(prev);
  for (const conversationId of conversationIds) {
    const callId = synced.get(conversationId);
    if (callId) {
      next.set(conversationId, callId);
    } else {
      next.delete(conversationId);
    }
  }
  return next;
}

export function GlobalCallEventsProvider({ children }: { children: ReactNode }) {
  const { subscribe, onStateChange } = useChatSocket();
  const { identity } = useIdentity();
  const { conversations } = useConversations();
  const { activeSession } = useCallSession();
  const { apiBaseUrl } = useAppConfig();

  const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>([]);
  const [activeCallMap, setActiveCallMap] = useState<Map<string, string>>(new Map());
  const dismissedRef = useRef(new Set<string>());
  const identityIdRef = useRef(identity?.id);
  identityIdRef.current = identity?.id;

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const client = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }).client,
    [apiBaseUrl],
  );

  const syncActiveCalls = useCallback(async () => {
    const myId = identityIdRef.current;
    if (!myId) return;

    const conversationIds = conversationsRef.current.map((c) => c.id);
    if (conversationIds.length === 0) return;

    const synced = await fetchActiveCallIdsByConversation(client, conversationIds);
    setActiveCallMap((prev) => mergeActiveCallMaps(prev, synced, conversationIds));
  }, [client]);

  const syncActiveCallsRef = useRef(syncActiveCalls);
  syncActiveCallsRef.current = syncActiveCalls;

  const scheduleSyncActiveCalls = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncTimeoutRef.current = null;
      void syncActiveCallsRef.current();
    }, 300);
  }, []);

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

        case 'call_participant_joined': {
          const { callId } = message.data;
          setActiveCallMap((prev) => {
            for (const [, trackedCallId] of prev) {
              if (trackedCallId === callId) return prev;
            }
            scheduleSyncActiveCalls();
            return prev;
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
  }, [subscribe, scheduleSyncActiveCalls]);

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

  const conversationIdsKey = useMemo(
    () => conversations.map((c) => c.id).sort().join(','),
    [conversations],
  );

  useEffect(() => {
    if (!identity?.id || conversationIdsKey.length === 0) return;
    void syncActiveCallsRef.current();
  }, [identity?.id, conversationIdsKey]);

  useEffect(() => {
    const unsub = onStateChange((socketState) => {
      if (socketState === 'connected') {
        void syncActiveCallsRef.current();
      }
    });
    return unsub;
  }, [onStateChange]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

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
