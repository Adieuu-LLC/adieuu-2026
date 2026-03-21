/**
 * Pure helpers for message composer text limits and emoji insertion.
 * Kept separate from the React component for unit testing.
 */

export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Insert `insert` at [start, end) in `text`. Returns null if the result would exceed `maxLen`.
 */
export function insertStringWithMaxLength(
  text: string,
  insert: string,
  start: number,
  end: number,
  maxLen: number
): string | null {
  const newText = text.slice(0, start) + insert + text.slice(end);
  if (newText.length > maxLen) return null;
  return newText;
}

/**
 * Append `suffix` to `text`. Returns null if the result would exceed `maxLen`.
 */
export function appendWithMaxLength(text: string, suffix: string, maxLen: number): string | null {
  const newText = text + suffix;
  if (newText.length > maxLen) return null;
  return newText;
}
