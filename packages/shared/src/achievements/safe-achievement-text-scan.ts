/**
 * Bounds for achievement pattern scanning.
 *
 * User-controlled text is only ever matched against static regexes (never
 * interpolated into RegExp). These limits add defense-in-depth against
 * ReDoS and runaway work on unexpectedly large inputs (especially E2E
 * message plaintext on the client).
 */

/** Keep in sync with UpdateProfileSchema bio max length. */
export const ACHIEVEMENT_BIO_SCAN_MAX_LENGTH = 160;

/** Keep in sync with profile displayName max length. */
export const ACHIEVEMENT_DISPLAY_NAME_SCAN_MAX_LENGTH = 50;

/** Client message plaintext scanned for achievement phrases. */
export const ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH = 8192;

/**
 * Returns a prefix safe to scan, or null when input exceeds the limit and
 * should be skipped entirely.
 */
export function textForAchievementScan(
  text: string,
  maxLength: number,
  mode: 'truncate' | 'skip' = 'truncate',
): string | null {
  if (text.length <= maxLength) return text;
  if (mode === 'skip') return null;
  return text.slice(0, maxLength);
}

/** Runs a static regex against bounded text. */
export function safePatternTest(
  pattern: RegExp,
  text: string,
  maxLength: number,
  mode: 'truncate' | 'skip' = 'truncate',
): boolean {
  const bounded = textForAchievementScan(text, maxLength, mode);
  if (bounded === null) return false;
  return pattern.test(bounded);
}
