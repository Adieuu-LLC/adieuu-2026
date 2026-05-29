/**
 * Pub/sub for support ticket realtime updates (WebSocket → open ticket detail).
 */

export interface SupportTicketUpdateEvent {
  ticketId: string;
}

type Listener = (event: SupportTicketUpdateEvent) => void;
type UnreadListener = () => void;

const listeners = new Set<Listener>();
const unreadListeners = new Set<UnreadListener>();
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

export function emitSupportUnreadChanged(): void {
  for (const fn of unreadListeners) {
    try {
      fn();
    } catch {
      /* swallow */
    }
  }
}

export function onSupportUnreadChanged(fn: UnreadListener): () => void {
  unreadListeners.add(fn);
  return () => {
    unreadListeners.delete(fn);
  };
}
