/**
 * Notification repository
 * Data access layer for notification operations with MongoDB persistence
 *
 * PRIVACY NOTE: Notifications must never leak User identity.
 * All notification data is tied to Identity, not User.
 */

import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  NotificationDocument,
  CreateNotificationInput,
  NotificationType,
} from '../models/notification';
import { withUpdatedAt } from '../models/base';

/**
 * Notification repository interface
 */
export interface INotificationRepository {
  create(input: CreateNotificationInput): Promise<NotificationDocument>;
  getNotifications(
    recipientId: ObjectId,
    options?: {
      limit?: number;
      cursor?: ObjectId;
      since?: Date;
      unreadOnly?: boolean;
      types?: NotificationType[];
    }
  ): Promise<NotificationDocument[]>;
  markAsRead(notificationIds: ObjectId[]): Promise<number>;
  markAsUnread(notificationIds: ObjectId[]): Promise<number>;
  markAllAsRead(recipientId: ObjectId): Promise<number>;
  markAllAsUnread(recipientId: ObjectId): Promise<number>;
  deleteNotifications(notificationIds: ObjectId[]): Promise<number>;
  deleteAllForIdentity(recipientId: ObjectId): Promise<number>;
  countUnread(recipientId: ObjectId): Promise<number>;
  countUnreadByType(recipientId: ObjectId): Promise<Record<string, number>>;
}

/**
 * Notification repository implementation
 */
export class NotificationRepository
  extends BaseRepository<NotificationDocument>
  implements INotificationRepository {
  constructor() {
    super(Collections.NOTIFICATIONS);
  }

  /**
   * Create a new notification
   */
  async create(input: CreateNotificationInput): Promise<NotificationDocument> {
    const doc: Omit<NotificationDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      recipientIdentityId: input.recipientIdentityId,
      type: input.type,
      data: input.data,
      read: false,
    };

    return await super.create(doc);
  }

  /**
   * Get notifications for an identity with filtering and pagination
   */
  async getNotifications(
    recipientId: ObjectId,
    options: {
      limit?: number;
      cursor?: ObjectId;
      since?: Date;
      unreadOnly?: boolean;
      types?: NotificationType[];
    } = {}
  ): Promise<NotificationDocument[]> {
    const { limit = 50, cursor, since, unreadOnly, types } = options;

    const filter: Filter<NotificationDocument> = {
      recipientIdentityId: recipientId,
    };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    if (since) {
      filter.createdAt = { $gt: since };
    }

    if (unreadOnly) {
      filter.read = false;
    }

    if (types && types.length > 0) {
      filter.type = { $in: types };
    }

    return await this.collection
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray() as NotificationDocument[];
  }

  /**
   * Mark specific notifications as read
   */
  async markAsRead(notificationIds: ObjectId[]): Promise<number> {
    if (notificationIds.length === 0) return 0;

    const result = await this.collection.updateMany(
      { _id: { $in: notificationIds } },
      { $set: withUpdatedAt({ read: true }) }
    );

    return result.modifiedCount;
  }

  /**
   * Mark specific notifications as unread
   */
  async markAsUnread(notificationIds: ObjectId[]): Promise<number> {
    if (notificationIds.length === 0) return 0;

    const result = await this.collection.updateMany(
      { _id: { $in: notificationIds } },
      { $set: withUpdatedAt({ read: false }) }
    );

    return result.modifiedCount;
  }

  /**
   * Mark all notifications as read for an identity
   */
  async markAllAsRead(recipientId: ObjectId): Promise<number> {
    const result = await this.collection.updateMany(
      { recipientIdentityId: recipientId, read: false },
      { $set: withUpdatedAt({ read: true }) }
    );

    return result.modifiedCount;
  }

  /**
   * Mark all notifications as unread for an identity
   */
  async markAllAsUnread(recipientId: ObjectId): Promise<number> {
    const result = await this.collection.updateMany(
      { recipientIdentityId: recipientId, read: true },
      { $set: withUpdatedAt({ read: false }) }
    );

    return result.modifiedCount;
  }

  /**
   * Delete specific notifications
   */
  async deleteNotifications(notificationIds: ObjectId[]): Promise<number> {
    if (notificationIds.length === 0) return 0;

    const result = await this.collection.deleteMany({
      _id: { $in: notificationIds },
    });

    return result.deletedCount;
  }

  /**
   * Delete all notifications for an identity
   */
  async deleteAllForIdentity(recipientId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({
      recipientIdentityId: recipientId,
    });

    return result.deletedCount;
  }

  /**
   * Count unread notifications for an identity
   */
  async countUnread(recipientId: ObjectId): Promise<number> {
    return await this.count({
      recipientIdentityId: recipientId,
      read: false,
    });
  }

  /**
   * Count unread notifications grouped by type
   */
  async countUnreadByType(recipientId: ObjectId): Promise<Record<string, number>> {
    const pipeline = [
      {
        $match: {
          recipientIdentityId: recipientId,
          read: false,
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
    ];

    const results = await this.collection.aggregate(pipeline).toArray();

    const counts: Record<string, number> = {};
    for (const result of results) {
      counts[result._id as string] = result.count as number;
    }

    return counts;
  }

  /**
   * Find notifications belonging to a specific identity
   * Used for authorization checks
   */
  async findByIdsForIdentity(
    notificationIds: ObjectId[],
    recipientId: ObjectId
  ): Promise<NotificationDocument[]> {
    return await this.collection
      .find({
        _id: { $in: notificationIds },
        recipientIdentityId: recipientId,
      })
      .toArray() as NotificationDocument[];
  }
}

let notificationRepository: NotificationRepository | null = null;

/**
 * Get the notification repository instance
 */
export function getNotificationRepository(): NotificationRepository {
  if (!notificationRepository) {
    notificationRepository = new NotificationRepository();
  }
  return notificationRepository;
}
