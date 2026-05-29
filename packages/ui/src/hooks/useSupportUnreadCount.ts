import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { onSupportTicketUpdated, onSupportUnreadChanged } from '../services/supportTicketEvents';

const POLL_INTERVAL_MS = 60_000;

export function useSupportUnreadCount(enabled: boolean): number {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [unreadCount, setUnreadCount] = useState(0);
  const requestIdRef = useRef(0);

  const fetchCount = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const requestId = requestIdRef.current;
    try {
      const res = await api.supportTickets.getUnreadCount();
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (res.success && res.data) {
        setUnreadCount(res.data.unreadCount);
      }
    } catch {
      /* silent */
    }
  }, [api, enabled]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setUnreadCount(0);
      return undefined;
    }

    requestIdRef.current += 1;
    void fetchCount();

    const interval = setInterval(() => void fetchCount(), POLL_INTERVAL_MS);
    const unsubTicket = onSupportTicketUpdated(() => void fetchCount());
    const unsubUnread = onSupportUnreadChanged(() => void fetchCount());

    return () => {
      requestIdRef.current += 1;
      clearInterval(interval);
      unsubTicket();
      unsubUnread();
    };
  }, [enabled, fetchCount]);

  return unreadCount;
}
