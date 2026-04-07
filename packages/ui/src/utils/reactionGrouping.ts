import type { DecryptedReaction } from '../services/reactionCryptoService';

export interface GroupedReaction {
  emoji: string;
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
    const prevList = prev[messageId] ?? [];
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
    { count: number; reactionIds: string[]; fromIdentityIds: string[] }
  >();
  for (const reaction of verified) {
    const existing = groups.get(reaction.emoji);
    if (existing) {
      existing.count++;
      existing.reactionIds.push(reaction.id);
      existing.fromIdentityIds.push(reaction.fromIdentityId);
    } else {
      groups.set(reaction.emoji, {
        count: 1,
        reactionIds: [reaction.id],
        fromIdentityIds: [reaction.fromIdentityId],
      });
    }
  }

  return Array.from(groups.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    reactionIds: data.reactionIds,
    fromIdentityIds: data.fromIdentityIds,
    isOwn: selfId ? data.fromIdentityIds.includes(selfId) : false,
    ownReactionId: selfId
      ? verified.find((r) => r.emoji === emoji && r.fromIdentityId === selfId)?.id
      : undefined,
  }));
}
