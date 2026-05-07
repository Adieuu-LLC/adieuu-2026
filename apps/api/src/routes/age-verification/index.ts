/**
 * Age verification routes (account session only).
 *
 * @module routes/age-verification
 */

import { Router } from '../../router';
import { success, error as errorResponse } from '../../utils/response';
import { requireAccountSession } from '../../services/session.service';
import {
  postStartAgeVerification,
  getAgeVerificationStatus,
  getAgeVerificationCallback,
  getAgeVerificationCurrent,
  postOptInAgeVerification,
  postAgeVerificationWebhook,
} from './controller';

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

  const result = await postStartAgeVerification(session.userId);

  switch (result.kind) {
    case 'disabled':
      return errorResponse(
        'AGE_VERIFICATION_DISABLED',
        'Age verification is not currently enabled.',
        503,
      );
    case 'unauthorized':
      return ctx.errors.unauthorized();
    case 'billing_denial':
      return errorResponse(
        result.code,
        result.code === 'SUBSCRIPTION_REQUIRED'
          ? 'An active subscription is required to start age verification.'
          : 'Your subscription has expired. Please renew to start age verification.',
        403,
      );
    case 'internal_error':
      return errorResponse(
        'VERIFICATION_START_FAILED',
        'Failed to start age verification. Please try again later.',
        500,
      );
    case 'success':
      return success(result.result, result.message);
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
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
  const providerVerificationIdRaw = url.searchParams.get('id');

  const result = await getAgeVerificationStatus(session.userId, providerVerificationIdRaw);

  switch (result.kind) {
    case 'missing_or_invalid_id':
      return errorResponse('MISSING_VERIFICATION_ID', 'Verification ID is required.', 400);
    case 'unauthorized':
      return ctx.errors.unauthorized();
    case 'internal_error':
      return errorResponse('STATUS_CHECK_FAILED', 'Failed to retrieve verification status.', 500);
    case 'success':
      return success(result.status);
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
});

/**
 * GET /age-verification/current
 *
 * Returns the latest age verification attempt for the current user,
 * including metadata only needed on the Account Overview page
 * (timestamps, redirect URL, jurisdiction, opt-in flag).
 */
router.get('/age-verification/current', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const result = await getAgeVerificationCurrent(session.userId);

  switch (result.kind) {
    case 'unauthorized':
      return ctx.errors.unauthorized();
    case 'none':
      return success(null);
    case 'success':
      return success(result.data);
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
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
  const verificationIdRaw = url.searchParams.get('verification_id');

  const result = await getAgeVerificationCallback(verificationIdRaw);
  return new Response(result.html, {
    status: result.httpStatus,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
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

  const result = await postOptInAgeVerification(session.userId, ctx.body);

  switch (result.kind) {
    case 'disabled':
      return errorResponse(
        'AGE_VERIFICATION_DISABLED',
        'Age verification is not currently enabled.',
        503,
      );
    case 'unauthorized':
      return ctx.errors.unauthorized();
    case 'invalid_country':
      return errorResponse(
        'INVALID_COUNTRY',
        'A valid 2-letter ISO country code is required.',
        400,
      );
    case 'internal_error':
      return errorResponse(
        'VERIFICATION_START_FAILED',
        'Failed to start age verification. Please try again later.',
        500,
      );
    case 'success':
      return success(result.result, result.message);
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
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
  const authHeader = ctx.request.headers.get('authorization') ?? '';
  const result = await postAgeVerificationWebhook(ctx.rawBody, ctx.body, authHeader);

  switch (result.kind) {
    case 'disabled':
      return new Response(JSON.stringify({ error: 'Not enabled' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    case 'missing_body':
      return new Response(JSON.stringify({ error: 'Missing body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    case 'invalid_signature':
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    case 'missing_verification_id':
      return new Response(JSON.stringify({ error: 'Missing verification_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    case 'ok_received':
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
});

export const ageVerificationRoutes = router;
