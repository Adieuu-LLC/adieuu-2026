/**
 * Notifications controller — validation and notification service orchestration.
 *
 * Route modules map structured results to HTTP responses.
 *
 * @module routes/notifications/controller
 */

import type { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import {
  getNotifications,
  markNotificationsAsRead,
  markNotificationsAsUnread,
  deleteNotifications,
  getNotificationCounts,
} from '../../services/notification.service';
import { isValidObjectId, sanitizeString } from '../../utils';

/** Zod schema for notification IDs (array or "all") */
export const NotificationIdsSchema = z.object({
  notificationIds: z.union([
    z.array(z.string().length(24)),
    z.literal('all'),
  ]),
});

export type NotificationFailureKind = 'validation_failed' | 'bad_request';

export type NotificationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; kind: NotificationFailureKind; message?: string };

export type ParseNotificationIdsResult =
  | { ok: true; ids: string[] | 'all' }
  | { ok: false; kind: NotificationFailureKind; message?: string };

/**
 * Validates and filters notification IDs from a request body.
 */
export function parseNotificationIds(body: unknown): ParseNotificationIdsResult {
  const parseResult = NotificationIdsSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const { notificationIds } = parseResult.data;

  if (notificationIds === 'all') {
    return { ok: true, ids: 'all' };
  }

  const validIds = notificationIds.filter((id) => {
    const sanitized = sanitizeString(id, 'general');
    return sanitized.value && isValidObjectId(sanitized.value);
  });

  if (validIds.length === 0 && notificationIds.length > 0) {
    return { ok: false, kind: 'bad_request', message: 'Invalid notification IDs.' };
  }

  return { ok: true, ids: validIds };
}

export type GetNotificationsData = {
  notifications: Awaited<ReturnType<typeof getNotifications>>['notifications'];
  unreadCount: number;
};

export async function getNotificationsResult(
  identityId: ObjectId,
  searchParams: URLSearchParams,
): Promise<NotificationResult<GetNotificationsData>> {
  const since = searchParams.get('since');
  const limitParam = searchParams.get('limit');
  const unreadOnlyParam = searchParams.get('unreadOnly');
  const typesParam = searchParams.get('types');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  const unreadOnly = unreadOnlyParam === 'true';

  let types: string[] | undefined;
  if (typesParam) {
    types = typesParam.split(',')
      .map((t) => sanitizeString(t.trim(), 'idenhanced').value)
      .filter(Boolean);
    if (types.length === 0) types = undefined;
  }

  let validSince: string | undefined;
  if (since) {
    const sanitizedSince = sanitizeString(since, 'general');
    if (sanitizedSince.value) {
      const date = new Date(sanitizedSince.value);
      if (!isNaN(date.getTime())) {
        validSince = sanitizedSince.value;
      }
    }
  }

  const result = await getNotifications(identityId, {
    limit,
    since: validSince,
    unreadOnly,
    types,
  });

  return {
    ok: true,
    data: {
      notifications: result.notifications,
      unreadCount: result.unreadCount,
    },
  };
}

export type MarkNotificationsData = {
  markedCount: number;
};

export async function markNotificationsAsReadResult(
  identityId: ObjectId,
  body: unknown,
): Promise<NotificationResult<MarkNotificationsData>> {
  const parsed = parseNotificationIds(body);
  if (!parsed.ok) return parsed;

  const result = await markNotificationsAsRead(identityId, parsed.ids);

  return {
    ok: true,
    data: { markedCount: result.markedCount },
  };
}

export async function markNotificationsAsUnreadResult(
  identityId: ObjectId,
  body: unknown,
): Promise<NotificationResult<MarkNotificationsData>> {
  const parsed = parseNotificationIds(body);
  if (!parsed.ok) return parsed;

  const result = await markNotificationsAsUnread(identityId, parsed.ids);

  return {
    ok: true,
    data: { markedCount: result.markedCount },
  };
}

export type DeleteNotificationsData = {
  deletedCount: number;
};

export async function deleteNotificationsResult(
  identityId: ObjectId,
  body: unknown,
): Promise<NotificationResult<DeleteNotificationsData>> {
  const parsed = parseNotificationIds(body);
  if (!parsed.ok) return parsed;

  const result = await deleteNotifications(identityId, parsed.ids);

  return {
    ok: true,
    data: { deletedCount: result.deletedCount },
  };
}

export type NotificationCountsData = {
  unread: number;
  byType: Record<string, number>;
};

export async function getNotificationCountsResult(
  identityId: ObjectId,
): Promise<NotificationResult<NotificationCountsData>> {
  const counts = await getNotificationCounts(identityId);

  return {
    ok: true,
    data: {
      unread: counts.unread,
      byType: counts.byType,
    },
  };
}
