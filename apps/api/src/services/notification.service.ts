/**
 * @fileoverview Notification Service
 *
 * Provides notification management functionality.
 * Handles creation, retrieval, marking read/unread, and deletion.
 *
 * PRIVACY NOTE: Notifications must never leak User identity.
 * All notification data is tied to Identity, not User.
 *
 * @module services/notification
 */

import { ObjectId } from 'mongodb';
import { getNotificationRepository } from '../repositories/notification.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import type {
  NotificationDocument,
  NotificationType,
  NotificationData,
  FriendRequestNotificationData,
  FriendshipEstablishedNotificationData,
  PublicNotification,
} from '../models/notification';
import { toPublicNotification } from '../models/notification';
import { toPublicIdentity } from '../models/identity';
import elog from '../utils/adieuuLogger';

/**
 * Create notification result
 */
export interface CreateNotificationResult {
  success: boolean;
  notification?: PublicNotification;
  error?: string;
}

/**
 * Get notifications result
 */
export interface GetNotificationsResult {
  notifications: PublicNotification[];
  unreadCount: number;
  cursor: string | null;
}

/**
 * Notification count by type
 */
export interface NotificationCounts {
  unread: number;
  byType: Record<string, number>;
}

/**
 * Create a friend request received notification
 */
export async function createFriendRequestNotification(
  recipientIdentityId: string | ObjectId,
  requestId: string,
  fromIdentityId: string | ObjectId
): Promise<CreateNotificationResult> {
  const notificationRepo = getNotificationRepository();
  const identityRepo = getIdentityRepository();

  const recipientObjId = recipientIdentityId instanceof ObjectId
    ? recipientIdentityId
    : new ObjectId(recipientIdentityId);

  const fromObjId = fromIdentityId instanceof ObjectId
    ? fromIdentityId
    : new ObjectId(fromIdentityId);

  // Get sender's identity info for denormalized data
  const senderIdentity = await identityRepo.findByIdentityId(fromObjId);
  if (!senderIdentity) {
    return {
      success: false,
      error: 'Sender identity not found',
    };
  }

  const data: FriendRequestNotificationData = {
    requestId,
    fromIdentityId: fromObjId.toHexString(),
    fromDisplayName: senderIdentity.displayName,
    fromUsername: senderIdentity.username,
    fromAvatarUrl: senderIdentity.avatarUrl,
  };

  const notification = await notificationRepo.create({
    recipientIdentityId: recipientObjId,
    type: 'friend_request_received',
    data,
  });

  elog.debug('Friend request notification created', {
    recipientId: recipientObjId.toHexString(),
    requestId,
  });

  return {
    success: true,
    notification: toPublicNotification(notification),
  };
}

/**
 * Create a friendship established notification
 * Sent to both parties when they become friends
 */
export async function createFriendshipEstablishedNotification(
  recipientIdentityId: string | ObjectId,
  friendIdentityId: string | ObjectId
): Promise<CreateNotificationResult> {
  const notificationRepo = getNotificationRepository();
  const identityRepo = getIdentityRepository();

  const recipientObjId = recipientIdentityId instanceof ObjectId
    ? recipientIdentityId
    : new ObjectId(recipientIdentityId);

  const friendObjId = friendIdentityId instanceof ObjectId
    ? friendIdentityId
    : new ObjectId(friendIdentityId);

  // Get friend's identity info for denormalized data
  const friendIdentity = await identityRepo.findByIdentityId(friendObjId);
  if (!friendIdentity) {
    return {
      success: false,
      error: 'Friend identity not found',
    };
  }

  const data: FriendshipEstablishedNotificationData = {
    friendIdentityId: friendObjId.toHexString(),
    friendDisplayName: friendIdentity.displayName,
    friendUsername: friendIdentity.username,
    friendAvatarUrl: friendIdentity.avatarUrl,
  };

  const notification = await notificationRepo.create({
    recipientIdentityId: recipientObjId,
    type: 'friendship_established',
    data,
  });

  elog.debug('Friendship established notification created', {
    recipientId: recipientObjId.toHexString(),
    friendId: friendObjId.toHexString(),
  });

  return {
    success: true,
    notification: toPublicNotification(notification),
  };
}

/**
 * Get notifications for an identity
 */
export async function getNotifications(
  identityId: string | ObjectId,
  options: {
    limit?: number;
    cursor?: string;
    since?: string;
    unreadOnly?: boolean;
    types?: string[];
  } = {}
): Promise<GetNotificationsResult> {
  const notificationRepo = getNotificationRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  const { limit = 50, cursor, since, unreadOnly, types } = options;

  // Parse cursor
  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  // Parse since date
  const sinceDate = since ? new Date(since) : undefined;

  // Parse types
  const validTypes = types?.filter((t): t is NotificationType =>
    ['friend_request_received', 'friend_request_accepted', 'friendship_established', 'message_received', 'mention'].includes(t)
  );

  const notifications = await notificationRepo.getNotifications(identityObjId, {
    limit: limit + 1,
    cursor: cursorObjId,
    since: sinceDate,
    unreadOnly,
    types: validTypes,
  });

  const hasMore = notifications.length > limit;
  const resultNotifications = hasMore ? notifications.slice(0, limit) : notifications;

  // Get unread count
  const unreadCount = await notificationRepo.countUnread(identityObjId);

  const nextCursor = hasMore && resultNotifications.length > 0
    ? resultNotifications[resultNotifications.length - 1]!._id.toHexString()
    : null;

  return {
    notifications: resultNotifications.map(toPublicNotification),
    unreadCount,
    cursor: nextCursor,
  };
}

/**
 * Mark notifications as read
 */
export async function markNotificationsAsRead(
  identityId: string | ObjectId,
  notificationIds: string[] | 'all'
): Promise<{ success: boolean; markedCount: number }> {
  const notificationRepo = getNotificationRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  let markedCount: number;

  if (notificationIds === 'all') {
    markedCount = await notificationRepo.markAllAsRead(identityObjId);
  } else {
    // Validate that all notifications belong to this identity
    const notificationObjIds = notificationIds.map((id) => new ObjectId(id));
    const ownedNotifications = await notificationRepo.findByIdsForIdentity(
      notificationObjIds,
      identityObjId
    );

    if (ownedNotifications.length === 0) {
      return { success: true, markedCount: 0 };
    }

    const ownedIds = ownedNotifications.map((n) => n._id);
    markedCount = await notificationRepo.markAsRead(ownedIds);
  }

  return { success: true, markedCount };
}

/**
 * Mark notifications as unread
 */
export async function markNotificationsAsUnread(
  identityId: string | ObjectId,
  notificationIds: string[] | 'all'
): Promise<{ success: boolean; markedCount: number }> {
  const notificationRepo = getNotificationRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  let markedCount: number;

  if (notificationIds === 'all') {
    markedCount = await notificationRepo.markAllAsUnread(identityObjId);
  } else {
    // Validate that all notifications belong to this identity
    const notificationObjIds = notificationIds.map((id) => new ObjectId(id));
    const ownedNotifications = await notificationRepo.findByIdsForIdentity(
      notificationObjIds,
      identityObjId
    );

    if (ownedNotifications.length === 0) {
      return { success: true, markedCount: 0 };
    }

    const ownedIds = ownedNotifications.map((n) => n._id);
    markedCount = await notificationRepo.markAsUnread(ownedIds);
  }

  return { success: true, markedCount };
}

/**
 * Delete notifications
 */
export async function deleteNotifications(
  identityId: string | ObjectId,
  notificationIds: string[] | 'all'
): Promise<{ success: boolean; deletedCount: number }> {
  const notificationRepo = getNotificationRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  let deletedCount: number;

  if (notificationIds === 'all') {
    deletedCount = await notificationRepo.deleteAllForIdentity(identityObjId);
  } else {
    // Validate that all notifications belong to this identity
    const notificationObjIds = notificationIds.map((id) => new ObjectId(id));
    const ownedNotifications = await notificationRepo.findByIdsForIdentity(
      notificationObjIds,
      identityObjId
    );

    if (ownedNotifications.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const ownedIds = ownedNotifications.map((n) => n._id);
    deletedCount = await notificationRepo.deleteNotifications(ownedIds);
  }

  return { success: true, deletedCount };
}

/**
 * Get unread notification counts
 */
export async function getNotificationCounts(
  identityId: string | ObjectId
): Promise<NotificationCounts> {
  const notificationRepo = getNotificationRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  const [unread, byType] = await Promise.all([
    notificationRepo.countUnread(identityObjId),
    notificationRepo.countUnreadByType(identityObjId),
  ]);

  return { unread, byType };
}
