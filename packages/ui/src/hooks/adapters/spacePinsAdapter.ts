/**
 * Space channel pins adapter.
 *
 * Wraps the Space API pin/unpin/get-pinned methods into the shared
 * {@link ChannelPinsAdapter} interface.
 */

import type { SpacesApi, PublicSpaceMessage } from '@adieuu/shared';
import type { ChannelPinsAdapter } from '../useChannelPins';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import { spaceMessageToChannel } from '../../components/messaging/channelMessage';
import type { DecryptableMessage } from '../../pages/spaces/spaceChannelCipher';

export function createSpacePinsAdapter(
  api: { spaces: SpacesApi },
  spaceId: string,
  decryptBody?: (msg: DecryptableMessage | undefined) => string,
): ChannelPinsAdapter {
  const decrypt = decryptBody ?? ((m: DecryptableMessage | undefined) => m?.content ?? '');

  return {
    async pinMessage(channelId: string, messageId: string): Promise<boolean> {
      const resp = await api.spaces.pinMessage(spaceId, channelId, messageId);
      return resp.success;
    },

    async unpinMessage(channelId: string, messageId: string): Promise<boolean> {
      const resp = await api.spaces.unpinMessage(spaceId, channelId, messageId);
      return resp.success;
    },

    async getPinnedMessages(
      channelId: string,
      cursor?: string | null,
    ): Promise<{ messages: ChannelMessage[]; nextCursor: string | null } | null> {
      const resp = await api.spaces.getPinnedMessages(spaceId, channelId, {
        ...(cursor ? { cursor } : {}),
      });
      if (resp.success && resp.data) {
        const messages: ChannelMessage[] = resp.data.messages.map(
          (msg: PublicSpaceMessage) => {
            const body = decrypt(msg);
            return spaceMessageToChannel(msg, body);
          },
        );
        return { messages, nextCursor: resp.data.cursor };
      }
      return null;
    },
  };
}
