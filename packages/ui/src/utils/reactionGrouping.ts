import type { DecryptedReaction, ReactionCustomEmoji } from '../services/reactionCryptoService';

/** Local-only reaction row id while the create request is in flight (not a server id). */
export const OPTIMISTIC_REACTION_ID_PREFIX = '__optimistic__:';

export function isOptimisticReactionId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_REACTION_ID_PREFIX);
}

function stripStaleOptimisticForFetched(
  prevList: DecryptedReaction[],
  fetchedList: DecryptedReaction[]
): DecryptedReaction[] {
  const keys = new Set(
    fetchedList.map((r) => `${r.fromIdentityId}:${r.emoji}`)
  );
  return prevList.filter((r) => {
    if (!isOptimisticReactionId(r.id)) return true;
    const key = `${r.fromIdentityId}:${r.emoji}`;
    return !keys.has(key);
  });
}

export interface GroupedReaction {
  emoji: string;
  customEmoji?: ReactionCustomEmoji;
  count: number;
  reactionIds: string[];
  fromIdentityIds: string[];
  isOwn: boolean;
  ownReactionId?: string;
}

export function mergeReactionsByMessageId(
  prev: Record<string, DecryptedReaction[]>,
  fetched: Record<string, DecryptedReaction[]>
): Record<string, DecryptedReaction[]> {
  const merged = { ...prev };
  for (const [messageId, fetchedList] of Object.entries(fetched)) {
    const prevListRaw = prev[messageId] ?? [];
    const prevList = stripStaleOptimisticForFetched(prevListRaw, fetchedList);
    const byId = new Map<string, DecryptedReaction>();
    for (const reaction of prevList) {
      byId.set(reaction.id, reaction);
    }
    for (const reaction of fetchedList) {
      const existing = byId.get(reaction.id);
      if (existing && existing.verified && !reaction.verified) continue;
      byId.set(reaction.id, reaction);
    }
    merged[messageId] = Array.from(byId.values());
  }
  return merged;
}

export function groupReactions(
  reactions: DecryptedReaction[],
  selfId?: string
): GroupedReaction[] {
  const verified = reactions.filter((r) => r.verified !== false);
  if (verified.length === 0) return [];

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
  for (const reaction of verified) {
    const groupKey = reaction.customEmoji
      ? `custom:${reaction.customEmoji.id}`
      : reaction.emoji;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.count++;
      existing.reactionIds.push(reaction.id);
      existing.fromIdentityIds.push(reaction.fromIdentityId);
    } else {
      groups.set(groupKey, {
        emoji: reaction.emoji,
        customEmoji: reaction.customEmoji,
        count: 1,
        reactionIds: [reaction.id],
        fromIdentityIds: [reaction.fromIdentityId],
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
      ? verified.find((r) => {
          const rKey = r.customEmoji ? `custom:${r.customEmoji.id}` : r.emoji;
          return rKey === groupKey && r.fromIdentityId === selfId;
        })?.id
      : undefined,
  }));
}
