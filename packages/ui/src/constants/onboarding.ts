/**
 * Client-side key for tracking product tour completion (localStorage).
 * Not sent to the server.
 */
export const TOUR_COMPLETED_STORAGE_KEY = 'adieuu:tourCompleted';

/**
 * Dispatched on window when the tour is marked complete (same-tab updates).
 */
export const TOUR_COMPLETED_EVENT = 'adieuu:tourCompleted';

/** localStorage key for the appearance tour. */
export const APPEARANCE_TOUR_COMPLETED_STORAGE_KEY = 'adieuu:appearanceTourCompleted';

/** Event dispatched when the appearance tour completes. */
export const APPEARANCE_TOUR_COMPLETED_EVENT = 'adieuu:appearanceTourCompleted';

/** Base localStorage key for first message sent (account onboarding). */
const FIRST_MESSAGE_SENT_STORAGE_BASE = 'adieuu:firstMessageSent';

/** Event dispatched when the user sends their first message. */
export const FIRST_MESSAGE_SENT_EVENT = 'adieuu:firstMessageSent';

function firstMessageStorageKey(subjectId: string): string {
  return `${FIRST_MESSAGE_SENT_STORAGE_BASE}:${subjectId}`;
}

export function readFirstMessageSentFromStorage(subjectId?: string): boolean {
  try {
    if (subjectId) {
      return localStorage.getItem(firstMessageStorageKey(subjectId)) === 'true';
    }
    return false;
  } catch {
    return false;
  }
}

export function markFirstMessageSent(subjectId?: string): void {
  if (!subjectId) return;
  try {
    localStorage.setItem(firstMessageStorageKey(subjectId), 'true');
  } catch {
    // localStorage may be unavailable
  }
  window.dispatchEvent(
    new CustomEvent(FIRST_MESSAGE_SENT_EVENT, { detail: { subjectId } }),
  );
}
