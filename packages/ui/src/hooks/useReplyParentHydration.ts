/**
 * Shared reply parent hydration hook.
 *
 * For messages with a `replyToMessageId`, resolves the parent message
 * body/author info to display a reply quote. Looks up the parent in the
 * local message array first (cache hit); if not found, fetches via the
 * provided adapter. Deduplicates concurrent requests for the same parent.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import type { ChannelMessage } from '../components/messaging/channelMessage';
import type { ReplyQuotePayload } from '../pages/conversations/conversationUtils';

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface ReplyParentFetchAdapter {
  fetchMessage(
    channelId: string,
    messageId: string,
  ): Promise<ChannelMessage | null>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplyParentInfo {
  body: string;
  fromIdentityId: string;
  deleted: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReplyParentHydration(
  channelId: string | null | undefined,
  messages: ChannelMessage[],
  adapter: ReplyParentFetchAdapter,
) {
  const [hydratedParents, setHydratedParents] = useState<
    Record<string, ReplyParentInfo>
  >({});

  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;
  const inflight = useRef(new Set<string>());

  const messagesMap = useMemo(() => {
    const map = new Map<string, ChannelMessage>();
    for (const m of messages) {
      map.set(m.id, m);
    }
    return map;
  }, [messages]);

  const getParentInfo = useCallback(
    (parentMessageId: string): ReplyParentInfo | null => {
      const local = messagesMap.get(parentMessageId);
      if (local) {
        return {
          body: local.body,
          fromIdentityId: local.fromIdentityId,
          deleted: local.deleted,
        };
      }
      return hydratedParents[parentMessageId] ?? null;
    },
    [messagesMap, hydratedParents],
  );

  const ensureHydrated = useCallback(
    async (parentMessageId: string) => {
      const cId = channelIdRef.current;
      if (!cId) return;
      if (messagesMap.has(parentMessageId)) return;
      if (hydratedParents[parentMessageId]) return;
      if (inflight.current.has(parentMessageId)) return;

      inflight.current.add(parentMessageId);
      try {
        const msg = await adapterRef.current.fetchMessage(cId, parentMessageId);
        if (msg) {
          setHydratedParents((prev) => ({
            ...prev,
            [parentMessageId]: {
              body: msg.body,
              fromIdentityId: msg.fromIdentityId,
              deleted: msg.deleted,
            },
          }));
        }
      } catch {
        // Swallow — the parent simply remains unhydrated.
      } finally {
        inflight.current.delete(parentMessageId);
      }
    },
    [messagesMap, hydratedParents],
  );

  const hydrateAll = useCallback(
    (msgs: ChannelMessage[]) => {
      for (const msg of msgs) {
        if (msg.replyToMessageId) {
          void ensureHydrated(msg.replyToMessageId);
        }
      }
    },
    [ensureHydrated],
  );

  return useMemo(
    () => ({
      getParentInfo,
      ensureHydrated,
      hydrateAll,
      hydratedParents,
    }),
    [getParentInfo, ensureHydrated, hydrateAll, hydratedParents],
  );
}

// ---------------------------------------------------------------------------
// Helper: build a ReplyQuotePayload from parent info
// ---------------------------------------------------------------------------

export function buildChannelReplyQuote(
  parentInfo: ReplyParentInfo | null,
  resolveAuthorName: (identityId: string) => string,
  resolveAuthorAvatar: (identityId: string) => string | undefined,
  onQuoteClick: () => void,
  deletedLabel: string,
  fallbackLabel: string,
): ReplyQuotePayload | null {
  if (!parentInfo) {
    // Not yet hydrated: render a fixed-height skeleton (author row reserved) so
    // the quote does not grow and push the timeline once the parent resolves.
    return {
      text: fallbackLabel,
      onQuoteClick,
      pending: true,
    };
  }
  if (parentInfo.deleted) {
    return {
      text: deletedLabel,
      onQuoteClick,
    };
  }
  const text = parentInfo.body
    ? parentInfo.body.split(/\s+/).slice(0, 6).join(' ') +
      (parentInfo.body.split(/\s+/).length > 6 ? '…' : '')
    : fallbackLabel;
  return {
    text,
    quotedAuthor: {
      displayName: resolveAuthorName(parentInfo.fromIdentityId),
      avatarUrl: resolveAuthorAvatar(parentInfo.fromIdentityId),
    },
    onQuoteClick,
  };
}
