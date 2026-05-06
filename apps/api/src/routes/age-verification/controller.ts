/**
 * Age verification HTTP behaviour — sanitization, orchestration, webhook verification.
 *
 * @module routes/age-verification/controller
 */

import { createHmac } from 'crypto';
import type { ProviderVerificationStatus } from '../../services/age-verification/provider';
import {
  startVerification,
  checkVerificationStatus,
  type StartResult,
  type StatusResult,
} from '../../services/age-verification/age-verification.service';
import { isAgeVerificationEnabled } from '../../services/age-verification/av-settings';
import { resolveEffectiveAccess } from '../../services/billing/resolve-access';
import { evaluateBillingAccess } from '../../middleware/require-subscription';
import { config } from '../../config';
import { constantTimeCompare } from '../../utils/crypto';
import { sanitizeString } from '../../utils/sanitize';
import { getUserRepository } from '../../repositories/user.repository';
import { getAgeVerificationRepository } from '../../repositories/age-verification.repository';
import elog from '../../utils/adieuuLogger';
import { z } from '@adieuu/shared/schemas';

/** Abuse guard; VerifyMy IDs are opaque slug-like strings. */
export const PROVIDER_VERIFICATION_ID_MAX_LENGTH = 128;

const CALLBACK_STATUS_WHITELIST = new Set<string>([
  'started',
  'pending',
  'approved',
  'failed',
  'expired',
  'error',
]);

const CALLBACK_ERROR_MESSAGE_MAX = 512;

const OptInBodySchema = z.object({
  country: z.string().min(1).max(16),
});

export type StartRouteResult =
  | { kind: 'success'; result: StartResult; message: string }
  | { kind: 'unauthorized' }
  | { kind: 'disabled' }
  | { kind: 'billing_denial'; code: string }
  | { kind: 'internal_error' };

export type StatusRouteResult =
  | { kind: 'success'; status: StatusResult }
  | { kind: 'unauthorized' }
  | { kind: 'missing_or_invalid_id' }
  | { kind: 'internal_error'; providerVerificationId: string };

export type CallbackRouteResult = { kind: 'html'; httpStatus: number; html: string };

export type OptInRouteResult =
  | { kind: 'success'; result: StartResult; message: string }
  | { kind: 'unauthorized' }
  | { kind: 'disabled' }
  | { kind: 'invalid_country' }
  | { kind: 'internal_error' };

export type WebhookRouteResult =
  | { kind: 'disabled' }
  | { kind: 'missing_body' }
  | { kind: 'invalid_signature' }
  | { kind: 'missing_verification_id' }
  | { kind: 'ok_received' };

/**
 * Sanitize provider verification id from query or JSON (VerifyMy slug-style ids).
 */
export function parseSanitizedProviderVerificationId(raw: string | null): string | null {
  if (raw == null || raw === '') return null;
  const { value } = sanitizeString(raw, 'idenhanced');
  if (!value || value.length > PROVIDER_VERIFICATION_ID_MAX_LENGTH) return null;
  return value;
}

export function parseOptInCountryCode(body: unknown): string | null {
  const parsed = OptInBodySchema.safeParse(body);
  if (!parsed.success) return null;
  const { value } = sanitizeString(parsed.data.country, 'alphanumdash');
  const upper = value.toUpperCase();
  if (upper.length !== 2 || !/^[A-Z]{2}$/.test(upper)) return null;
  return upper;
}

export function sanitizeCallbackPageStatus(raw: string): ProviderVerificationStatus | 'error' {
  const { value } = sanitizeString(raw, 'idenhanced');
  if (CALLBACK_STATUS_WHITELIST.has(value)) {
    return value as ProviderVerificationStatus | 'error';
  }
  return 'error';
}

export function sanitizeCallbackErrorMessage(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  const { value } = sanitizeString(raw, 'general');
  const clipped = value.slice(0, CALLBACK_ERROR_MESSAGE_MAX).trim();
  return clipped === '' ? undefined : clipped;
}

/**
 * Verify webhook HMAC: `hmac {apiKey}:{hex-sha256(body, apiSecret)}`
 */
export function verifyWebhookSignature(rawBody: string, authHeader: string): boolean {
  const match = authHeader.match(/^hmac\s+([^:]+):(.+)$/);
  if (!match?.[1] || !match[2]) return false;

  const headerApiKey = sanitizeString(match[1].trim(), 'idenhanced').value;
  const headerHmac = sanitizeString(match[2].trim(), 'hash').value.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(headerHmac)) return false;

  const expectedKey = sanitizeString(config.verifymy.apiKey, 'idenhanced').value;
  if (headerApiKey !== expectedKey) return false;

  const expectedHmac = createHmac('sha256', config.verifymy.apiSecret).update(rawBody).digest('hex');

  return constantTimeCompare(expectedHmac, headerHmac);
}

export function callbackHtml(statusRaw: string, errorMessage?: string): string {
  const safeStatus = sanitizeCallbackPageStatus(statusRaw);
  const safeError = sanitizeCallbackErrorMessage(errorMessage);
  const data = JSON.stringify({
    type: 'age-verification-callback',
    status: safeStatus,
    error: safeError,
  });
  const targetOrigin = JSON.stringify(config.webAppUrl);
  return `<!DOCTYPE html>
<html><head><title>Verification Complete</title></head>
<body>
<p>Verification ${safeStatus === 'approved' ? 'complete' : 'processing'}. You may close this window.</p>
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

export async function postStartAgeVerification(userIdHex: string): Promise<StartRouteResult> {
  const enabled = await isAgeVerificationEnabled();
  if (!enabled) return { kind: 'disabled' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userIdHex);
  if (!user) return { kind: 'unauthorized' };

  const resolved = resolveEffectiveAccess(user);
  const billingDenial = evaluateBillingAccess(resolved, user.billing);
  if (billingDenial) {
    return { kind: 'billing_denial', code: billingDenial };
  }

  const jurisdiction =
    user.geo?.jurisdiction ?? user.geo?.countryCode?.toUpperCase() ?? 'US';

  try {
    const result = await startVerification(user, {
      jurisdiction,
      callbackBaseUrl: config.apiBaseUrl,
    });
    return { kind: 'success', result, message: 'Verification started.' };
  } catch (err) {
    elog.error('Failed to start age verification', { error: err, userId: userIdHex });
    return { kind: 'internal_error' };
  }
}

export async function getAgeVerificationStatus(
  userIdHex: string,
  providerVerificationIdRaw: string | null,
): Promise<StatusRouteResult> {
  const providerVerificationId = parseSanitizedProviderVerificationId(providerVerificationIdRaw);
  if (!providerVerificationId) {
    return { kind: 'missing_or_invalid_id' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userIdHex);
  if (!user) return { kind: 'unauthorized' };

  try {
    const status = await checkVerificationStatus(user, providerVerificationId);
    return { kind: 'success', status };
  } catch (err) {
    elog.warn('Failed to check verification status', {
      error: err,
      providerVerificationId,
      userId: userIdHex,
    });
    return { kind: 'internal_error', providerVerificationId };
  }
}

export async function getAgeVerificationCallback(
  verificationIdRaw: string | null,
): Promise<CallbackRouteResult> {
  const verificationId = parseSanitizedProviderVerificationId(verificationIdRaw);
  if (!verificationId) {
    return {
      kind: 'html',
      httpStatus: 400,
      html: callbackHtml('error', 'Missing verification ID.'),
    };
  }

  const avRepo = getAgeVerificationRepository();
  const doc = await avRepo.findByProviderVerificationId(verificationId);

  if (!doc) {
    return {
      kind: 'html',
      httpStatus: 404,
      html: callbackHtml('error', 'Verification not found.'),
    };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(doc.userId);
  if (!user) {
    return {
      kind: 'html',
      httpStatus: 404,
      html: callbackHtml('error', 'User not found.'),
    };
  }

  try {
    const status = await checkVerificationStatus(user, verificationId);
    return {
      kind: 'html',
      httpStatus: 200,
      html: callbackHtml(status.status, undefined),
    };
  } catch {
    return {
      kind: 'html',
      httpStatus: 500,
      html: callbackHtml('error', 'Status check failed.'),
    };
  }
}

export async function postOptInAgeVerification(userIdHex: string, body: unknown): Promise<OptInRouteResult> {
  const enabled = await isAgeVerificationEnabled();
  if (!enabled) return { kind: 'disabled' };

  const country = parseOptInCountryCode(body);
  if (!country) return { kind: 'invalid_country' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userIdHex);
  if (!user) return { kind: 'unauthorized' };

  try {
    const result = await startVerification(user, {
      jurisdiction: country,
      callbackBaseUrl: config.apiBaseUrl,
      optedIn: true,
      countryOverride: country.toLowerCase(),
    });
    return { kind: 'success', result, message: 'Opt-in verification started.' };
  } catch (err) {
    elog.error('Failed to start opt-in verification', { error: err, userId: userIdHex });
    return { kind: 'internal_error' };
  }
}

export async function postAgeVerificationWebhook(
  rawBody: string | undefined,
  parsedBody: unknown,
  authHeader: string,
): Promise<WebhookRouteResult> {
  const enabled = await isAgeVerificationEnabled();
  if (!enabled) return { kind: 'disabled' };

  if (!rawBody) return { kind: 'missing_body' };

  if (!verifyWebhookSignature(rawBody, authHeader)) {
    elog.warn('VerifyMy webhook signature verification failed');
    return { kind: 'invalid_signature' };
  }

  const verificationId = extractWebhookVerificationId(parsedBody);
  if (!verificationId) return { kind: 'missing_verification_id' };

  const avRepo = getAgeVerificationRepository();
  const doc = await avRepo.findByProviderVerificationId(verificationId);

  if (!doc) {
    elog.warn('VerifyMy webhook for unknown verification', { verificationId });
    return { kind: 'ok_received' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(doc.userId);
  if (!user) {
    elog.warn('VerifyMy webhook for unknown user', { verificationId, userId: doc.userId.toString() });
    return { kind: 'ok_received' };
  }

  try {
    await checkVerificationStatus(user, verificationId);
    elog.info('VerifyMy webhook processed', { verificationId, userId: user._id.toString() });
  } catch (err) {
    elog.error('VerifyMy webhook processing error', { verificationId, error: err });
  }

  return { kind: 'ok_received' };
}

function extractWebhookVerificationId(parsedBody: unknown): string | null {
  if (!parsedBody || typeof parsedBody !== 'object') return null;
  const raw = (parsedBody as { verification_id?: unknown }).verification_id;
  if (typeof raw !== 'string') return null;
  return parseSanitizedProviderVerificationId(raw);
}
