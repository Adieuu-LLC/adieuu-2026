/**
 * Notifications routes module.
 *
 * Provides endpoints for notification management.
 * All endpoints require an authenticated identity session.
 *
 * @module routes/notifications
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { sanitizeString } from '../../utils/sanitize';
import {
  getIdentityFromSession,
  getIdentitySessionIdFromRequest,
} from '../../services/identity.service';
import {
  getNotifications,
  markNotificationsAsRead,
  markNotificationsAsUnread,
  deleteNotifications,
  getNotificationCounts,
} from '../../services/notification.service';
import { z } from '@adieuu/shared/schemas';
import { ObjectId } from 'mongodb';

const router = new Router();

/**
 * Validates that a string is a valid MongoDB ObjectId
 */
function isValidObjectId(id: string): boolean {
  if (!id || id.length !== 24) return false;
  try {
    new ObjectId(id);
    return true;
  } catch {
    return false;
  }
}

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
 * GET /notifications - Get notifications
 *
 * Returns notifications for the current identity with filtering options.
 *
 * @route GET /api/notifications
 *
 * @queryParam since (string, optional): ISO8601 timestamp - only get notifications after this time
 * @queryParam limit (number, optional): Max results (default: 50, max: 100)
 * @queryParam unreadOnly (boolean, optional): Only return unread notifications
 * @queryParam types (string, optional): Comma-separated notification types to filter
 *
 * @returns 200 OK with notifications array and unread count
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/notifications', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

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
});

/**
 * POST /notifications/read - Mark notifications as read
 *
 * Marks specified notifications as read.
 *
 * @route POST /api/notifications/read
 *
 * @requestBody
 * - `notificationIds` (string[] | "all", required): IDs to mark or "all"
 *
 * @returns 200 OK with count of marked notifications
 * @returns 401 Unauthorized if not authenticated
 */
router.post('/notifications/read', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Validate request body
  const parseResult = NotificationIdsSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { notificationIds } = parseResult.data;

  // Validate IDs if array
  let validIds: string[] | 'all';
  if (notificationIds === 'all') {
    validIds = 'all';
  } else {
    validIds = notificationIds.filter((id) => {
      const sanitized = sanitizeString(id, 'general');
      return sanitized.value && isValidObjectId(sanitized.value);
    });

    if (validIds.length === 0 && notificationIds.length > 0) {
      return errors.badRequest('Invalid notification IDs.');
    }
  }

  const result = await markNotificationsAsRead(identity._id, validIds);

  return success({
    markedCount: result.markedCount,
  });
});

/**
 * POST /notifications/unread - Mark notifications as unread
 *
 * Marks specified notifications as unread.
 *
 * @route POST /api/notifications/unread
 *
 * @requestBody
 * - `notificationIds` (string[] | "all", required): IDs to mark or "all"
 *
 * @returns 200 OK with count of marked notifications
 * @returns 401 Unauthorized if not authenticated
 */
router.post('/notifications/unread', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Validate request body
  const parseResult = NotificationIdsSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { notificationIds } = parseResult.data;

  // Validate IDs if array
  let validIds: string[] | 'all';
  if (notificationIds === 'all') {
    validIds = 'all';
  } else {
    validIds = notificationIds.filter((id) => {
      const sanitized = sanitizeString(id, 'general');
      return sanitized.value && isValidObjectId(sanitized.value);
    });

    if (validIds.length === 0 && notificationIds.length > 0) {
      return errors.badRequest('Invalid notification IDs.');
    }
  }

  const result = await markNotificationsAsUnread(identity._id, validIds);

  return success({
    markedCount: result.markedCount,
  });
});

/**
 * DELETE /notifications - Delete notifications
 *
 * Deletes specified notifications.
 *
 * @route DELETE /api/notifications
 *
 * @requestBody
 * - `notificationIds` (string[] | "all", required): IDs to delete or "all"
 *
 * @returns 200 OK with count of deleted notifications
 * @returns 401 Unauthorized if not authenticated
 */
router.delete('/notifications', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Validate request body
  const parseResult = NotificationIdsSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { notificationIds } = parseResult.data;

  // Validate IDs if array
  let validIds: string[] | 'all';
  if (notificationIds === 'all') {
    validIds = 'all';
  } else {
    validIds = notificationIds.filter((id) => {
      const sanitized = sanitizeString(id, 'general');
      return sanitized.value && isValidObjectId(sanitized.value);
    });

    if (validIds.length === 0 && notificationIds.length > 0) {
      return errors.badRequest('Invalid notification IDs.');
    }
  }

  const result = await deleteNotifications(identity._id, validIds);

  return success({
    deletedCount: result.deletedCount,
  });
});

/**
 * GET /notifications/count - Get unread notification count
 *
 * Returns the count of unread notifications, optionally broken down by type.
 *
 * @route GET /api/notifications/count
 *
 * @returns 200 OK with unread count and breakdown by type
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/notifications/count', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const counts = await getNotificationCounts(identity._id);

  return success({
    unread: counts.unread,
    byType: counts.byType,
  });
});

export const notificationRoutes = router;
