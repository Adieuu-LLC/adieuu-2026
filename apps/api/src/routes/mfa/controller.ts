/**
 * MFA (Multi-Factor Authentication) controller module.
 *
 * Contains the business logic for MFA endpoints including TOTP setup,
 * WebAuthn registration, and backup code management.
 *
 * @module routes/mfa/controller
 */

import { success } from '../../utils/response';
import { RouteContext } from '../../router';
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
import { z } from '@adieuu/shared/schemas';

/**
 * Helper to require authenticated session.
 * Returns user info or null if not authenticated.
 */
async function requireAuth(request: Request): Promise<{ userId: string; identifier: string } | null> {
  const session = await getSessionFromRequest(request);
  if (!session || !session.userId) {
    return null;
  }
  return { userId: session.userId, identifier: session.identifier };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const TotpSetupSchema = z.object({
  name: z.string().min(1).max(100).default('Authenticator'),
});

const TotpVerifySchema = z.object({
  credentialId: z.string().min(1),
  code: z.string().length(6),
});

const WebAuthnRegisterStartSchema = z.object({
  name: z.string().min(1).max(100).default('Passkey'),
});

const WebAuthnRegisterFinishSchema = z.object({
  response: z.any(),
  name: z.string().min(1).max(100).default('Passkey'),
});

const WebAuthnRenameSchema = z.object({
  name: z.string().min(1).max(100),
});

// ============================================================================
// MFA Status Controllers
// ============================================================================

export async function getMfaStatusCtrl(ctx: RouteContext): Promise<Response> {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const status = await getMfaStatus(auth.userId);
  return success(status);
}

export async function getMfaCredentialsCtrl(ctx: RouteContext): Promise<Response> {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const { totp, webauthn } = await getMfaCredentials(auth.userId);

  return success({
    totp: totp.map(toPublicTotp),
    webauthn: webauthn.map(toPublicWebAuthn),
  });
}

// ============================================================================
// TOTP Controllers
// ============================================================================

export async function totpSetupCtrl(ctx: RouteContext): Promise<Response> {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const parsed = TotpSetupSchema.safeParse(ctx.body);
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
}

export async function totpVerifyCtrl(ctx: RouteContext): Promise<Response> {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const parsed = TotpVerifySchema.safeParse(ctx.body);
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
}

export async function totpDeleteCtrl(ctx: RouteContext): Promise<Response> {
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
}

// ============================================================================
// WebAuthn Controllers
// ============================================================================

export async function webauthnRegisterStartCtrl(ctx: RouteContext): Promise<Response> {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const parsed = WebAuthnRegisterStartSchema.safeParse(ctx.body);
  const rawName = parsed.success ? parsed.data.name : 'Passkey';
  const sanitizedName = sanitizeString(rawName, 'general');
  const name = sanitizedName.value || 'Passkey';

  const { options } = await generateWebAuthnRegistrationOptions(
    auth.userId,
    auth.identifier
  );

  return success({
    options,
    credentialName: name,
  });
}

export async function webauthnRegisterFinishCtrl(ctx: RouteContext): Promise<Response> {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const parsed = WebAuthnRegisterFinishSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return ctx.errors.badRequest();
  }

  const { response } = parsed.data;

  // Validate that response is present and is an object
  if (!response || typeof response !== 'object') {
    return ctx.errors.badRequest();
  }

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
}

export async function webauthnRenameCtrl(ctx: RouteContext): Promise<Response> {
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

  const parsed = WebAuthnRenameSchema.safeParse(ctx.body);
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
}

export async function webauthnDeleteCtrl(ctx: RouteContext): Promise<Response> {
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
}

// ============================================================================
// Backup Codes Controllers
// ============================================================================

export async function backupCodesRegenerateCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function backupCodesCountCtrl(ctx: RouteContext): Promise<Response> {
  const auth = await requireAuth(ctx.request);
  if (!auth) {
    return ctx.errors.unauthorized();
  }

  const count = await getBackupCodesCount(auth.userId);
  return success({ remaining: count });
}
