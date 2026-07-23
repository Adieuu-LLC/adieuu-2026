/**
 * Space channel reactions adapter.
 *
 * Wraps the Space API reaction methods into the shared
 * {@link ChannelReactionsAdapter} interface so that
 * `useChannelReactions` can be used for both Conversations and Spaces.
 */

import type { SpacesApi } from '@adieuu/shared';
import type {
  ChannelReactionsAdapter,
  ChannelReaction,
  ReactionCustomEmoji,
} from '../useChannelReactions';

export function createSpaceReactionsAdapter(
  api: { spaces: SpacesApi },
  spaceId: string,
): ChannelReactionsAdapter {
  return {
    async addReaction(
      channelId: string,
      messageId: string,
      emoji: string,
      _customEmoji?: ReactionCustomEmoji,
    ): Promise<ChannelReaction | null> {
      const resp = await api.spaces.addReaction(spaceId, channelId, messageId, emoji);
      if (resp.success && resp.data) {
        return {
          id: resp.data.id,
          messageId: resp.data.messageId,
          channelId: resp.data.channelId,
          fromIdentityId: resp.data.identityId,
          emoji: resp.data.emoji,
          createdAt: resp.data.createdAt,
        };
      }
      return null;
    },

    async removeReaction(
      channelId: string,
      messageId: string,
      reactionId: string,
    ): Promise<boolean> {
      const resp = await api.spaces.removeReaction(spaceId, channelId, messageId, reactionId);
      return resp.success;
    },

    async getReactions(
      channelId: string,
      messageId: string,
    ): Promise<ChannelReaction[]> {
      const resp = await api.spaces.getReactions(spaceId, channelId, messageId);
      if (resp.success && resp.data) {
        return resp.data.reactions.map((r) => ({
          id: r.id,
          messageId: r.messageId,
          channelId: r.channelId,
          fromIdentityId: r.identityId,
          emoji: r.emoji,
          createdAt: r.createdAt,
        }));
      }
      return [];
    },
  };
}
