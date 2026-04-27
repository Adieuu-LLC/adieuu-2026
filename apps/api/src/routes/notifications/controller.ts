/**
 * Notifications controller module.
 *
 * Contains the business logic for notification management endpoints,
 * including fetching, marking as read/unread, and deleting notifications.
 *
 * @module routes/notifications/controller
 */

import { success, errors } from '../../utils/response';
import { RouteContext } from '../../router';
import {
  getNotifications,
  markNotificationsAsRead,
  markNotificationsAsUnread,
  deleteNotifications,
  getNotificationCounts,
} from '../../services/notification.service';
import { isValidObjectId, sanitizeString } from '../../utils';
import { z } from '@adieuu/shared/schemas';

/**
 * Zod schema for notification IDs (array or "all")
 */
const NotificationIdsSchema = z.object({
  notificationIds: z.union([
    z.array(z.string().length(24)),
    z.literal('all'),
  ]),
});

/**
 * Validates and filters notification IDs from request body.
 * Returns validated IDs or an error response.
 */
function validateNotificationIds(
  ctx: RouteContext
): { valid: true; ids: string[] | 'all' } | { valid: false; response: Response } {
  const parseResult = NotificationIdsSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return { valid: false, response: ctx.errors.validationFailed() };
  }

  const { notificationIds } = parseResult.data;

  if (notificationIds === 'all') {
    return { valid: true, ids: 'all' };
  }

  const validIds = notificationIds.filter((id) => {
    const sanitized = sanitizeString(id, 'general');
    return sanitized.value && isValidObjectId(sanitized.value);
  });

  if (validIds.length === 0 && notificationIds.length > 0) {
    return { valid: false, response: errors.badRequest('Invalid notification IDs.') };
  }

  return { valid: true, ids: validIds };
}

export async function getNotificationsCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  // Parse query params
  const since = ctx.query.get('since');
  const limitParam = ctx.query.get('limit');
  const unreadOnlyParam = ctx.query.get('unreadOnly');
  const typesParam = ctx.query.get('types');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  const unreadOnly = unreadOnlyParam === 'true';

  // Parse types
  let types: string[] | undefined;
  if (typesParam) {
    types = typesParam.split(',').map((t) => t.trim());
  }

  // Validate since date if provided
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

  const result = await getNotifications(identity._id, {
    limit,
    since: validSince,
    unreadOnly,
    types,
  });

  return success({
    notifications: result.notifications,
    unreadCount: result.unreadCount,
  });
}

export async function markNotificationsAsReadCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const validation = validateNotificationIds(ctx);
  if (!validation.valid) {
    return validation.response;
  }

  const result = await markNotificationsAsRead(identity._id, validation.ids);

  return success({
    markedCount: result.markedCount,
  });
}

export async function markNotificationsAsUnreadCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const validation = validateNotificationIds(ctx);
  if (!validation.valid) {
    return validation.response;
  }

  const result = await markNotificationsAsUnread(identity._id, validation.ids);

  return success({
    markedCount: result.markedCount,
  });
}

export async function deleteNotificationsCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const validation = validateNotificationIds(ctx);
  if (!validation.valid) {
    return validation.response;
  }

  const result = await deleteNotifications(identity._id, validation.ids);

  return success({
    deletedCount: result.deletedCount,
  });
}

export async function getNotificationCountsCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const counts = await getNotificationCounts(identity._id);

  return success({
    unread: counts.unread,
    byType: counts.byType,
  });
}
