/**
 * MFA (Multi-Factor Authentication) routes module.
 *
 * Handles TOTP (authenticator apps) and WebAuthn (passkeys) setup and management.
 * All endpoints require an authenticated session.
 *
 * @module routes/mfa
 */

import { Router } from '../../router';
import {
  getMfaStatusCtrl,
  getMfaCredentialsCtrl,
  totpSetupCtrl,
  totpVerifyCtrl,
  totpDeleteCtrl,
  webauthnRegisterStartCtrl,
  webauthnRegisterFinishCtrl,
  webauthnRenameCtrl,
  webauthnDeleteCtrl,
} from './controller';

const router = new Router();

// ============================================================================
// MFA Status
// ============================================================================

/**
 * GET /mfa/status - Get MFA status for current user
 */
router.get('/mfa/status', async (ctx) => {
  return await getMfaStatusCtrl(ctx);
});

/**
 * GET /mfa/credentials - Get all MFA credentials for current user
 */
router.get('/mfa/credentials', async (ctx) => {
  return await getMfaCredentialsCtrl(ctx);
});

// ============================================================================
// TOTP Endpoints
// ============================================================================

/**
 * POST /mfa/totp/setup - Start TOTP setup
 *
 * Returns a secret and QR code URL for the user to scan with their authenticator app.
 * The credential is created but not verified until the user confirms with a code.
 */
router.post('/mfa/totp/setup', async (ctx) => {
  return await totpSetupCtrl(ctx);
});

/**
 * POST /mfa/totp/verify - Verify and activate a TOTP credential
 *
 * Verifies the setup code from the authenticator app and activates the credential.
 */
router.post('/mfa/totp/verify', async (ctx) => {
  return await totpVerifyCtrl(ctx);
});

/**
 * DELETE /mfa/totp/:credentialId - Delete a TOTP credential
 */
router.delete('/mfa/totp/:credentialId', async (ctx) => {
  return await totpDeleteCtrl(ctx);
});

// ============================================================================
// WebAuthn Endpoints
// ============================================================================

/**
 * POST /mfa/webauthn/register/start - Start WebAuthn registration
 *
 * Returns registration options for the browser's WebAuthn API.
 */
router.post('/mfa/webauthn/register/start', async (ctx) => {
  return await webauthnRegisterStartCtrl(ctx);
});

/**
 * POST /mfa/webauthn/register/finish - Complete WebAuthn registration
 *
 * Verifies the registration response and saves the credential.
 */
router.post('/mfa/webauthn/register/finish', async (ctx) => {
  return await webauthnRegisterFinishCtrl(ctx);
});

/**
 * PATCH /mfa/webauthn/:credentialId - Rename a WebAuthn credential
 */
router.patch('/mfa/webauthn/:credentialId', async (ctx) => {
  return await webauthnRenameCtrl(ctx);
});

/**
 * DELETE /mfa/webauthn/:credentialId - Delete a WebAuthn credential
 */
router.delete('/mfa/webauthn/:credentialId', async (ctx) => {
  return await webauthnDeleteCtrl(ctx);
});

export default router;
