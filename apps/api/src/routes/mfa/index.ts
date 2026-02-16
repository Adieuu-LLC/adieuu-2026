/**
 * MFA (Multi-Factor Authentication) routes module.
 *
 * Handles TOTP (authenticator apps) and WebAuthn (passkeys) setup and management.
 * All endpoints require an authenticated session.
 *
 * @module routes/mfa
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { sanitizeString } from '../../utils/sanitize';
import { getSessionFromRequest } from '../../services/session.service';
import {
  generateTotpSetup,
  savePendingTotp,
  verifyAndActivateTotp,
  deleteTotp,
  getMfaStatus,
  getMfaCredentials,
  generateBackupCodes,
  getBackupCodesCount,
  generateWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  deleteWebAuthnCredential,
  renameWebAuthnCredential,
} from '../../services/mfa.service';
import { toPublicTotp, toPublicWebAuthn } from '../../models/mfa';
import { z } from '@chadder/shared/schemas';

const router = new Router();

// ============================================================================
// Middleware: Require authenticated session
// ============================================================================

async function requireAuth(request: Request): Promise<{ userId: string; identifier: string } | null> {
  const session = await getSessionFromRequest(request);
  if (!session || !session.userId) {
    return null;
  }
  return { userId: session.userId, identifier: session.identifier };
}

// ============================================================================
// MFA Status
// ============================================================================

/**
 * GET /mfa/status - Get MFA status for current user
 */
router.get('/mfa/status', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const status = await getMfaStatus(auth.userId);
  return success(status);
});

/**
 * GET /mfa/credentials - Get all MFA credentials for current user
 */
router.get('/mfa/credentials', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const { totp, webauthn } = await getMfaCredentials(auth.userId);

  return success({
    totp: totp.map(toPublicTotp),
    webauthn: webauthn.map(toPublicWebAuthn),
  });
});

// ============================================================================
// TOTP Endpoints
// ============================================================================

const TotpSetupSchema = z.object({
  name: z.string().min(1).max(100).default('Authenticator'),
});

/**
 * POST /mfa/totp/setup - Start TOTP setup
 *
 * Returns a secret and QR code URL for the user to scan with their authenticator app.
 * The credential is created but not verified until the user confirms with a code.
 */
router.post('/mfa/totp/setup', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const body = await ctx.request.json().catch(() => ({}));
  const parsed = TotpSetupSchema.safeParse(body);
  const rawName = parsed.success ? parsed.data.name : 'Authenticator';
  const sanitizedName = sanitizeString(rawName, 'general');
  const name = sanitizedName.value || 'Authenticator';

  // Generate TOTP setup
  const setup = generateTotpSetup(auth.identifier);

  // Save pending credential
  const credential = await savePendingTotp(auth.userId, setup.secret, name);

  return success({
    credentialId: credential._id.toHexString(),
    secret: setup.secret,
    qrCodeUrl: setup.qrCodeUrl,
    manualEntryKey: setup.manualEntryKey,
  });
});

const TotpVerifySchema = z.object({
  credentialId: z.string().min(1),
  code: z.string().length(6),
});

/**
 * POST /mfa/totp/verify - Verify and activate a TOTP credential
 *
 * Verifies the setup code from the authenticator app and activates the credential.
 */
router.post('/mfa/totp/verify', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const body = await ctx.request.json().catch(() => ({}));
  const parsed = TotpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return ctx.errors.badRequest();
  }

  const sanitizedCredentialId = sanitizeString(parsed.data.credentialId, 'id');
  const sanitizedCode = sanitizeString(parsed.data.code, 'authcode');
  
  if (!sanitizedCredentialId.value || !sanitizedCode.value) {
    return ctx.errors.badRequest();
  }

  const result = await verifyAndActivateTotp(sanitizedCredentialId.value, sanitizedCode.value, auth.userId);

  if (!result.success) {
    if (result.error === 'invalid_code') {
      return ctx.errors.verificationFailed();
    }
    if (result.error === 'already_verified') {
      return ctx.errors.badRequest();
    }
    return ctx.errors.notFound();
  }

  // Generate backup codes if this is the first MFA method
  const status = await getMfaStatus(auth.userId);
  let backupCodes: string[] | undefined;
  if (status.totpCount === 1 && !status.webauthnEnabled && !status.backupCodesExist) {
    backupCodes = await generateBackupCodes(auth.userId);
  }

  return success({ verified: true, backupCodes });
});

/**
 * DELETE /mfa/totp/:credentialId - Delete a TOTP credential
 */
router.delete('/mfa/totp/:credentialId', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const rawCredentialId = ctx.params.credentialId;
  if (!rawCredentialId) {
    return ctx.errors.badRequest();
  }

  const sanitizedCredentialId = sanitizeString(rawCredentialId, 'id');
  if (!sanitizedCredentialId.value) {
    return ctx.errors.badRequest();
  }

  const result = await deleteTotp(sanitizedCredentialId.value, auth.userId);

  if (!result.success) {
    if (result.error === 'unauthorized') {
      return ctx.errors.forbidden();
    }
    return ctx.errors.notFound();
  }

  return success(undefined, 'Authenticator removed');
});

// ============================================================================
// WebAuthn Endpoints
// ============================================================================

const WebAuthnRegisterStartSchema = z.object({
  name: z.string().min(1).max(100).default('Passkey'),
});

/**
 * POST /mfa/webauthn/register/start - Start WebAuthn registration
 *
 * Returns registration options for the browser's WebAuthn API.
 */
router.post('/mfa/webauthn/register/start', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const body = await ctx.request.json().catch(() => ({}));
  const parsed = WebAuthnRegisterStartSchema.safeParse(body);
  const rawName = parsed.success ? parsed.data.name : 'Passkey';
  const sanitizedName = sanitizeString(rawName, 'general');
  const name = sanitizedName.value || 'Passkey';

  // Store the name in a temp location (we'll retrieve it on finish)
  // For simplicity, we'll pass it back to the client and have them send it again
  const { options } = await generateWebAuthnRegistrationOptions(
    auth.userId,
    auth.identifier
  );

  return success({
    options,
    credentialName: name,
  });
});

const WebAuthnRegisterFinishSchema = z.object({
  response: z.any(), // WebAuthn response is complex, validate in service
  name: z.string().min(1).max(100).default('Passkey'),
});

/**
 * POST /mfa/webauthn/register/finish - Complete WebAuthn registration
 *
 * Verifies the registration response and saves the credential.
 */
router.post('/mfa/webauthn/register/finish', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const body = await ctx.request.json().catch(() => ({}));
  const parsed = WebAuthnRegisterFinishSchema.safeParse(body);
  if (!parsed.success) {
    return ctx.errors.badRequest();
  }

  const { response } = parsed.data;
  const sanitizedName = sanitizeString(parsed.data.name, 'general');
  const name = sanitizedName.value || 'Passkey';
  
  const result = await verifyWebAuthnRegistration(auth.userId, response, name);

  if (!result.success) {
    if (result.error === 'challenge_expired') {
      return ctx.errors.badRequest();
    }
    return ctx.errors.badRequest();
  }

  // Generate backup codes if this is the first MFA method
  const status = await getMfaStatus(auth.userId);
  let backupCodes: string[] | undefined;
  if (status.webauthnCount === 1 && !status.totpEnabled && !status.backupCodesExist) {
    backupCodes = await generateBackupCodes(auth.userId);
  }

  return success({
    credential: toPublicWebAuthn(result.credential!),
    backupCodes,
  });
});

const WebAuthnRenameSchema = z.object({
  name: z.string().min(1).max(100),
});

/**
 * PATCH /mfa/webauthn/:credentialId - Rename a WebAuthn credential
 */
router.patch('/mfa/webauthn/:credentialId', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const rawCredentialId = ctx.params.credentialId;
  if (!rawCredentialId) {
    return ctx.errors.badRequest();
  }

  const sanitizedCredentialId = sanitizeString(rawCredentialId, 'id');
  if (!sanitizedCredentialId.value) {
    return ctx.errors.badRequest();
  }

  const body = await ctx.request.json().catch(() => ({}));
  const parsed = WebAuthnRenameSchema.safeParse(body);
  if (!parsed.success) {
    return ctx.errors.badRequest();
  }

  const sanitizedName = sanitizeString(parsed.data.name, 'general');
  if (!sanitizedName.value) {
    return ctx.errors.badRequest();
  }

  const result = await renameWebAuthnCredential(sanitizedCredentialId.value, auth.userId, sanitizedName.value);

  if (!result.success) {
    if (result.error === 'unauthorized') {
      return ctx.errors.forbidden();
    }
    return ctx.errors.notFound();
  }

  return success(undefined, 'Passkey renamed');
});

/**
 * DELETE /mfa/webauthn/:credentialId - Delete a WebAuthn credential
 */
router.delete('/mfa/webauthn/:credentialId', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const rawCredentialId = ctx.params.credentialId;
  if (!rawCredentialId) {
    return ctx.errors.badRequest();
  }

  const sanitizedCredentialId = sanitizeString(rawCredentialId, 'id');
  if (!sanitizedCredentialId.value) {
    return ctx.errors.badRequest();
  }

  const result = await deleteWebAuthnCredential(sanitizedCredentialId.value, auth.userId);

  if (!result.success) {
    if (result.error === 'unauthorized') {
      return ctx.errors.forbidden();
    }
    return ctx.errors.notFound();
  }

  return success(undefined, 'Passkey removed');
});

// ============================================================================
// Backup Codes Endpoints
// ============================================================================

/**
 * POST /mfa/backup-codes/regenerate - Regenerate backup codes
 *
 * Generates new backup codes, invalidating any existing ones.
 */
router.post('/mfa/backup-codes/regenerate', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  // Check that user has MFA enabled
  const status = await getMfaStatus(auth.userId);
  if (!status.enabled) {
    return ctx.errors.badRequest();
  }

  const codes = await generateBackupCodes(auth.userId);

  return success({
    codes,
    message: 'Save these codes in a safe place. Each code can only be used once.',
  });
});

/**
 * GET /mfa/backup-codes/count - Get remaining backup codes count
 */
router.get('/mfa/backup-codes/count', async (ctx) => {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const count = await getBackupCodesCount(auth.userId);
  return success({ remaining: count });
});

export default router;
