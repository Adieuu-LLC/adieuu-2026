import type {
  ChatIncomingMessage,
  PublicIdentity,
  PublicSpace,
  PublicSpaceChannel,
  PublicSpaceChannelCategory,
  PublicSpaceMessage,
  PublicSpaceReaction,
} from '@adieuu/shared';
import { emitSpaceMemberUpdated, emitSpacesChanged } from './spacesMembershipEvents';

export interface SpaceChannelUnreadState {
  unread: number;
  mention: boolean;
  /** Owning Space id — used to clear unread for a whole Space. */
  spaceId: string;
}

export interface SpaceSocketHandlerContext {
  setSpaces: (updater: (prev: PublicSpace[]) => PublicSpace[]) => void;
  setChannels?: (updater: (prev: PublicSpaceChannel[]) => PublicSpaceChannel[]) => void;
  setCategories?: (
    updater: (prev: PublicSpaceChannelCategory[]) => PublicSpaceChannelCategory[],
  ) => void;
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
  onSocketReactionAdded?: (reaction: {
    id: string;
    messageId: string;
    channelId: string;
    fromIdentityId: string;
    emoji: string;
    createdAt: string;
  }) => void;
  onSocketReactionRemoved?: (messageId: string, reactionId: string) => void;
  onSocketPinsUpdated?: (messageId: string, action: 'pinned' | 'unpinned') => void;
  setUnreadByChannel?: (
    updater: (prev: Record<string, SpaceChannelUnreadState>) => Record<string, SpaceChannelUnreadState>,
  ) => void;
  setUnreadBySpace?: (
    updater: (prev: Record<string, number>) => Record<string, number>,
  ) => void;
  fireNotification?: (
    title: string,
    body: string,
    options?: {
      isMention?: boolean;
      channelId?: string;
      spaceId?: string;
      spaceSlug?: string;
      onClick?: () => void;
    },
  ) => void;
  /** Resolved channel names keyed by channel ID, used for notification copy. */
  channelNames?: Record<string, string>;
  /** Resolved participant profiles, used for notification author names. */
  participantProfiles?: Record<string, PublicIdentity>;
  /** Messages in the active channel, used for reaction author lookup. */
  activeChannelMessages?: PublicSpaceMessage[];
  /** Called when a Space is permanently deleted (after local list cleanup). */
  onSpaceDeleted?: (spaceId: string) => void;
  /** Optional i18n helper for membership notifications. */
  t?: (key: string, options?: Record<string, unknown>) => string;
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

    case 'space_deleted': {
      const { spaceId } = message.data;
      ctx.setSpaces((prev) => prev.filter((s) => s.id !== spaceId));
      ctx.setUnreadBySpace?.((prev) => {
        if (!prev[spaceId]) return prev;
        const { [spaceId]: _, ...rest } = prev;
        return rest;
      });
      emitSpacesChanged();
      ctx.onSpaceDeleted?.(spaceId);
      break;
    }

    case 'space_channel_created':
    case 'space_channel_updated': {
      const { channel } = message.data;
      if (channel.spaceId !== ctx.activeSpaceId) break;
      ctx.setChannels?.((prev) => {
        if (prev.some((c) => c.id === channel.id)) {
          return prev.map((c) => (c.id === channel.id ? channel : c));
        }
        if (message.type === 'space_channel_updated') return prev;
        return [...prev, channel].sort(
          (a, b) => a.position - b.position || a.id.localeCompare(b.id),
        );
      });
      break;
    }

    case 'space_category_created':
    case 'space_category_updated': {
      const { category } = message.data;
      if (category.spaceId !== ctx.activeSpaceId) break;
      ctx.setCategories?.((prev) => {
        if (prev.some((c) => c.id === category.id)) {
          return prev.map((c) => (c.id === category.id ? category : c));
        }
        if (message.type === 'space_category_updated') return prev;
        return [...prev, category].sort(
          (a, b) => a.position - b.position || a.id.localeCompare(b.id),
        );
      });
      break;
    }

    case 'space_category_deleted': {
      const { spaceId, categoryId } = message.data;
      if (spaceId !== ctx.activeSpaceId) break;
      ctx.setCategories?.((prev) => prev.filter((c) => c.id !== categoryId));
      ctx.setChannels?.((prev) =>
        prev.map((ch) =>
          ch.categoryId === categoryId ? { ...ch, categoryId: null } : ch,
        ),
      );
      break;
    }

    case 'space_channel_layout_updated': {
      const { spaceId, categories, channels } = message.data;
      if (spaceId !== ctx.activeSpaceId) break;
      ctx.setCategories?.(() => categories);
      ctx.setChannels?.(() => channels);
      try {
        const key = `adieuu:lastChannel:${spaceId}`;
        const last = localStorage.getItem(key);
        if (last && !channels.some((ch) => ch.id === last)) {
          localStorage.removeItem(key);
        }
      } catch {
        /* quota / SSR */
      }
      break;
    }

    case 'space_message': {
      const { message: msg } = message.data;
      const isActiveChannel =
        msg.channelId === ctx.activeChannelId &&
        msg.spaceId === ctx.activeSpaceId;

      if (isActiveChannel) {
        ctx.setMessagesByChannel((prev) => {
          const state = prev[msg.channelId];
          if (!state) return prev;
          const existing = state.messages.find((m) => m.id === msg.id);
          if (existing) {
            return {
              ...prev,
              [msg.channelId]: {
                ...state,
                messages: state.messages.map((m) =>
                  m.id === msg.id ? msg : m,
                ),
              },
            };
          }
          return {
            ...prev,
            [msg.channelId]: {
              ...state,
              messages: [msg, ...state.messages],
            },
          };
        });
      }

      const isFromSelf = msg.fromIdentityId === ctx.identityId;

      if (!isActiveChannel && !isFromSelf) {
        const isMention =
          !!ctx.identityId &&
          !!msg.mentionedIdentityIds?.includes(ctx.identityId);
        ctx.setUnreadByChannel?.((prev) => {
          const cur = prev[msg.channelId] ?? {
            unread: 0,
            mention: false,
            spaceId: msg.spaceId,
          };
          return {
            ...prev,
            [msg.channelId]: {
              unread: cur.unread + 1,
              mention: cur.mention || isMention,
              spaceId: cur.spaceId || msg.spaceId,
            },
          };
        });
        ctx.setUnreadBySpace?.((prev) => ({
          ...prev,
          [msg.spaceId]: (prev[msg.spaceId] ?? 0) + 1,
        }));
      }

      if (!isFromSelf && ctx.fireNotification) {
        const channelName = ctx.channelNames?.[msg.channelId] ?? msg.channelId;
        const senderProfile = ctx.participantProfiles?.[msg.fromIdentityId];
        const senderName = senderProfile?.displayName ?? senderProfile?.username;
        const isReplyToMe =
          !!msg.replyToMessageId &&
          typeof msg.replyToMessageAuthorId === 'string' &&
          msg.replyToMessageAuthorId === ctx.identityId;
        const isMention =
          !!ctx.identityId &&
          Array.isArray(msg.mentionedIdentityIds) &&
          msg.mentionedIdentityIds.includes(ctx.identityId);

        if (isReplyToMe) {
          const body = senderName
            ? `${senderName} replied to your message in #${channelName}`
            : `Someone replied to your message in #${channelName}`;
          ctx.fireNotification('Reply', body, {
            channelId: msg.channelId,
            spaceId: msg.spaceId,
            isMention,
          });
        } else if (isMention) {
          const body = senderName
            ? `${senderName} mentioned you in #${channelName}`
            : `You were mentioned in #${channelName}`;
          ctx.fireNotification('Mention', body, {
            channelId: msg.channelId,
            spaceId: msg.spaceId,
            isMention: true,
          });
        } else if (!isActiveChannel) {
          const body = senderName
            ? `${senderName} in #${channelName}`
            : `New message in #${channelName}`;
          ctx.fireNotification('New message', body, {
            channelId: msg.channelId,
            spaceId: msg.spaceId,
          });
        }
      }
      break;
    }

    case 'space_message_edited': {
      const { channelId, messageId, content, lastEditedAt, revisionCount } = message.data;
      ctx.setMessagesByChannel((prev) => {
        const state = prev[channelId];
        if (!state) return prev;
        const idx = state.messages.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        const updated = {
          ...state.messages[idx]!,
          ...(content !== undefined ? { content } : {}),
          lastEditedAt,
          revisionCount,
        };
        const messages = [...state.messages];
        messages[idx] = updated;
        return { ...prev, [channelId]: { ...state, messages } };
      });
      break;
    }

    case 'space_message_deleted': {
      const { channelId, messageId } = message.data;
      ctx.setMessagesByChannel((prev) => {
        const state = prev[channelId];
        if (!state) return prev;
        return {
          ...prev,
          [channelId]: {
            ...state,
            messages: state.messages.map((m) =>
              m.id === messageId
                ? { ...m, deleted: true, content: undefined }
                : m,
            ),
          },
        };
      });
      break;
    }

    case 'space_reaction_added': {
      const { reaction } = message.data;
      ctx.onSocketReactionAdded?.({
        id: reaction.id,
        messageId: reaction.messageId,
        channelId: reaction.channelId,
        fromIdentityId: reaction.identityId,
        emoji: reaction.emoji,
        createdAt: reaction.createdAt,
      });

      if (
        ctx.identityId &&
        reaction.identityId !== ctx.identityId &&
        ctx.fireNotification
      ) {
        const targetMsg = ctx.activeChannelMessages?.find((m) => m.id === reaction.messageId);
        if (targetMsg && targetMsg.fromIdentityId === ctx.identityId) {
          const channelName = ctx.channelNames?.[reaction.channelId] ?? reaction.channelId;
          const reactorProfile = ctx.participantProfiles?.[reaction.identityId];
          const reactorName = reactorProfile?.displayName ?? reactorProfile?.username;
          const body = reactorName
            ? `${reactorName} reacted ${reaction.emoji} to your message in #${channelName}`
            : `Someone reacted ${reaction.emoji} to your message in #${channelName}`;
          ctx.fireNotification(
            'Reaction',
            body,
            { channelId: reaction.channelId, spaceId: reaction.spaceId },
          );
        }
      }
      break;
    }

    case 'space_reaction_removed': {
      const { messageId, reactionId } = message.data;
      ctx.onSocketReactionRemoved?.(messageId, reactionId);
      break;
    }

    case 'space_pins_updated': {
      const { messageId, action } = message.data;
      ctx.onSocketPinsUpdated?.(messageId, action);
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
      const { spaceId, identityId, reason } = message.data;
      if (identityId === ctx.identityId) {
        let leavingName: string | undefined;
        ctx.setSpaces((prev) => {
          leavingName = prev.find((s) => s.id === spaceId)?.name;
          return prev.filter((s) => s.id !== spaceId);
        });
        const t = ctx.t;
        if (reason === 'banned') {
          ctx.fireNotification?.(
            t?.('spaces.notifications.bannedTitle', { defaultValue: 'Banned from Space' })
              ?? 'Banned from Space',
            leavingName
              ? (t?.('spaces.notifications.bannedBody', {
                  name: leavingName,
                  defaultValue: `You were banned from ${leavingName}`,
                }) ?? `You were banned from ${leavingName}`)
              : (t?.('spaces.notifications.bannedBodyGeneric', {
                  defaultValue: 'You were banned from a Space',
                }) ?? 'You were banned from a Space'),
            { spaceId, onClick: () => undefined },
          );
        } else if (reason === 'kicked') {
          ctx.fireNotification?.(
            t?.('spaces.notifications.kickedTitle', { defaultValue: 'Removed from Space' })
              ?? 'Removed from Space',
            leavingName
              ? (t?.('spaces.notifications.kickedBody', {
                  name: leavingName,
                  defaultValue: `You were removed from ${leavingName}`,
                }) ?? `You were removed from ${leavingName}`)
              : (t?.('spaces.notifications.kickedBodyGeneric', {
                  defaultValue: 'You were removed from a Space',
                }) ?? 'You were removed from a Space'),
            { spaceId, onClick: () => undefined },
          );
        }
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

    case 'space_member_updated': {
      const { spaceId, member } = message.data;
      emitSpaceMemberUpdated(spaceId, member);
      break;
    }

    // Invite events — acknowledged here, full UI lands in Phase 7.
    case 'space_invite_received':
    case 'space_invite_accepted':
    case 'space_invite_revoked':
      break;
  }
}
