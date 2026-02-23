/**
 * Notifications routes module.
 *
 * Provides endpoints for notification management.
 * All endpoints require an authenticated identity session.
 *
 * @module routes/notifications
 */

import { Router } from '../../router';
import {
  getNotificationsCtrl,
  markNotificationsAsReadCtrl,
  markNotificationsAsUnreadCtrl,
  deleteNotificationsCtrl,
  getNotificationCountsCtrl,
} from './controller';

const router = new Router();

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
  return await getNotificationsCtrl(ctx);
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
  return await markNotificationsAsReadCtrl(ctx);
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
  return await markNotificationsAsUnreadCtrl(ctx);
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
  return await deleteNotificationsCtrl(ctx);
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
  return await getNotificationCountsCtrl(ctx);
});

export const notificationRoutes = router;
