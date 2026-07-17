/**
 * Conversation-specific notification helpers.
 * Delegates to the shared {@link fireChannelNotification}.
 */

export type {
  NotificationSoundPreferenceLike,
  NotificationPlatformLike,
  ChannelNotificationDeps as ConversationNotificationDeps,
} from './channelNotifications';

import {
  fireChannelNotification,
  type ChannelNotificationDeps,
  type ChannelNotificationOptions,
} from './channelNotifications';

export interface ConversationNotificationOptions {
  onClick?: () => void;
  isViewingConversation?: boolean;
  nativeTag: string;
  expiresAt?: string;
  isMention?: boolean;
}

export function fireConversationNotification(
  title: string,
  body: string,
  options: ConversationNotificationOptions,
  deps: ChannelNotificationDeps,
): void {
  fireChannelNotification(title, body, {
    onClick: options.onClick,
    isViewingChannel: options.isViewingConversation,
    nativeTag: options.nativeTag,
    expiresAt: options.expiresAt,
    isMention: options.isMention,
  }, deps);
}
