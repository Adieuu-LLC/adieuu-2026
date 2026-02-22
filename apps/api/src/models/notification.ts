/**
 * Notification model
 * Represents notifications for friend requests, messages, and other events
 *
 * PRIVACY NOTE: Notifications must never leak User identity.
 * All notification data is tied to Identity, not User.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Notification types
 */
export type NotificationType =
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'friendship_established'
  | 'message_received'
  | 'mention';

/**
 * Friend request notification data (denormalized for efficiency)
 */
export interface FriendRequestNotificationData {
  requestId: string;
  fromIdentityId: string;
  fromDisplayName: string;
  fromUsername: string;
  fromAvatarUrl?: string;
}

/**
 * Friendship established notification data (denormalized for efficiency)
 */
export interface FriendshipEstablishedNotificationData {
  friendIdentityId: string;
  friendDisplayName: string;
  friendUsername: string;
  friendAvatarUrl?: string;
}

/**
 * Union type for notification data payloads
 */
export type NotificationData =
  | FriendRequestNotificationData
  | FriendshipEstablishedNotificationData
  | Record<string, unknown>;

/**
 * Notification document stored in MongoDB
 */
export interface NotificationDocument extends BaseDocument {
  /** Identity that receives this notification */
  recipientIdentityId: ObjectId;

  /** Notification type */
  type: NotificationType;

  /** Type-specific payload (denormalized data) */
  data: NotificationData;

  /** Whether the user has seen this notification */
  read: boolean;
}

/**
 * Notification creation input
 */
export interface CreateNotificationInput {
  recipientIdentityId: ObjectId;
  type: NotificationType;
  data: NotificationData;
}

/**
 * Public notification representation (safe to send to client)
 */
export interface PublicNotification {
  id: string;
  type: NotificationType;
  data: NotificationData;
  read: boolean;
  createdAt: string;
}

/**
 * Convert a NotificationDocument to PublicNotification
 */
export function toPublicNotification(doc: NotificationDocument): PublicNotification {
  return {
    id: doc._id.toHexString(),
    type: doc.type,
    data: doc.data,
    read: doc.read,
    createdAt: doc.createdAt.toISOString(),
  };
}
