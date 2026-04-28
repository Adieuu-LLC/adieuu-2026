/**
 * Two-layer identity session middleware.
 *
 * **Layer 1 — `enrichIdentitySession`** (non-enforcing):
 * Runs on every request. Parses the session cookie, resolves the identity
 * session + identity document + encrypted subscription grants, and attaches
 * an {@link IdentityContext} to `ctx.identitySession`. Handles moderation
 * (banned/suspended) universally with structured 403 responses. Sets
 * `ctx.identitySession` to `null` for non-identity sessions or when the
 * cookie is absent.
 *
 * **Layer 2 — `requireIdentitySession`** (enforcing):
 * Applied per-route (most identity routes). Asserts `ctx.identitySession`
 * is present and returns 401 if not. Routes that use identity sessions
 * optionally (e.g. search, profile view) omit this guard.
 *
 * @module middleware/identity-session
 */

import {
  getSessionIdFromRequest,
  getSessionFromRequest,
  getGrantKeyFromRequest,
  destroySession,
  type IdentitySessionData,
} from '../services/session.service';
import {
  loadIdentityFromIdentitySession,
  type IdentityModerationBlock,
} from '../services/identity.service';
import {
  activeLabelsFromEvaluatedGrants,
  evaluateSubscriptionGrants,
  hasActiveSubscriptionGrant,
  type EvaluatedGrants,
} from '../services/billing/subscription-grants';
import { resolveIdentityOverrides } from '../services/billing/resolve-access';
import type { IdentityDocument } from '../models/identity';
import type { SubscriptionTierId } from '@adieuu/shared';
import { error } from '../utils/response';
import elog from '../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Resolved identity session data attached to the request context.
 *
 * Populated by {@link enrichIdentitySession} when a valid identity session
 * is present. Route handlers read this instead of calling
 * `getIdentityFromSession` directly.
 */
export interface IdentityContext {
  identity: IdentityDocument;
  sessionId: string;
  grants?: EvaluatedGrants;
  maxVideoDurationSeconds: number;
  subscriptions: SubscriptionTierId[];
  entitlements: string[];
  isLifetime: boolean;
}

// ---------------------------------------------------------------------------
// Enforcement exemptions
// ---------------------------------------------------------------------------

/**
 * Paths where grant enforcement and moderation checks are skipped.
 * Logout must work for moderated and expired-subscription users alike.
 */
const ENFORCEMENT_EXEMPT_PATHS: readonly string[] = [
  '/api/identity/logout',
];

function isEnforcementExempt(pathname: string): boolean {
  return ENFORCEMENT_EXEMPT_PATHS.some((p) => pathname === p);
}

// ---------------------------------------------------------------------------
// Layer 1: Enrichment (non-enforcing)
// ---------------------------------------------------------------------------

/**
 * Non-enforcing identity session enrichment middleware.
 *
 * Resolves the identity session, evaluates encrypted subscription grants,
 * and handles moderation blocks. Attaches the result to
 * `ctx.identitySession` for downstream consumption.
 *
 * Does NOT return 401 for missing sessions -- that is the responsibility
 * of {@link requireIdentitySession}. This allows optional-identity routes
 * (search, profile view) to work without an identity session.
 *
 * Enforcement (grant checks + moderation) is skipped for paths listed in
 * {@link ENFORCEMENT_EXEMPT_PATHS} (e.g. logout).
 */
export function enrichIdentitySession() {
  return async (
    ctx: { request: Request; url: URL; identitySession?: IdentityContext | null },
    next: () => Promise<Response>,
  ): Promise<Response> => {
    ctx.identitySession = null;

    const sessionId = getSessionIdFromRequest(ctx.request);
    if (!sessionId) return next();

    const session = await getSessionFromRequest(ctx.request);
    if (!session || session.type !== 'identity') {
      return next();
    }

    const identitySession = session as IdentitySessionData;
    const exempt = isEnforcementExempt(ctx.url.pathname);

    // -- Encrypted grant evaluation ------------------------------------------
    let grants: EvaluatedGrants | undefined;

    if (!exempt && identitySession.encryptedSubscriptionGrants) {
      const grantKey = getGrantKeyFromRequest(ctx.request);
      if (!grantKey) {
        elog.info('Identity session missing grant key in cookie; destroying', {
          identityIdPrefix: identitySession.identityId.substring(0, 8) + '...',
        });
        await destroySession(sessionId);
        return error('SUBSCRIPTION_EXPIRED', 'Your session has expired. Please sign in again.', 401);
      }

      grants = evaluateSubscriptionGrants(
        identitySession.encryptedSubscriptionGrants,
        grantKey,
      );

      if (!hasActiveSubscriptionGrant(grants)) {
        elog.info('Identity session destroyed: no active subscription grants', {
          identityIdPrefix: identitySession.identityId.substring(0, 8) + '...',
        });
        await destroySession(sessionId);
        return error('SUBSCRIPTION_EXPIRED', 'Your subscription has expired. Please renew to continue.', 401);
      }
    }

    // -- Identity resolution + moderation ------------------------------------
    const result = await loadIdentityFromIdentitySession(identitySession, {
      returnBlockDetails: true,
    });

    if (!result) {
      return next();
    }

    if ('blocked' in result) {
      if (!exempt) {
        const block = result.blocked as IdentityModerationBlock;
        const code = block.type === 'banned' ? 'IDENTITY_BANNED' : 'IDENTITY_SUSPENDED';
        const message = block.type === 'banned'
          ? 'This alias has been permanently banned.'
          : 'This alias is currently suspended.';

        return error(code, message, 403, {
          moderationReason: block.moderationReason,
          moderationReportId: block.moderationReportId,
          suspendedUntil: block.suspendedUntil,
        });
      }
      // Exempt path with moderated identity: no context, but allow through
      return next();
    }

    // -- Merge encrypted grants (decrypted with cookie key), optional legacy
    //    Mongo plaintext cache, and identity-document overrides ----------------
    let fromGrants = { subscriptions: [] as SubscriptionTierId[], entitlements: [] as string[] };
    if (grants) {
      fromGrants = activeLabelsFromEvaluatedGrants(grants);
    }

    const identityOverrides = resolveIdentityOverrides(result);
    ctx.identitySession = {
      identity: result,
      sessionId,
      grants,
      maxVideoDurationSeconds: identitySession.maxVideoDurationSeconds,
      subscriptions: [...new Set<SubscriptionTierId>([
        ...fromGrants.subscriptions,
        ...(identitySession.subscriptions ?? []),
        ...identityOverrides.subscriptions,
      ])],
      entitlements: [...new Set<string>([
        ...fromGrants.entitlements,
        ...(identitySession.entitlements ?? []),
        ...identityOverrides.entitlements,
      ])],
      isLifetime: identitySession.isLifetime,
    };

    return next();
  };
}

// ---------------------------------------------------------------------------
// Layer 2: Enforcement (thin guard)
// ---------------------------------------------------------------------------

/**
 * Thin enforcement guard that asserts an identity session is present.
 *
 * Returns 401 if `ctx.identitySession` was not populated by
 * {@link enrichIdentitySession}. Apply to routes that require identity
 * authentication. Omit for optional-identity routes.
 */
export function requireIdentitySession(
  ctx: { identitySession?: IdentityContext | null; errors: { unauthorized: () => Response } },
): Response | null {
  if (!ctx.identitySession) {
    return ctx.errors.unauthorized();
  }
  return null;
}
