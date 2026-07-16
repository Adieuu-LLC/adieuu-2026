/**
 * Space channel reply parent fetch adapter.
 *
 * Uses `getMessagesAround` to fetch a single parent message for
 * reply-quote hydration.
 */

import type { SpacesApi } from '@adieuu/shared';
import type { ReplyParentFetchAdapter } from '../useReplyParentHydration';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import { spaceMessageToChannel } from '../../components/messaging/channelMessage';

export function createSpaceReplyAdapter(
  api: { spaces: SpacesApi },
  spaceId: string,
  decryptBody?: (content: string | undefined) => string,
): ReplyParentFetchAdapter {
  const decrypt = decryptBody ?? ((c: string | undefined) => c ?? '');

  return {
    async fetchMessage(
      channelId: string,
      messageId: string,
    ): Promise<ChannelMessage | null> {
      try {
        const resp = await api.spaces.getMessagesAround(
          spaceId,
          channelId,
          messageId,
          { before: 0, after: 0 },
        );
        if (resp.success && resp.data && resp.data.messages.length > 0) {
          const msg = resp.data.messages.find((m) => m.id === messageId);
          if (msg) {
            const body = decrypt(msg.content);
            return spaceMessageToChannel(msg, body);
          }
        }
      } catch {
        // Silently fail — quote just won't show
      }
      return null;
    },
  };
}
