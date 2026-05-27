import { useEffect } from 'react';
import {
  getActiveSupportTicketId,
  onSupportTicketUpdated,
  setActiveSupportTicketId,
} from '../services/supportTicketEvents';

/**
 * Marks the given public ticket id as actively viewed and refetches when a
 * matching support-ticket WebSocket notification arrives.
 */
export function useSupportTicketRealtimeRefresh(
  ticketId: string | undefined,
  refresh: () => void | Promise<void>,
): void {
  useEffect(() => {
    if (!ticketId) {
      return undefined;
    }

    setActiveSupportTicketId(ticketId);

    const unsubscribe = onSupportTicketUpdated((event) => {
      if (event.ticketId === ticketId) {
        void refresh();
      }
    });

    return () => {
      unsubscribe();
      if (getActiveSupportTicketId() === ticketId) {
        setActiveSupportTicketId(null);
      }
    };
  }, [ticketId, refresh]);
}
