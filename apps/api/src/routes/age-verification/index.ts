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
import { config } from '../../config';
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

  const jurisdiction = user.geo?.jurisdiction;
  if (!jurisdiction) {
    return errorResponse(
      'JURISDICTION_UNRESOLVED',
      'Unable to determine your jurisdiction. Use opt-in if you wish to verify voluntarily.',
      400,
    );
  }

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

function callbackHtml(status: string, errorMessage?: string): string {
  const data = JSON.stringify({ type: 'age-verification-callback', status, error: errorMessage });
  return `<!DOCTYPE html>
<html><head><title>Verification Complete</title></head>
<body>
<p>Verification ${status === 'approved' ? 'complete' : 'processing'}. You may close this window.</p>
<script>
try {
  if (window.opener) {
    window.opener.postMessage(${data}, '*');
  }
} catch(e) {}
setTimeout(function() { window.close(); }, 2000);
</script>
</body></html>`;
}

export const ageVerificationRoutes = router;
