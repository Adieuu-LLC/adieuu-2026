import type { ChatIncomingMessage, PublicSpace, PublicSpaceMessage } from '@adieuu/shared';
import { emitSpacesChanged } from './spacesMembershipEvents';

export interface SpaceSocketHandlerContext {
  setSpaces: (updater: (prev: PublicSpace[]) => PublicSpace[]) => void;
  setMessagesByChannel: (
    updater: (
      prev: Record<string, { messages: PublicSpaceMessage[]; olderCursor: string | null; loading: boolean }>,
    ) => Record<string, { messages: PublicSpaceMessage[]; olderCursor: string | null; loading: boolean }>,
  ) => void;
  activeSpaceId: string | null;
  activeChannelId: string | null;
  identityId: string | undefined;
  fetchChannelMessages: (spaceId: string, channelId: string) => void;
  refreshSpaces: () => void;
}

/**
 * Testable, React-free handler for Space WebSocket events.
 *
 * Mirrors {@link handleConversationSocketMessage} from
 * `conversationSocketHandlers.ts`. Invite events are acknowledged but
 * deferred to Phase 7 (fe-invites).
 */
export function handleSpaceSocketMessage(
  message: ChatIncomingMessage,
  ctx: SpaceSocketHandlerContext,
): void {
  switch (message.type) {
    case 'space_created': {
      const { space } = message.data;
      ctx.setSpaces((prev) => {
        if (prev.some((s) => s.id === space.id)) return prev;
        return [space, ...prev];
      });
      emitSpacesChanged();
      break;
    }

    case 'space_updated': {
      const { space } = message.data;
      ctx.setSpaces((prev) =>
        prev.map((s) => (s.id === space.id ? space : s)),
      );
      break;
    }

    case 'space_message': {
      const { message: msg } = message.data;
      if (msg.channelId === ctx.activeChannelId && msg.spaceId === ctx.activeSpaceId) {
        ctx.fetchChannelMessages(msg.spaceId, msg.channelId);
      }
      break;
    }

    case 'space_member_joined': {
      const { spaceId, member: _member } = message.data;
      ctx.setSpaces((prev) =>
        prev.map((s) =>
          s.id === spaceId ? { ...s, memberCount: s.memberCount + 1 } : s,
        ),
      );
      break;
    }

    case 'space_member_left': {
      const { spaceId, identityId } = message.data;
      if (identityId === ctx.identityId) {
        ctx.setSpaces((prev) => prev.filter((s) => s.id !== spaceId));
        emitSpacesChanged();
      } else {
        ctx.setSpaces((prev) =>
          prev.map((s) =>
            s.id === spaceId
              ? { ...s, memberCount: Math.max(0, s.memberCount - 1) }
              : s,
          ),
        );
      }
      break;
    }

    // Invite events — acknowledged here, full UI lands in Phase 7.
    case 'space_invite_received':
    case 'space_invite_accepted':
    case 'space_invite_revoked':
      break;
  }
}
