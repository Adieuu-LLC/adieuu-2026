/**
 * Pure-logic utilities for bulk emoji upload concurrency control and retry.
 * Extracted from CreateEmojiDialog for testability.
 */

export interface QueueItem {
  id: string;
  uploadStarted: boolean;
  uploadDone: boolean;
  uploadFailed: boolean;
  retryCount: number;
}

/**
 * Given the current item list, returns a new list with up to `maxConcurrent`
 * items marked as `uploadStarted: true` (those not yet started, done, or failed).
 */
export function scheduleUploads<T extends QueueItem>(
  items: T[],
  maxConcurrent: number,
): T[] {
  const currentActive = items.filter(
    (i) => i.uploadStarted && !i.uploadDone && !i.uploadFailed,
  ).length;
  const slotsAvailable = maxConcurrent - currentActive;
  if (slotsAvailable <= 0) return items;

  const toStart = items.filter(
    (i) => !i.uploadStarted && !i.uploadDone && !i.uploadFailed,
  );
  if (toStart.length === 0) return items;

  const startIds = new Set(toStart.slice(0, slotsAvailable).map((i) => i.id));
  return items.map((i) =>
    startIds.has(i.id) ? { ...i, uploadStarted: true } : i,
  );
}

/**
 * Marks an item as ready for retry: resets its upload state and increments retryCount.
 * Returns the unchanged list if the item has exceeded maxRetries.
 */
export function retryItem<T extends QueueItem>(
  items: T[],
  id: string,
  maxRetries: number,
): T[] {
  return items.map((i) => {
    if (i.id !== id) return i;
    if (i.retryCount >= maxRetries) return i;
    return {
      ...i,
      uploadFailed: false,
      uploadDone: false,
      retryCount: i.retryCount + 1,
      uploadStarted: false,
    };
  });
}

/**
 * Returns true when all items in the list have completed (either saved or failed
 * with no remaining retries).
 */
export function allUploadsSettled(items: QueueItem[]): boolean {
  return items.length > 0 && items.every((i) => i.uploadDone || i.uploadFailed);
}
