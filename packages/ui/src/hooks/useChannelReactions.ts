/**
 * Shared channel reactions hook.
 *
 * Manages grouped reaction state per message, optimistic updates, and
 * toggle semantics. Domain-specific API calls (E2EE conversations vs
 * plaintext spaces) are delegated to a {@link ChannelReactionsAdapter}.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { ReactionCustomEmoji } from '../services/reactionCryptoService';

export type { ReactionCustomEmoji } from '../services/reactionCryptoService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroupedReaction {
  emoji: string;
  customEmoji?: ReactionCustomEmoji;
  count: number;
  reactionIds: string[];
  fromIdentityIds: string[];
  isOwn: boolean;
  ownReactionId?: string;
}

export interface ChannelReaction {
  id: string;
  messageId: string;
  channelId: string;
  fromIdentityId: string;
  emoji: string;
  customEmoji?: ReactionCustomEmoji;
  createdAt: string;
}

export interface ChannelReactionsAdapter {
  addReaction(
    channelId: string,
    messageId: string,
    emoji: string,
    customEmoji?: ReactionCustomEmoji,
  ): Promise<ChannelReaction | null>;
  removeReaction(
    channelId: string,
    messageId: string,
    reactionId: string,
  ): Promise<boolean>;
  getReactions(
    channelId: string,
    messageId: string,
  ): Promise<ChannelReaction[]>;
}

interface ReactionsState {
  byMessage: Record<string, ChannelReaction[]>;
  loading: boolean;
}

const OPTIMISTIC_PREFIX = '__optimistic__:';

function isOptimistic(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

// ---------------------------------------------------------------------------
// Grouping utility (mirrors reactionGrouping.ts but uses ChannelReaction)
// ---------------------------------------------------------------------------

function groupReactionsForMessage(
  reactions: ChannelReaction[],
  selfId?: string,
): GroupedReaction[] {
  if (reactions.length === 0) return [];
  const groups = new Map<
    string,
    {
      emoji: string;
      customEmoji?: ReactionCustomEmoji;
      count: number;
      reactionIds: string[];
      fromIdentityIds: string[];
    }
  >();
  for (const r of reactions) {
    const key = r.customEmoji ? `custom:${r.customEmoji.id}` : r.emoji;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.reactionIds.push(r.id);
      existing.fromIdentityIds.push(r.fromIdentityId);
    } else {
      groups.set(key, {
        emoji: r.emoji,
        customEmoji: r.customEmoji,
        count: 1,
        reactionIds: [r.id],
        fromIdentityIds: [r.fromIdentityId],
      });
    }
  }
  return Array.from(groups.entries()).map(([groupKey, data]) => ({
    emoji: data.emoji,
    ...(data.customEmoji ? { customEmoji: data.customEmoji } : {}),
    count: data.count,
    reactionIds: data.reactionIds,
    fromIdentityIds: data.fromIdentityIds,
    isOwn: selfId ? data.fromIdentityIds.includes(selfId) : false,
    ownReactionId: selfId
      ? reactions.find((r) => {
          const rKey = r.customEmoji ? `custom:${r.customEmoji.id}` : r.emoji;
          return rKey === groupKey && r.fromIdentityId === selfId;
        })?.id
      : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChannelReactions(
  channelId: string | null | undefined,
  adapter: ChannelReactionsAdapter,
  selfIdentityId: string | undefined,
) {
  const [state, setState] = useState<ReactionsState>({
    byMessage: {},
    loading: false,
  });

  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const selfIdRef = useRef(selfIdentityId);
  selfIdRef.current = selfIdentityId;
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setState({ byMessage: {}, loading: false });
  }, [channelId]);

  const fetchReactions = useCallback(
    async (messageIds: string[]) => {
      const cId = channelIdRef.current;
      if (!cId || messageIds.length === 0) return;
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const allReactions: ChannelReaction[] = [];
        await Promise.all(
          messageIds.map(async (msgId) => {
            const reactions = await adapterRef.current.getReactions(cId, msgId);
            allReactions.push(...reactions);
          }),
        );
        if (!mountedRef.current) return;
        const byMessage: Record<string, ChannelReaction[]> = {};
        for (const r of allReactions) {
          (byMessage[r.messageId] ??= []).push(r);
        }
        setState((prev) => {
          const merged = { ...prev.byMessage };
          for (const [msgId, fetched] of Object.entries(byMessage)) {
            const prevList = merged[msgId] ?? [];
            const optimistics = prevList.filter(
              (r) =>
                isOptimistic(r.id) &&
                !fetched.some(
                  (f) =>
                    f.fromIdentityId === r.fromIdentityId &&
                    f.emoji === r.emoji,
                ),
            );
            merged[msgId] = [...fetched, ...optimistics];
          }
          return { byMessage: merged, loading: false };
        });
      } catch {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    },
    [],
  );

  const onReact = useCallback(
    async (messageId: string, emoji: string, customEmoji?: ReactionCustomEmoji) => {
      const cId = channelIdRef.current;
      const selfId = selfIdRef.current;
      if (!cId || !selfId) return;

      const optimisticId = `${OPTIMISTIC_PREFIX}${crypto.randomUUID()}`;
      const optimistic: ChannelReaction = {
        id: optimisticId,
        messageId,
        channelId: cId,
        fromIdentityId: selfId,
        emoji,
        ...(customEmoji ? { customEmoji } : {}),
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        byMessage: {
          ...prev.byMessage,
          [messageId]: [...(prev.byMessage[messageId] ?? []), optimistic],
        },
      }));

      try {
        const result = await adapterRef.current.addReaction(cId, messageId, emoji, customEmoji);
        if (!mountedRef.current) return;
        setState((prev) => {
          const existing = prev.byMessage[messageId] ?? [];
          const withoutOptimistic = existing.filter((r) => r.id !== optimisticId);
          if (result) {
            if (withoutOptimistic.some((r) => r.id === result.id)) {
              return {
                ...prev,
                byMessage: { ...prev.byMessage, [messageId]: withoutOptimistic },
              };
            }
            return {
              ...prev,
              byMessage: {
                ...prev.byMessage,
                [messageId]: [...withoutOptimistic, result],
              },
            };
          }
          return {
            ...prev,
            byMessage: { ...prev.byMessage, [messageId]: withoutOptimistic },
          };
        });
      } catch {
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          byMessage: {
            ...prev.byMessage,
            [messageId]: (prev.byMessage[messageId] ?? []).filter(
              (r) => r.id !== optimisticId,
            ),
          },
        }));
      }
    },
    [],
  );

  const onRemoveReaction = useCallback(
    async (messageId: string, reactionId: string) => {
      const cId = channelIdRef.current;
      if (!cId) return;

      if (isOptimistic(reactionId)) {
        setState((prev) => ({
          ...prev,
          byMessage: {
            ...prev.byMessage,
            [messageId]: (prev.byMessage[messageId] ?? []).filter(
              (r) => r.id !== reactionId,
            ),
          },
        }));
        return;
      }

      const previous =
        state.byMessage[messageId]?.find((r) => r.id === reactionId) ?? null;

      setState((prev) => ({
        ...prev,
        byMessage: {
          ...prev.byMessage,
          [messageId]: (prev.byMessage[messageId] ?? []).filter(
            (r) => r.id !== reactionId,
          ),
        },
      }));

      try {
        const ok = await adapterRef.current.removeReaction(cId, messageId, reactionId);
        if (!ok && previous) {
          setState((prev) => ({
            ...prev,
            byMessage: {
              ...prev.byMessage,
              [messageId]: [...(prev.byMessage[messageId] ?? []), previous],
            },
          }));
        }
      } catch {
        if (previous) {
          setState((prev) => {
            const existing = prev.byMessage[messageId] ?? [];
            if (existing.some((r) => r.id === reactionId)) return prev;
            return {
              ...prev,
              byMessage: {
                ...prev.byMessage,
                [messageId]: [...existing, previous],
              },
            };
          });
        }
      }
    },
    [state.byMessage],
  );

  const onToggleReaction = useCallback(
    (
      messageId: string,
      emoji: string,
      ownReactionId?: string,
      customEmoji?: ReactionCustomEmoji,
    ) => {
      if (ownReactionId) {
        void onRemoveReaction(messageId, ownReactionId);
      } else {
        void onReact(messageId, emoji, customEmoji);
      }
    },
    [onReact, onRemoveReaction],
  );

  const getGroupedReactions = useCallback(
    (messageId: string): GroupedReaction[] => {
      return groupReactionsForMessage(
        state.byMessage[messageId] ?? [],
        selfIdRef.current,
      );
    },
    [state.byMessage],
  );

  const ingestSocketReaction = useCallback(
    (reaction: ChannelReaction) => {
      setState((prev) => {
        const existing = prev.byMessage[reaction.messageId] ?? [];
        if (existing.some((r) => r.id === reaction.id)) return prev;
        return {
          ...prev,
          byMessage: {
            ...prev.byMessage,
            [reaction.messageId]: [...existing, reaction],
          },
        };
      });
    },
    [],
  );

  const ingestSocketReactionRemoval = useCallback(
    (messageId: string, reactionId: string) => {
      setState((prev) => {
        const existing = prev.byMessage[messageId];
        if (!existing) return prev;
        const filtered = existing.filter((r) => r.id !== reactionId);
        if (filtered.length === existing.length) return prev;
        return {
          ...prev,
          byMessage: { ...prev.byMessage, [messageId]: filtered },
        };
      });
    },
    [],
  );

  return useMemo(
    () => ({
      reactions: state.byMessage,
      loading: state.loading,
      fetchReactions,
      onReact,
      onToggleReaction,
      getGroupedReactions,
      ingestSocketReaction,
      ingestSocketReactionRemoval,
    }),
    [
      state.byMessage,
      state.loading,
      fetchReactions,
      onReact,
      onToggleReaction,
      getGroupedReactions,
      ingestSocketReaction,
      ingestSocketReactionRemoval,
    ],
  );
}
