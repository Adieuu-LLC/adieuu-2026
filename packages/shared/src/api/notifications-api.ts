import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

/**
 * Notification type identifier.
 * Concrete values will be defined as features are implemented.
 */
export type NotificationType = string;

/**
 * Notification data (varies by type).
 * Concrete fields will be added as notification types are defined.
 */
export interface NotificationData {
  [key: string]: unknown;
}

/**
 * Notification
 */
export interface Notification {
  id: string;
  type: NotificationType;
  data: NotificationData;
  read: boolean;
  createdAt: string;
}

/**
 * Notification counts
 */
export interface NotificationCounts {
  unread: number;
  byType: Record<string, number>;
}

export class NotificationsApi {
  constructor(private client: HttpClient) {}

  /**
   * Get notifications.
   */
  async getNotifications(options?: {
    limit?: number;
    since?: string;
    unreadOnly?: boolean;
    types?: NotificationType[];
  }): Promise<ApiResponse<{ notifications: Notification[]; unreadCount: number }>> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.since) params.set('since', options.since);
    if (options?.unreadOnly) params.set('unreadOnly', 'true');
    if (options?.types) params.set('types', options.types.join(','));
    const query = params.toString();
    return this.client.get(`/api/notifications${query ? `?${query}` : ''}`);
  }

  /**
   * Mark notifications as read.
   */
  async markAsRead(notificationIds: string[] | 'all'): Promise<ApiResponse<{ markedCount: number }>> {
    return this.client.post('/api/notifications/read', { notificationIds });
  }

  /**
   * Mark notifications as unread.
   */
  async markAsUnread(notificationIds: string[] | 'all'): Promise<ApiResponse<{ markedCount: number }>> {
    return this.client.post('/api/notifications/unread', { notificationIds });
  }

  /**
   * Delete notifications.
   */
  async deleteNotifications(notificationIds: string[] | 'all'): Promise<ApiResponse<{ deletedCount: number }>> {
    return this.client.delete('/api/notifications');
  }

  /**
   * Get unread notification counts.
   */
  async getCounts(): Promise<ApiResponse<NotificationCounts>> {
    return this.client.get('/api/notifications/count');
  }
}
