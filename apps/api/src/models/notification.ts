/**
 * Notification model
 * Represents notifications for various identity-scoped events.
 *
 * PRIVACY NOTE: Notifications must never leak User identity.
 * All notification data is tied to Identity, not User.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Notification type identifier.
 * Concrete values will be defined as features are implemented.
 */
export type NotificationType = string;

/**
 * Notification data payload (varies by type).
 * Concrete fields will be added as notification types are defined.
 */
export type NotificationData = Record<string, unknown>;

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
