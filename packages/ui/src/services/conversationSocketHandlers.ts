import type {
  ChatIncomingMessage,
  PublicGroupInvite,
  PublicIdentity,
} from '@adieuu/shared';
import { emitAchievementUnlocked } from './achievementEvents';
import { emitSupportTicketUpdated, getActiveSupportTicketId } from './supportTicketEvents';

interface DisplayMessageLike {
  id: string;
  deleted?: boolean;
  decryptedContent?: string;
  ciphertext?: string;
  fromIdentityId?: string;
}

interface DecryptedConversationLike {
  id: string;
  unreadCount: number;
  hasUnread: boolean;
  type?: string;
  encryptedName?: string | null;
  nameNonce?: string | null;
  participants?: string[];
  createdBy?: string;
  lastMessageAt?: string;
  lastMessageId?: string;
  gifsDisabled?: boolean;
  allowSkipModeration?: boolean;
}

interface ConversationMessagesStateLike {
  messages: DisplayMessageLike[];
  olderCursor: string | null;
  loading: boolean;
}

type Updater<T> = (prev: T) => T;

export interface ConversationSocketHandlerContext {
  setConversations: (updater: Updater<DecryptedConversationLike[]>) => void;
  setMessagesState: (
    updater: Updater<Record<string, ConversationMessagesStateLike>>
  ) => void;
  setActiveConversationId: (updater: Updater<string | null>) => void;
  setInvites: (updater: Updater<PublicGroupInvite[]>) => void;
  activeConversationId: string | null;
  isAtBottom: boolean;
  hasFocus: boolean;
  identityId?: string;
  messagesState: Record<string, ConversationMessagesStateLike>;
  participantProfiles: Record<string, PublicIdentity>;
  decryptGroupName: (
    encryptedName: string,
    nonce: string,
    conversationId: string
  ) => string;
  fetchConversations: () => void;
  fetchMessages: (
    conversationId: string,
    paginationCursor?: string,
    silent?: boolean,
    mergeLatest?: boolean,
    direction?: 'older' | 'newer'
  ) => void;
  refreshMessageInConversation: (conversationId: string, messageId: string) => void;
  fireNotification: (
    title: string,
    body: string,
    options?: { isViewingConvo?: boolean; onClick?: () => void; expiresAt?: string; isMention?: boolean }
  ) => void;
  navigate: (path: string) => void;
  resolveParticipants: (participantIds: string[]) => Promise<Record<string, PublicIdentity>>;
  t: (key: string, options?: Record<string, unknown>) => string;
  runReactionNotifOnce: (reactionId: string, fn: () => void) => void;
  loadReactionNotificationsEnabled: (identityId: string) => boolean;
  openInvites: () => void;
  refreshParticipantProfile: (identityId: string) => void;
  /** When the server signals a change to pending group invites (sidebar list). */
  onPendingInvitesChanged?: (conversationId: string) => void;
}

export function handleConversationSocketMessage(
  message: ChatIncomingMessage,
  ctx: ConversationSocketHandlerContext
): void {
  switch (message.type) {
    case 'conversation_created': {
      const conv = message.data.conversation;
      ctx.setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        const decrypted: DecryptedConversationLike = {
          ...conv,
          unreadCount: 0,
          hasUnread: false,
          decryptedName:
            conv.type === 'group' && conv.encryptedName && conv.nameNonce
              ? (() => {
                  try {
                    return ctx.decryptGroupName(conv.encryptedName!, conv.nameNonce!, conv.id);
                  } catch {
                    return undefined;
                  }
                })()
              : undefined,
        } as DecryptedConversationLike;
        return [decrypted, ...prev];
      });

      void ctx.resolveParticipants(conv.participants).then((freshProfiles) => {
        const profiles = { ...ctx.participantProfiles, ...freshProfiles };
        const creatorProfile = profiles[conv.createdBy];
        const creatorName = creatorProfile?.displayName ?? creatorProfile?.username;
        ctx.fireNotification(
          ctx.t('conversations.notifications.newConversation', {
            defaultValue: 'New conversation',
          }),
          creatorName
            ? ctx.t('conversations.notifications.newConversationBody', {
                name: creatorName,
                defaultValue: `${creatorName} started a conversation`,
              })
            : ctx.t('conversations.notifications.newConversationGeneric', {
                defaultValue: 'Someone started a conversation with you',
              }),
          { onClick: () => ctx.navigate(`/conversations/${conv.id}`) }
        );
      });
      break;
    }

    case 'conversation_updated': {
      const {
        conversationId,
        action,
        identityId: eventIdentityId,
        conversationType: eventConversationType,
      } = message.data;
      if (action === 'pending_invites_changed') {
        ctx.onPendingInvitesChanged?.(conversationId);
        break;
      }
      if (action === 'removed') {
        ctx.setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        ctx.setActiveConversationId((prev) => (prev === conversationId ? null : prev));

        ctx.fireNotification(
          ctx.t('conversations.notifications.youWereRemoved', {
            defaultValue: 'Removed from group',
          }),
          ctx.t('conversations.notifications.youWereRemovedBody', {
            defaultValue: 'You were removed from a group conversation',
          })
        );
      } else if (action === 'pins_updated') {
        const ids = message.data.pinnedMessageIds ?? [];
        ctx.setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, pinnedMessageIds: ids } : c))
        );
      } else if (action === 'gifs_disabled_updated') {
        const newVal = message.data.gifsDisabled ?? false;
        ctx.setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, gifsDisabled: newVal } : c))
        );
      } else if (action === 'gif_content_filter_updated') {
        const newVal = message.data.gifContentFilter as import('@adieuu/shared').GifContentFilter | undefined;
        ctx.setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, gifContentFilter: newVal } : c))
        );
      } else if (action === 'custom_emojis_disabled_updated') {
        const newVal = message.data.customEmojisDisabled ?? false;
        ctx.setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, customEmojisDisabled: newVal } : c))
        );
      } else if (action === 'message_search_cache_policy_updated') {
        const newVal = message.data.disallowPersistentMessageSearchCache ?? false;
        ctx.setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, disallowPersistentMessageSearchCache: newVal } : c
          )
        );
      } else if (action === 'allow_skip_moderation_updated') {
        const newVal = message.data.allowSkipModeration ?? false;
        ctx.setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, allowSkipModeration: newVal } : c
          )
        );
      } else {
        ctx.fetchConversations();
        if (conversationId === ctx.activeConversationId) {
          ctx.fetchMessages(conversationId, undefined, true);
        }
      }

      const navToConvo = () => ctx.navigate(`/conversations/${conversationId}`);
      if (action === 'member_added' && eventIdentityId) {
        void ctx.resolveParticipants([eventIdentityId]).then((freshProfiles) => {
          const profiles = { ...ctx.participantProfiles, ...freshProfiles };
          const profile = profiles[eventIdentityId];
          const name = profile?.displayName ?? profile?.username;
          ctx.fireNotification(
            ctx.t('conversations.notifications.memberAdded', {
              defaultValue: 'Member added',
            }),
            name
              ? ctx.t('conversations.notifications.memberAddedBody', {
                  name,
                  defaultValue: `${name} was added to the group`,
                })
              : ctx.t('conversations.notifications.memberAddedGeneric', {
                  defaultValue: 'A new member was added to the group',
                }),
            { onClick: navToConvo }
          );
        });
      } else if (action === 'member_left' && eventIdentityId) {
        const profile = ctx.participantProfiles[eventIdentityId];
        const name = profile?.displayName ?? profile?.username;
        ctx.fireNotification(
          ctx.t('conversations.notifications.memberLeft', { defaultValue: 'Member left' }),
          name
            ? ctx.t('conversations.notifications.memberLeftBody', {
                name,
                defaultValue: `${name} left the group`,
              })
            : ctx.t('conversations.notifications.memberLeftGeneric', {
                defaultValue: 'A member left the group',
              }),
          { onClick: navToConvo }
        );
      } else if (action === 'member_removed' && eventIdentityId) {
        const profile = ctx.participantProfiles[eventIdentityId];
        const name = profile?.displayName ?? profile?.username;
        ctx.fireNotification(
          ctx.t('conversations.notifications.memberRemoved', {
            defaultValue: 'Member removed',
          }),
          name
            ? ctx.t('conversations.notifications.memberRemovedBody', {
                name,
                defaultValue: `${name} was removed from the group`,
              })
            : ctx.t('conversations.notifications.memberRemovedGeneric', {
                defaultValue: 'A member was removed from the group',
              }),
          { onClick: navToConvo }
        );
      } else if (action === 'renamed') {
        const isDmTopic = eventConversationType === 'dm';
        if (eventIdentityId) {
          void ctx.resolveParticipants([eventIdentityId]).then((freshProfiles) => {
            const profiles = { ...ctx.participantProfiles, ...freshProfiles };
            const profile = profiles[eventIdentityId];
            const name = profile?.displayName ?? profile?.username;
            if (isDmTopic) {
              ctx.fireNotification(
                ctx.t('conversations.notifications.conversationTopicUpdated', {
                  defaultValue: 'Conversation updated',
                }),
                name
                  ? ctx.t('conversations.notifications.conversationTopicUpdatedByBody', {
                      name,
                      defaultValue: `${name} updated the conversation topic`,
                    })
                  : ctx.t('conversations.notifications.conversationTopicUpdatedBody', {
                      defaultValue: 'The conversation topic or name was updated',
                    }),
                { onClick: navToConvo }
              );
            } else {
              ctx.fireNotification(
                ctx.t('conversations.notifications.groupRenamed', {
                  defaultValue: 'Group renamed',
                }),
                name
                  ? ctx.t('conversations.notifications.groupRenamedByBody', {
                      name,
                      defaultValue: `${name} renamed the group`,
                    })
                  : ctx.t('conversations.notifications.groupRenamedBody', {
                      defaultValue: 'The group name was updated',
                    }),
                { onClick: navToConvo }
              );
            }
          });
        } else {
          ctx.fireNotification(
            isDmTopic
              ? ctx.t('conversations.notifications.conversationTopicUpdated', {
                  defaultValue: 'Conversation updated',
                })
              : ctx.t('conversations.notifications.groupRenamed', {
                  defaultValue: 'Group renamed',
                }),
            isDmTopic
              ? ctx.t('conversations.notifications.conversationTopicUpdatedBody', {
                  defaultValue: 'The conversation topic or name was updated',
                })
              : ctx.t('conversations.notifications.groupRenamedBody', {
                  defaultValue: 'The group name was updated',
                }),
            { onClick: navToConvo }
          );
        }
      } else if (action === 'admin_promoted' && eventIdentityId) {
        const profile = ctx.participantProfiles[eventIdentityId];
        const name = profile?.displayName ?? profile?.username;
        ctx.fireNotification(
          ctx.t('conversations.notifications.adminPromoted', {
            defaultValue: 'New admin',
          }),
          name
            ? ctx.t('conversations.notifications.adminPromotedBody', {
                name,
                defaultValue: `${name} was promoted to admin`,
              })
            : ctx.t('conversations.notifications.adminPromotedGeneric', {
                defaultValue: 'A member was promoted to admin',
              }),
          { onClick: navToConvo }
        );
      }
      break;
    }

    case 'conversation_message': {
      const {
        conversationId,
        messageId,
        fromIdentityId,
        replyToMessageId,
        replyToMessageAuthorId,
        expiresAt,
        mentionedIdentityIds,
      } = message.data;
      const isActiveConvo = conversationId === ctx.activeConversationId;
      const isViewing = isActiveConvo && ctx.hasFocus && ctx.isAtBottom;

      if (!isViewing) {
        ctx.setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c
          )
        );
      } else {
        ctx.setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
        );
      }

      if (isActiveConvo) {
        const alreadyHaveMessages =
          (ctx.messagesState[conversationId]?.messages?.length ?? 0) > 0;
        ctx.fetchMessages(conversationId, undefined, true, alreadyHaveMessages);
      }

      ctx.setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) return prev;
        const conv = prev[idx]!;
        const updated = {
          ...conv,
          lastMessageAt: message.data.createdAt,
          lastMessageId: messageId,
        };
        const rest = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        return [updated, ...rest];
      });

      const senderProfile = ctx.participantProfiles[fromIdentityId];
      const senderName = senderProfile?.displayName ?? senderProfile?.username;
      const isReplyToMe =
        !!replyToMessageId &&
        typeof replyToMessageAuthorId === 'string' &&
        replyToMessageAuthorId === ctx.identityId;
      const isMention =
        !!ctx.identityId &&
        Array.isArray(mentionedIdentityIds) &&
        mentionedIdentityIds.includes(ctx.identityId);
      const navToMessage = () =>
        ctx.navigate(`/conversations/${conversationId}?messageId=${messageId}`);

      if (isReplyToMe) {
        ctx.fireNotification(
          ctx.t('conversations.notifications.messageReply', {
            defaultValue: 'Reply to your message',
          }),
          senderName
            ? ctx.t('conversations.notifications.messageReplyBody', {
                name: senderName,
                defaultValue: `${senderName} replied to your message`,
              })
            : ctx.t('conversations.notifications.messageReplyGeneric', {
                defaultValue: 'Someone replied to your message',
              }),
          { isViewingConvo: isViewing, onClick: navToMessage, expiresAt, isMention }
        );
      } else {
        ctx.fireNotification(
          isMention
            ? ctx.t('conversations.notifications.mentioned', {
                defaultValue: 'You were mentioned',
              })
            : ctx.t('conversations.notifications.newMessage', {
                defaultValue: 'New message',
              }),
          senderName
            ? isMention
              ? ctx.t('conversations.notifications.mentionedBody', {
                  name: senderName,
                  defaultValue: `${senderName} mentioned you`,
                })
              : ctx.t('conversations.notifications.newMessageBody', {
                  name: senderName,
                  defaultValue: `Message from ${senderName}`,
                })
            : isMention
              ? ctx.t('conversations.notifications.mentionedGeneric', {
                  defaultValue: 'Someone mentioned you',
                })
              : ctx.t('conversations.notifications.newMessageGeneric', {
                  defaultValue: 'You received a new message',
                }),
          { isViewingConvo: isViewing, onClick: navToMessage, expiresAt, isMention }
        );
      }
      break;
    }

    case 'conversation_message_edited': {
      const { conversationId, messageId } = message.data;
      if (conversationId === ctx.activeConversationId) {
        void ctx.refreshMessageInConversation(conversationId, messageId);
      }
      break;
    }

    case 'conversation_message_deleted': {
      const { conversationId, messageId } = message.data;
      ctx.setMessagesState((prev) => {
        const state = prev[conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...state,
            messages: state.messages.map((m) =>
              m.id === messageId
                ? { ...m, deleted: true, decryptedContent: undefined, ciphertext: undefined }
                : m
            ),
          },
        };
      });
      break;
    }

    case 'reaction_added': {
      const { reaction, messageAuthorId } = message.data;
      if (!ctx.identityId || reaction.fromIdentityId === ctx.identityId) break;
      if (!ctx.loadReactionNotificationsEnabled(ctx.identityId)) break;

      let isMessageOurs = false;
      if (typeof messageAuthorId === 'string' && messageAuthorId.length > 0) {
        isMessageOurs = messageAuthorId === ctx.identityId;
      } else {
        const convId = reaction.conversationId;
        let msgs = ctx.messagesState[convId]?.messages;
        if (!msgs) {
          const lower = convId.toLowerCase();
          for (const k of Object.keys(ctx.messagesState)) {
            if (k.toLowerCase() === lower) {
              msgs = ctx.messagesState[k]?.messages;
              break;
            }
          }
        }
        const targetMsg = (msgs ?? []).find((m) => m.id === reaction.messageId);
        isMessageOurs = !!targetMsg && targetMsg.fromIdentityId === ctx.identityId;
      }
      if (!isMessageOurs) break;

      const convId = reaction.conversationId;
      const isViewing =
        convId === ctx.activeConversationId && ctx.hasFocus && ctx.isAtBottom;

      const fire = () => {
        if (!isViewing) {
          ctx.setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, unreadCount: c.unreadCount + 1 } : c
            )
          );
        }

        const navToReaction = () =>
          ctx.navigate(`/conversations/${convId}?messageId=${reaction.messageId}`);

        void ctx.resolveParticipants([reaction.fromIdentityId]).then((freshProfiles) => {
          const profiles = { ...ctx.participantProfiles, ...freshProfiles };
          const profile = profiles[reaction.fromIdentityId];
          const name = profile?.displayName ?? profile?.username;
          ctx.fireNotification(
            ctx.t('conversations.notifications.reaction', { defaultValue: 'Reaction' }),
            name
              ? ctx.t('conversations.notifications.reactionBody', {
                  name,
                  defaultValue: `${name} reacted to your message`,
                })
              : ctx.t('conversations.notifications.reactionGeneric', {
                  defaultValue: 'Someone reacted to your message',
                }),
            { isViewingConvo: isViewing, onClick: navToReaction }
          );
        });
      };

      ctx.runReactionNotifOnce(reaction.id, fire);
      break;
    }

    case 'group_invite_revoked': {
      const inviteId = message.data.inviteId;
      ctx.setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      break;
    }

    case 'group_invite_received': {
      const invite = message.data.invite;
      ctx.setInvites((prev) => {
        if (prev.some((i) => i.id === invite.id)) return prev;
        return [invite, ...prev];
      });

      void ctx.resolveParticipants([invite.invitedByIdentityId]).then((freshProfiles) => {
        const profiles = { ...ctx.participantProfiles, ...freshProfiles };
        const inviterProfile = profiles[invite.invitedByIdentityId];
        const inviterDisplayName =
          inviterProfile?.displayName ?? inviterProfile?.username;
        const othersCount = invite.memberCount - 1;
        const body = invite.hasGroupName
          ? ctx.t('conversations.notifications.groupInviteNameHidden', {
              defaultValue: "You've been invited to a group (name hidden until you join)",
            })
          : inviterDisplayName
            ? othersCount > 0
              ? ctx.t('conversations.notifications.groupInviteFromBody', {
                  name: inviterDisplayName,
                  count: othersCount,
                  defaultValue: `${inviterDisplayName} + ${othersCount} others invited you`,
                })
              : ctx.t('conversations.notifications.groupInviteFromSolo', {
                  name: inviterDisplayName,
                  defaultValue: `${inviterDisplayName} is inviting you`,
                })
            : ctx.t('conversations.notifications.groupInviteGeneric', {
                defaultValue: "You've been invited to a group",
              });
        ctx.fireNotification(
          ctx.t('conversations.notifications.groupInvite', {
            defaultValue: 'Group invitation',
          }),
          body,
          { onClick: () => ctx.openInvites() }
        );
      });
      break;
    }

    case 'group_invite_accepted': {
      ctx.fetchConversations();
      if (message.data.identityId) {
        void ctx.resolveParticipants([message.data.identityId]);
      }
      const joinerName = message.data.displayName ?? message.data.username;
      const acceptedConvId = message.data.conversationId;
      ctx.fireNotification(
        ctx.t('conversations.notifications.memberJoined', {
          defaultValue: 'Member joined',
        }),
        joinerName
          ? ctx.t('conversations.notifications.memberJoinedBody', {
              name: joinerName,
              defaultValue: `${joinerName} joined the group`,
            })
          : ctx.t('conversations.notifications.memberJoinedGeneric', {
              defaultValue: 'A new member joined the group',
            }),
        acceptedConvId
          ? { onClick: () => ctx.navigate(`/conversations/${acceptedConvId}`) }
          : undefined
      );
      break;
    }

    case 'group_terminated': {
      const { conversationId, terminatedBy } = message.data;
      ctx.setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      ctx.setActiveConversationId((prev) => (prev === conversationId ? null : prev));
      const adminName =
        terminatedBy.displayName ?? terminatedBy.username ?? terminatedBy.id.slice(0, 8);
      ctx.fireNotification(
        ctx.t('conversations.notifications.groupTerminated', {
          defaultValue: 'Conversation deleted',
        }),
        ctx.t('conversations.notifications.groupTerminatedBody', {
          name: adminName,
          defaultValue: `${adminName} deleted the conversation`,
        })
      );
      break;
    }

    case 'notification_created': {
      const { notification } = message.data;

      if (notification.type === 'achievement_unlocked') {
        const achData = notification.data as {
          achievementId?: string;
          definition?: { id: string; name: string; description: string; icon: string; category: string };
        };
        if (achData.achievementId && achData.definition) {
          emitAchievementUnlocked({
            achievementId: achData.achievementId,
            definition: achData.definition,
          });
        }
        break;
      }

      if (notification.type === 'support_ticket_reply' || notification.type === 'support_ticket_user_reply') {
        const ticketData = notification.data as { ticketId?: string; title?: string };
        if (ticketData.ticketId) {
          emitSupportTicketUpdated({ ticketId: ticketData.ticketId });
        }

        const isViewing = ticketData.ticketId === getActiveSupportTicketId();
        if (!isViewing) {
          const title = ctx.t('support.notifications.ticketReply', { defaultValue: 'New reply on your support ticket' });
          const body = ticketData.title
            ? ctx.t('support.notifications.ticketReplyBody', { title: ticketData.title, defaultValue: `New reply on "${ticketData.title}"` })
            : title;
          ctx.fireNotification(title, body, {
            onClick: () => ctx.navigate(`/support/${ticketData.ticketId ?? ''}`),
          });
        }
        break;
      }

      if (notification.type !== 'message_reaction') break;
      if (!ctx.identityId || !ctx.loadReactionNotificationsEnabled(ctx.identityId)) break;

      const raw = notification.data as {
        reactionId?: string;
        fromIdentityId?: unknown;
        conversationId?: unknown;
        messageId?: unknown;
      };
      const fromId = typeof raw.fromIdentityId === 'string' ? raw.fromIdentityId : undefined;
      const convId =
        typeof raw.conversationId === 'string' ? raw.conversationId : undefined;
      const reactionId = typeof raw.reactionId === 'string' ? raw.reactionId : undefined;
      const notifMsgId = typeof raw.messageId === 'string' ? raw.messageId : undefined;
      if (!fromId || !convId) break;

      const isViewing =
        convId === ctx.activeConversationId && ctx.hasFocus && ctx.isAtBottom;

      const fire = () => {
        if (!isViewing) {
          ctx.setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, unreadCount: c.unreadCount + 1 } : c
            )
          );
        }

        const navToReactedMsg = notifMsgId
          ? () => ctx.navigate(`/conversations/${convId}?messageId=${notifMsgId}`)
          : () => ctx.navigate(`/conversations/${convId}`);

        void ctx.resolveParticipants([fromId]).then((freshProfiles) => {
          const profiles = { ...ctx.participantProfiles, ...freshProfiles };
          const profile = profiles[fromId];
          const name = profile?.displayName ?? profile?.username;
          ctx.fireNotification(
            ctx.t('conversations.notifications.reaction', { defaultValue: 'Reaction' }),
            name
              ? ctx.t('conversations.notifications.reactionBody', {
                  name,
                  defaultValue: `${name} reacted to your message`,
                })
              : ctx.t('conversations.notifications.reactionGeneric', {
                  defaultValue: 'Someone reacted to your message',
                }),
            { isViewingConvo: isViewing, onClick: navToReactedMsg }
          );
        });
      };

      if (reactionId) {
        ctx.runReactionNotifOnce(reactionId, fire);
      } else {
        fire();
      }
      break;
    }

    case 'identity_profile_updated': {
      ctx.refreshParticipantProfile(message.data.identityId);
      break;
    }
  }
}
