import { useCallback, useEffect, useMemo, useState } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { onSupportTicketUpdated, onSupportUnreadChanged } from '../services/supportTicketEvents';

const POLL_INTERVAL_MS = 60_000;

export function useSupportUnreadCount(enabled: boolean): number {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }

    try {
      const res = await api.supportTickets.getUnreadCount();
      if (res.success && res.data) {
        setUnreadCount(res.data.unreadCount);
      }
    } catch {
      /* silent */
    }
  }, [api, enabled]);

  useEffect(() => {
    void fetchCount();
    if (!enabled) return undefined;

    const interval = setInterval(() => void fetchCount(), POLL_INTERVAL_MS);
    const unsubTicket = onSupportTicketUpdated(() => void fetchCount());
    const unsubUnread = onSupportUnreadChanged(() => void fetchCount());

    return () => {
      clearInterval(interval);
      unsubTicket();
      unsubUnread();
    };
  }, [enabled, fetchCount]);

  return unreadCount;
}
