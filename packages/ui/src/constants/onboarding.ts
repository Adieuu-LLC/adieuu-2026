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

/** localStorage key for first message sent (account onboarding). */
export const FIRST_MESSAGE_SENT_STORAGE_KEY = 'adieuu:firstMessageSent';

/** Event dispatched when the user sends their first message. */
export const FIRST_MESSAGE_SENT_EVENT = 'adieuu:firstMessageSent';

export function readFirstMessageSentFromStorage(): boolean {
  try {
    return localStorage.getItem(FIRST_MESSAGE_SENT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markFirstMessageSent(): void {
  try {
    localStorage.setItem(FIRST_MESSAGE_SENT_STORAGE_KEY, 'true');
  } catch {
    // localStorage may be unavailable
  }
  window.dispatchEvent(new Event(FIRST_MESSAGE_SENT_EVENT));
}
