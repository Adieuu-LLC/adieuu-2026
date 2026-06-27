/**
 * Encrypted identity preferences (opaque blobs; server does not decrypt).
 *
 * @module routes/identity/preferences.controller
 */

import { z } from '@adieuu/shared/schemas';
import type { RouteContext } from '../../router';
import { success } from '../../utils/response';
import { sanitizeString } from '../../utils/sanitize';
import { getIdentityPreferencesRepository } from '../../repositories/identity-preferences.repository';

const EncryptedPrefsBodySchema = z.object({
  prefsId: z.string().min(1).max(200),
  encryptedData: z.string().min(1).max(10_000),
  nonce: z.string().min(1).max(100),
  schemeVersion: z.number().int().min(1).default(1),
});

function sanitizePrefsId(raw: string): string | null {
  const s = sanitizeString(raw, 'idenhanced');
  if (!s.value || s.value.length === 0) return null;
  return s.value;
}

/**
 * GET /identity/me/preferences
 */
export async function getIdentityPreferencesCtrl(
  ctx: RouteContext,
): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const url = new URL(ctx.request.url, 'http://localhost');
  const rawPrefsId = url.searchParams.get('prefsId');
  if (!rawPrefsId) {
    return ctx.errors.badRequest();
  }

  const prefsId = sanitizePrefsId(rawPrefsId);
  if (!prefsId || prefsId.length > 200) {
    return ctx.errors.badRequest();
  }

  const repo = getIdentityPreferencesRepository();
  const doc = await repo.findByPrefsId(prefsId);

  if (!doc) {
    return success(null);
  }

  return success({
    prefsId: doc.prefsId,
    encryptedData: doc.encryptedData,
    nonce: doc.nonce,
    schemeVersion: doc.schemeVersion,
  });
}

/**
 * PUT /identity/me/preferences
 */
export async function putIdentityPreferencesCtrl(
  ctx: RouteContext,
): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const parseResult = EncryptedPrefsBodySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const sanitizedId = sanitizePrefsId(parseResult.data.prefsId);
  if (!sanitizedId || sanitizedId.length > 200) {
    return ctx.errors.validationFailed();
  }

  const repo = getIdentityPreferencesRepository();
  await repo.upsert(sanitizedId, {
    ...parseResult.data,
    prefsId: sanitizedId,
  });

  return success(undefined, 'Identity preferences stored.');
}
