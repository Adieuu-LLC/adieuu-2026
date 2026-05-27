/**
 * Pub/sub for support ticket realtime updates (WebSocket → open ticket detail).
 */

export interface SupportTicketUpdateEvent {
  ticketId: string;
}

type Listener = (event: SupportTicketUpdateEvent) => void;

const listeners = new Set<Listener>();
let activeTicketId: string | null = null;

export function setActiveSupportTicketId(ticketId: string | null): void {
  activeTicketId = ticketId;
}

export function getActiveSupportTicketId(): string | null {
  return activeTicketId;
}

export function emitSupportTicketUpdated(event: SupportTicketUpdateEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      /* swallow */
    }
  }
}

export function onSupportTicketUpdated(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
