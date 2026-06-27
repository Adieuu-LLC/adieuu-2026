/**
 * Pending account events — subscription upgrade notifications for account sessions.
 *
 * Events are stored on the user document and polled by the client. Identity
 * sessions never receive these events (privacy boundary).
 */

import { randomUUID } from 'crypto';
import type { ObjectId } from 'mongodb';
import type { SubscriptionTierId } from '@adieuu/shared';
import type {
  PendingAccountEvent,
  PendingAccountEventData,
  SubscriptionUpgradeSource,
} from '../models/user';
import { getUserRepository } from '../repositories/user.repository';

/** Events older than this are ignored on read and may be pruned. */
export const PENDING_ACCOUNT_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicPendingAccountEvent {
  id: string;
  type: PendingAccountEvent['type'];
  data: PendingAccountEventData;
  createdAt: string;
}

export interface SubscriptionUpgradedEventInput {
  tier: SubscriptionTierId;
  source: SubscriptionUpgradeSource;
  sponsorFirstName?: string;
  sponsorLastInitial?: string;
  isLifetime?: boolean;
}

function buildSubscriptionUpgradedEvent(
  input: SubscriptionUpgradedEventInput,
): PendingAccountEvent {
  const data: PendingAccountEventData = {
    tier: input.tier,
    source: input.source,
  };

  if (input.sponsorFirstName) {
    data.sponsorFirstName = input.sponsorFirstName;
  }
  if (input.sponsorLastInitial) {
    data.sponsorLastInitial = input.sponsorLastInitial;
  }
  if (input.isLifetime) {
    data.isLifetime = true;
  }

  return {
    id: randomUUID(),
    type: 'subscription_upgraded',
    data,
    createdAt: new Date(),
  };
}

export function toPublicPendingAccountEvent(
  event: PendingAccountEvent,
): PublicPendingAccountEvent {
  return {
    id: event.id,
    type: event.type,
    data: event.data,
    createdAt: event.createdAt.toISOString(),
  };
}

export function filterActivePendingEvents(
  events: PendingAccountEvent[],
  now = new Date(),
): PendingAccountEvent[] {
  const cutoff = now.getTime() - PENDING_ACCOUNT_EVENT_TTL_MS;
  return events.filter((event) => event.createdAt.getTime() >= cutoff);
}

export async function emitSubscriptionUpgradedEvent(
  userId: string | ObjectId,
  input: SubscriptionUpgradedEventInput,
): Promise<PublicPendingAccountEvent> {
  const event = buildSubscriptionUpgradedEvent(input);
  const userRepo = getUserRepository();
  await userRepo.addPendingAccountEvent(userId, event);
  return toPublicPendingAccountEvent(event);
}

export async function getActivePendingAccountEvents(
  userId: string | ObjectId,
): Promise<PublicPendingAccountEvent[]> {
  const userRepo = getUserRepository();
  const events = await userRepo.getPendingAccountEvents(userId);
  return filterActivePendingEvents(events).map(toPublicPendingAccountEvent);
}

export async function dismissPendingAccountEvent(
  userId: string | ObjectId,
  eventId: string,
): Promise<boolean> {
  const userRepo = getUserRepository();
  return userRepo.dismissPendingAccountEvent(userId, eventId);
}
