/**
 * Captcha enforcement middleware for free-tier users.
 *
 * Verifies FriendlyCaptcha responses on protected actions. Paid subscribers
 * (access, insider, lifetime) bypass captcha entirely -- only free-tier users
 * are challenged, and only if they haven't verified within the last 15 minutes.
 *
 * Usage in route handlers:
 * ```typescript
 * const captchaError = await requireCaptchaForFreeTier(ctx);
 * if (captchaError) return captchaError;
 * ```
 *
 * For routes where `ctx.accountUser` is already populated by the subscription
 * middleware, pass it directly to avoid a duplicate user lookup:
 * ```typescript
 * const captchaError = await requireCaptchaForFreeTier(ctx, ctx.accountUser);
 * ```
 */

import type { RouteContext } from '../router/types';
import type { UserDocument } from '../models/user';
import { verifyCaptcha } from '../services/captcha.service';
import { isCaptchaVerifiedRecently, markCaptchaVerified } from '../services/captcha-session.service';
import { isFreeTierOnly } from '../services/billing/is-free-tier';
import { getSessionFromRequest, getSessionIdFromRequest, type AccountSessionData } from '../services/session.service';
import { getUserRepository } from '../repositories/user.repository';
import { error } from '../utils/response';
import { config } from '../config';

export interface CaptchaOptions {
  /**
   * When true, skip the 15-minute session cache and always require a fresh
   * captcha response. Use for high-abuse endpoints like friend requests and
   * content reports where per-action verification is needed.
   */
  skipSessionCache?: boolean;
}

/**
 * Enforces captcha verification for free-tier users on a protected action.
 *
 * Returns `null` if the request should proceed (paid user, captcha valid,
 * recently verified, or feature disabled). Returns a `Response` if the request
 * should be rejected (free-tier user with missing/invalid captcha and no
 * recent verification).
 *
 * @param ctx - The route context (reads `frc-captcha-response` from body)
 * @param preloadedUser - Optional pre-fetched user document to avoid extra DB lookup
 * @param options - Optional captcha behavior overrides
 */
export async function requireCaptchaForFreeTier(
  ctx: RouteContext,
  preloadedUser?: UserDocument | null,
  options?: CaptchaOptions,
): Promise<Response | null> {
  if (!config.friendlyCaptcha.enabled) {
    return null;
  }

  const user = preloadedUser ?? await resolveAccountUser(ctx);
  if (!user) {
    return null;
  }

  if (!isFreeTierOnly(user)) {
    return null;
  }

  const sessionId = getSessionIdFromRequest(ctx.request);
  if (!options?.skipSessionCache && sessionId && await isCaptchaVerifiedRecently(sessionId)) {
    return null;
  }

  const body = ctx.body as Record<string, unknown> | undefined;
  const captchaResponse = typeof body?.['frc-captcha-response'] === 'string'
    ? body['frc-captcha-response']
    : undefined;

  const result = await verifyCaptcha(captchaResponse);

  if (result.valid) {
    if (sessionId) {
      await markCaptchaVerified(sessionId);
    }
    return null;
  }

  return error(
    'CAPTCHA_REQUIRED',
    'Captcha verification is required for this action.',
    422,
    { captchaError: result.error },
  );
}

async function resolveAccountUser(ctx: RouteContext): Promise<UserDocument | null> {
  if (ctx.accountUser) return ctx.accountUser;

  const session = await getSessionFromRequest(ctx.request);
  if (!session || session.type !== 'account') return null;

  const accountSession = session as AccountSessionData;
  const userRepo = getUserRepository();
  return userRepo.findById(accountSession.userId);
}
