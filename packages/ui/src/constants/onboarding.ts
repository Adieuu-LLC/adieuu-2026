/**
 * Client-side key for tracking product tour completion (localStorage).
 * Not sent to the server.
 */
export const TOUR_COMPLETED_STORAGE_KEY = 'adieuu:tourCompleted';

/**
 * Dispatched on window when the tour is marked complete (same-tab updates).
 */
export const TOUR_COMPLETED_EVENT = 'adieuu:tourCompleted';
