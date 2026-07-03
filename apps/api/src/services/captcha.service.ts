/**
 * FriendlyCaptcha verification service.
 *
 * Verifies captcha responses server-side using the @friendlycaptcha/server-sdk.
 * Uses the global endpoint (global.frcapi.com) by default.
 *
 * Operates in non-strict (fail-open) mode by default: if the FriendlyCaptcha
 * service is unreachable or misconfigured, requests are allowed through with
 * a warning logged. This prevents service outages from locking out users.
 *
 * Only applied to free-tier users -- paid subscribers skip captcha entirely.
 */

import { FriendlyCaptchaClient } from '@friendlycaptcha/server-sdk';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

export interface CaptchaVerificationResult {
  valid: boolean;
  error?: string;
}

let client: FriendlyCaptchaClient | null = null;

function getClient(): FriendlyCaptchaClient | null {
  if (client) return client;
  if (!config.friendlyCaptcha.apiKey) return null;

  client = new FriendlyCaptchaClient({
    apiKey: config.friendlyCaptcha.apiKey,
    sitekey: config.friendlyCaptcha.sitekey,
    strict: false,
    apiEndpoint: 'global',
  });

  return client;
}

/**
 * Verifies a FriendlyCaptcha response token.
 *
 * Returns `{ valid: true }` when:
 * - The captcha feature is disabled
 * - The response token is valid
 * - The FriendlyCaptcha service is unreachable (fail-open)
 * - The API key is not configured (graceful degradation in dev)
 *
 * Returns `{ valid: false, error }` when:
 * - The response is missing/empty
 * - The response is invalid, expired, or already used
 */
export async function verifyCaptcha(response: string | undefined): Promise<CaptchaVerificationResult> {
  if (!config.friendlyCaptcha.enabled) {
    return { valid: true };
  }

  if (!response?.trim()) {
    return { valid: false, error: 'response_missing' };
  }

  const frcClient = getClient();
  if (!frcClient) {
    elog.warn('FriendlyCaptcha API key not configured; allowing request');
    return { valid: true };
  }

  try {
    const result = await frcClient.verifyCaptchaResponse(response);

    if (!result.wasAbleToVerify()) {
      elog.warn('FriendlyCaptcha service unreachable; allowing request (fail-open)', {
        response: response.slice(0, 20) + '...',
      });
      return { valid: true };
    }

    if (result.shouldAccept()) {
      return { valid: true };
    }

    return { valid: false, error: 'response_invalid' };
  } catch (err) {
    elog.error('FriendlyCaptcha verification threw unexpectedly; allowing request (fail-open)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { valid: true };
  }
}
