import { useEffect, useMemo } from 'react';
import type { DecryptedConversation } from '../../hooks/useConversations';
import { useTheme } from '../../hooks/useTheme';
import { usePlatformCapabilities } from '../../config';

/**
 * Computes conversation + Spaces unread totals and syncs the desktop app badge.
 */
export function useConversationSidebarBadge(
  conversations: DecryptedConversation[],
  unreadBySpace: Record<string, number>,
): { totalUnread: number; totalSpacesUnread: number } {
  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.hasUnread ? 1 : 0) + c.unreadCount,
    0,
  );

  const totalSpacesUnread = useMemo(
    () => Object.values(unreadBySpace).reduce((sum, n) => sum + n, 0),
    [unreadBySpace],
  );

  const { appWindow } = usePlatformCapabilities();
  const { activeTheme } = useTheme();
  const accentHex = activeTheme?.colors.accentPrimary;
  const secondaryHex = activeTheme?.colors.accentSecondary;

  useEffect(() => {
    appWindow?.setBadgeCount(totalUnread + totalSpacesUnread, accentHex, secondaryHex);
  }, [totalUnread, totalSpacesUnread, appWindow, accentHex, secondaryHex]);

  return { totalUnread, totalSpacesUnread };
}
