/**
 * Captcha session state management.
 *
 * Tracks whether a free-tier user has recently completed a captcha challenge.
 * Uses Redis with a 15-minute TTL -- after that window expires, the user will
 * be challenged again the next time they hit a gated action.
 */

import { getRedis, isRedisConnected } from '../db';
import elog from '../utils/adieuuLogger';

const CAPTCHA_VERIFIED_PREFIX = 'captcha:verified:';
const CAPTCHA_VERIFIED_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * Records that the user successfully completed a captcha challenge.
 * The flag expires after 15 minutes.
 */
export async function markCaptchaVerified(sessionId: string): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    const redis = getRedis();
    await redis.set(
      `${CAPTCHA_VERIFIED_PREFIX}${sessionId}`,
      Date.now().toString(),
      'EX',
      CAPTCHA_VERIFIED_TTL_SECONDS,
    );
  } catch (err) {
    elog.warn('Failed to mark captcha verified in Redis', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Returns true if the user has verified within the last 15 minutes.
 */
export async function isCaptchaVerifiedRecently(sessionId: string): Promise<boolean> {
  if (!isRedisConnected()) return true;
  try {
    const redis = getRedis();
    const value = await redis.get(`${CAPTCHA_VERIFIED_PREFIX}${sessionId}`);
    return value !== null;
  } catch (err) {
    elog.warn('Failed to check captcha verified state in Redis; allowing (fail-open)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

// Legacy aliases kept for the captcha-verify route migration
export const markCaptchaCleared = markCaptchaVerified;
export const isCaptchaCleared = isCaptchaVerifiedRecently;
