/**
 * Notification bell component with dropdown for the sidebar.
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BellIcon, CheckIcon, XIcon } from './Icons';
import { Button } from './Button';
import { Avatar } from './Avatar';
import { useNotifications, useUnreadNotificationCount } from '../hooks/useNotifications';
import { useIdentity } from '../hooks/useIdentity';
import type { Notification } from '@adieuu/shared';

function formatTimeAgo(dateStr: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('notifications.time.justNow');
  if (diffMins < 60) return t('notifications.time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('notifications.time.hoursAgo', { count: diffHours });
  return t('notifications.time.daysAgo', { count: diffDays });
}

function getNotificationMessage(notification: Notification, t: (key: string, options?: Record<string, unknown>) => string): string {
  const name = notification.data.fromDisplayName || notification.data.friendDisplayName || 'Someone';
  
  switch (notification.type) {
    case 'friend_request_received':
      return t('notifications.types.friend_request_received', { name });
    case 'friend_request_accepted':
      return t('notifications.types.friend_request_accepted', { name });
    case 'friendship_established':
      return t('notifications.types.friendship_established', { name });
    case 'message_received':
      return t('notifications.types.message_received', { name });
    case 'mention':
      return t('notifications.types.mention', { name });
    default:
      return 'New notification';
  }
}

function getNotificationAvatar(notification: Notification): { name: string; src?: string } {
  return {
    name: notification.data.fromDisplayName || notification.data.friendDisplayName || '?',
    src: notification.data.fromAvatarUrl || notification.data.friendAvatarUrl,
  };
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}

function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const { t } = useTranslation();
  const avatar = getNotificationAvatar(notification);

  return (
    <div className={`notification-item ${notification.read ? 'notification-item-read' : ''}`}>
      <Avatar name={avatar.name} src={avatar.src} size="sm" />
      <div className="notification-content">
        <p className="notification-message">
          {getNotificationMessage(notification, t)}
        </p>
        <span className="notification-time">
          {formatTimeAgo(notification.createdAt, t)}
        </span>
      </div>
      {!notification.read && (
        <button
          type="button"
          className="notification-mark-read"
          onClick={() => onMarkRead(notification.id)}
          title="Mark as read"
        >
          <CheckIcon />
        </button>
      )}
    </div>
  );
}

export function NotificationBell() {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { unreadCount } = useUnreadNotificationCount();
  const {
    notifications,
    isLoading,
    markAsRead,
    refresh,
  } = useNotifications({ immediate: false });

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isLoggedIn = identityStatus === 'logged_in';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      refresh();
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, refresh]);

  const handleMarkRead = async (id: string) => {
    await markAsRead([id]);
  };

  const handleMarkAllRead = async () => {
    await markAsRead('all');
  };

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="notification-bell-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('notifications.title')}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <h3>{t('notifications.title')}</h3>
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                className="notification-mark-all"
                onClick={handleMarkAllRead}
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="notification-dropdown-content">
            {isLoading && notifications.length === 0 ? (
              <div className="notification-loading">
                <span className="spinner spinner-sm" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">
                <p>{t('notifications.noNotifications')}</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                />
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notification-dropdown-footer">
              <Link
                to="/account/notifications"
                className="notification-view-all"
                onClick={() => setIsOpen(false)}
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
