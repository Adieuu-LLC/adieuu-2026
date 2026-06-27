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
import {
  getNotificationsResult,
  markNotificationsAsReadResult,
  markNotificationsAsUnreadResult,
  deleteNotificationsResult,
  getNotificationCountsResult,
  type NotificationResult,
} from './controller';

const router = new Router();

function mapNotificationFailure(
  ctx: { errors: { validationFailed: () => Response } },
  result: Extract<NotificationResult, { ok: false }>,
): Response {
  if (result.kind === 'validation_failed') return ctx.errors.validationFailed();
  return errors.badRequest(result.message ?? 'Invalid notification IDs.');
}

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
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const result = await getNotificationsResult(ctx.identitySession.identity._id, ctx.query);
  if (!result.ok) return ctx.errors.internal();
  return success(result.data);
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const result = await markNotificationsAsReadResult(ctx.identitySession.identity._id, ctx.body);
  if (!result.ok) return mapNotificationFailure(ctx, result);

  return success({ markedCount: result.data.markedCount });
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const result = await markNotificationsAsUnreadResult(ctx.identitySession.identity._id, ctx.body);
  if (!result.ok) return mapNotificationFailure(ctx, result);

  return success({ markedCount: result.data.markedCount });
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const result = await deleteNotificationsResult(ctx.identitySession.identity._id, ctx.body);
  if (!result.ok) return mapNotificationFailure(ctx, result);

  return success({ deletedCount: result.data.deletedCount });
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const result = await getNotificationCountsResult(ctx.identitySession.identity._id);
  if (!result.ok) return ctx.errors.internal();
  return success(result.data);
});

export const notificationRoutes = router;
