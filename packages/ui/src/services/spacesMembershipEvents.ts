/**
 * Lightweight in-session pub-sub for Space-membership changes.
 *
 * The Spaces sidebar loads membership once via `client.spaces.listMine()`, so a
 * Space created or joined elsewhere in the app wouldn't appear until a reload.
 * Until the provider-backed Spaces store lands (Space-view phase), this notifies
 * interested views (the sidebar) to refetch when membership changes.
 */

import type { PublicSpaceMember } from '@adieuu/shared';

type Listener = () => void;
type MemberUpdatedListener = (spaceId: string, member: PublicSpaceMember) => void;

const listeners = new Set<Listener>();
const memberUpdatedListeners = new Set<MemberUpdatedListener>();

/** Notifies subscribers that the current Alias's Space membership changed. */
export function emitSpacesChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A failing subscriber must not prevent the others from being notified.
    }
  }
}

/** Subscribes to membership changes; returns an unsubscribe function. */
export function onSpacesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notifies subscribers that a Space member's profile (nickname/colour) changed. */
export function emitSpaceMemberUpdated(spaceId: string, member: PublicSpaceMember): void {
  for (const listener of [...memberUpdatedListeners]) {
    try {
      listener(spaceId, member);
    } catch {
      // A failing subscriber must not prevent the others from being notified.
    }
  }
}

/** Subscribes to Space member profile updates; returns an unsubscribe function. */
export function onSpaceMemberUpdated(listener: MemberUpdatedListener): () => void {
  memberUpdatedListeners.add(listener);
  return () => {
    memberUpdatedListeners.delete(listener);
  };
}
