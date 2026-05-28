import { describe, expect, test } from 'bun:test';
import {
  emitSupportTicketUpdated,
  emitSupportUnreadChanged,
  onSupportTicketUpdated,
  onSupportUnreadChanged,
} from './supportTicketEvents';

describe('supportTicketEvents', () => {
  test('notifies ticket update listeners', () => {
    const seen: string[] = [];
    const unsubscribe = onSupportTicketUpdated((event) => {
      seen.push(event.ticketId);
    });

    emitSupportTicketUpdated({ ticketId: 'T-123' });
    expect(seen).toEqual(['T-123']);
    unsubscribe();
  });

  test('notifies unread count listeners', () => {
    let refreshCount = 0;
    const unsubscribe = onSupportUnreadChanged(() => {
      refreshCount += 1;
    });

    emitSupportUnreadChanged();
    emitSupportUnreadChanged();
    expect(refreshCount).toBe(2);
    unsubscribe();
  });
});
