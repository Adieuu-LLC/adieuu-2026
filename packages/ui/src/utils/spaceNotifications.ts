/**
 * Space-specific notification helpers.
 * Delegates to the shared {@link fireChannelNotification}.
 */

import {
  fireChannelNotification,
  type ChannelNotificationDeps,
} from './channelNotifications';

export type { ChannelNotificationDeps as SpaceNotificationDeps } from './channelNotifications';

export interface SpaceNotificationOptions {
  onClick?: () => void;
  nativeTag: string;
  isMention?: boolean;
}

export function fireSpaceNotification(
  title: string,
  body: string,
  options: SpaceNotificationOptions,
  deps: ChannelNotificationDeps,
): void {
  fireChannelNotification(title, body, {
    onClick: options.onClick,
    isViewingChannel: false,
    nativeTag: options.nativeTag,
    isMention: options.isMention,
  }, deps);
}
