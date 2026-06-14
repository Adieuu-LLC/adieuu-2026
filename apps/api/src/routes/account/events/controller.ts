/**
 * Account pending events controller.
 */

import {
  dismissPendingAccountEvent,
  getActivePendingAccountEvents,
} from '../../../services/pending-account-event.service';

export type GetPendingAccountEventsResult =
  | { ok: true; events: Awaited<ReturnType<typeof getActivePendingAccountEvents>> }
  | { ok: false; reason: 'user_not_found' };

export async function getPendingEventsForUser(
  userId: string,
): Promise<GetPendingAccountEventsResult> {
  const events = await getActivePendingAccountEvents(userId);
  return { ok: true, events };
}

export type DismissPendingAccountEventResult =
  | { ok: true; dismissed: boolean }
  | { ok: false; reason: 'validation' | 'user_not_found' };

export async function dismissPendingEventForUser(
  userId: string,
  eventId: unknown,
): Promise<DismissPendingAccountEventResult> {
  if (typeof eventId !== 'string' || !eventId.trim()) {
    return { ok: false, reason: 'validation' };
  }

  const dismissed = await dismissPendingAccountEvent(userId, eventId.trim());
  return { ok: true, dismissed };
}
