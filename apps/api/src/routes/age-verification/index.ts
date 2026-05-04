/**
 * Age verification routes (account session only).
 *
 * @module routes/age-verification
 */

import { Router } from '../../router';
import { success, error as errorResponse } from '../../utils/response';
import { requireAccountSession } from '../../services/session.service';
import { getUserRepository } from '../../repositories/user.repository';
import {
  startVerification,
  checkVerificationStatus,
} from '../../services/age-verification/age-verification.service';
import { isAgeVerificationEnabled } from '../../services/age-verification/av-settings';
import { resolveEffectiveAccess } from '../../services/billing/resolve-access';
import { evaluateBillingAccess } from '../../middleware/require-subscription';
import { createHmac } from 'crypto';
import { config } from '../../config';
import { constantTimeCompare } from '../../utils/crypto';
import elog from '../../utils/adieuuLogger';

const router = new Router();

/**
 * POST /age-verification/start
 *
 * Initiates a new age verification session. Attempts a background
 * check first if PII is available and jurisdiction-compatible.
 */
router.post('/age-verification/start', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const enabled = await isAgeVerificationEnabled();
  if (!enabled) {
    return errorResponse('AGE_VERIFICATION_DISABLED', 'Age verification is not currently enabled.', 503);
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.unauthorized();

  const resolved = resolveEffectiveAccess(user);
  const billingDenial = evaluateBillingAccess(resolved, user.billing);
  if (billingDenial) {
    return errorResponse(
      billingDenial,
      billingDenial === 'SUBSCRIPTION_REQUIRED'
        ? 'An active subscription is required to start age verification.'
        : 'Your subscription has expired. Please renew to start age verification.',
      403,
    );
  }

  const jurisdiction = user.geo?.jurisdiction
    ?? user.geo?.countryCode?.toUpperCase()
    ?? 'US';

  const callbackBaseUrl = config.apiBaseUrl;

  try {
    const result = await startVerification(user, {
      jurisdiction,
      callbackBaseUrl,
    });

    return success(result, 'Verification started.');
  } catch (err) {
    elog.error('Failed to start age verification', { error: err, userId: session.userId });
    return errorResponse('VERIFICATION_START_FAILED', 'Failed to start age verification. Please try again later.', 500);
  }
});

/**
 * GET /age-verification/status?id=<providerVerificationId>
 *
 * Polls the provider for current verification status and returns
 * the result including the age_gate per-method attempt breakdown.
 */
router.get('/age-verification/status', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const url = new URL(ctx.request.url, 'http://localhost');
  const providerVerificationId = url.searchParams.get('id');
  if (!providerVerificationId) {
    return errorResponse('MISSING_VERIFICATION_ID', 'Verification ID is required.', 400);
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.unauthorized();

  try {
    const status = await checkVerificationStatus(user, providerVerificationId);
    return success(status);
  } catch (err) {
    elog.warn('Failed to check verification status', {
      error: err,
      providerVerificationId,
      userId: session.userId,
    });
    return errorResponse('STATUS_CHECK_FAILED', 'Failed to retrieve verification status.', 500);
  }
});

/**
 * GET /age-verification/callback?verification_id=<id>
 *
 * Redirect target after VerifyMy hosted flow. Checks the final
 * status via the provider, updates local records, and returns a
 * self-closing HTML page that signals the parent UI.
 */
router.get('/age-verification/callback', async (ctx) => {
  const url = new URL(ctx.request.url, 'http://localhost');
  const verificationId = url.searchParams.get('verification_id');

  if (!verificationId) {
    return new Response(callbackHtml('error', 'Missing verification ID.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // The callback may not have an active session cookie (opened in a new tab),
  // so we look up the verification doc directly by provider ID.
  const { getAgeVerificationRepository } = await import(
    '../../repositories/age-verification.repository'
  );
  const avRepo = getAgeVerificationRepository();
  const doc = await avRepo.findByProviderVerificationId(verificationId);

  if (!doc) {
    return new Response(callbackHtml('error', 'Verification not found.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(doc.userId);
  if (!user) {
    return new Response(callbackHtml('error', 'User not found.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    const status = await checkVerificationStatus(user, verificationId);
    return new Response(callbackHtml(status.status, undefined), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response(callbackHtml('error', 'Status check failed.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});

/**
 * POST /age-verification/opt-in
 *
 * For users with unresolved jurisdictions who wish to verify voluntarily.
 * Accepts { country: "US" } in the body to specify their country.
 */
router.post('/age-verification/opt-in', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const enabled = await isAgeVerificationEnabled();
  if (!enabled) {
    return errorResponse('AGE_VERIFICATION_DISABLED', 'Age verification is not currently enabled.', 503);
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.unauthorized();

  const body = ctx.body as { country?: string } | undefined;
  const country = body?.country?.trim().toUpperCase();
  if (!country || country.length !== 2) {
    return errorResponse('INVALID_COUNTRY', 'A valid 2-letter ISO country code is required.', 400);
  }

  const callbackBaseUrl = config.apiBaseUrl;

  try {
    const result = await startVerification(user, {
      jurisdiction: country,
      callbackBaseUrl,
      optedIn: true,
      countryOverride: country.toLowerCase(),
    });

    return success(result, 'Opt-in verification started.');
  } catch (err) {
    elog.error('Failed to start opt-in verification', { error: err, userId: session.userId });
    return errorResponse('VERIFICATION_START_FAILED', 'Failed to start age verification. Please try again later.', 500);
  }
});

/**
 * POST /age-verification/webhook
 *
 * Receives webhook notifications from VerifyMy when a verification
 * status changes. Public endpoint -- verifies the request via HMAC
 * signature in the Authorization header.
 */
router.post('/age-verification/webhook', async (ctx) => {
  const enabled = await isAgeVerificationEnabled();
  if (!enabled) {
    return new Response(JSON.stringify({ error: 'Not enabled' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!ctx.rawBody) {
    return new Response(JSON.stringify({ error: 'Missing body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = ctx.request.headers.get('authorization') ?? '';
  if (!verifyWebhookSignature(ctx.rawBody, authHeader)) {
    elog.warn('VerifyMy webhook signature verification failed');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = ctx.body as { verification_id?: string; status?: string } | undefined;
  const verificationId = body?.verification_id;

  if (!verificationId) {
    return new Response(JSON.stringify({ error: 'Missing verification_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { getAgeVerificationRepository } = await import(
    '../../repositories/age-verification.repository'
  );
  const avRepo = getAgeVerificationRepository();
  const doc = await avRepo.findByProviderVerificationId(verificationId);

  if (!doc) {
    elog.warn('VerifyMy webhook for unknown verification', { verificationId });
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(doc.userId);
  if (!user) {
    elog.warn('VerifyMy webhook for unknown user', { verificationId, userId: doc.userId.toString() });
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await checkVerificationStatus(user, verificationId);
    elog.info('VerifyMy webhook processed', { verificationId, userId: user._id.toString() });
  } catch (err) {
    elog.error('VerifyMy webhook processing error', { verificationId, error: err });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

/**
 * Verify webhook HMAC signature. VerifyMy sends the same Authorization
 * header format as outbound requests: `hmac {apiKey}:{hmac-sha256(body, apiSecret)}`
 */
function verifyWebhookSignature(rawBody: string, authHeader: string): boolean {
  const match = authHeader.match(/^hmac\s+([^:]+):(.+)$/);
  if (!match?.[1] || !match[2]) return false;

  const headerApiKey = match[1];
  const headerHmac = match[2];

  if (headerApiKey !== config.verifymy.apiKey) return false;

  const expectedHmac = createHmac('sha256', config.verifymy.apiSecret)
    .update(rawBody)
    .digest('hex');

  return constantTimeCompare(expectedHmac, headerHmac);
}

function callbackHtml(status: string, errorMessage?: string): string {
  const data = JSON.stringify({ type: 'age-verification-callback', status, error: errorMessage });
  const targetOrigin = JSON.stringify(config.webAppUrl);
  return `<!DOCTYPE html>
<html><head><title>Verification Complete</title></head>
<body>
<p>Verification ${status === 'approved' ? 'complete' : 'processing'}. You may close this window.</p>
<script>
try {
  if (window.opener) {
    window.opener.postMessage(${data}, ${targetOrigin});
  }
} catch(e) {}
setTimeout(function() { window.close(); }, 2000);
</script>
</body></html>`;
}

export const ageVerificationRoutes = router;
