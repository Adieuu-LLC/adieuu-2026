/**
 * MFA Service
 * Handles TOTP and WebAuthn authentication setup and verification
 */

import { ObjectId } from 'mongodb';
import * as OTPAuth from 'otpauth';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type GenerateAuthenticationOptionsOpts,
  type VerifyRegistrationResponseOpts,
  type VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture, RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { config } from '../config';
import { encrypt, decrypt, generateSecureToken } from '../utils/crypto';
import {
  getTotpRepository,
  getWebAuthnRepository,
} from '../repositories';
import type {
  TotpCredentialDocument,
  WebAuthnCredentialDocument,
  MfaStatus,
  MfaChallengeData,
  AuthenticatorTransport,
} from '../models/mfa';
import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { reconcileMfaDiscount } from './billing/mfa-discount.service';
import elog from '../utils/adieuuLogger';

// ============================================================================
// Configuration
// ============================================================================

const APP_NAME = config.appName || 'Adieuu';
const TOTP_ISSUER = APP_NAME;
const TOTP_ALGORITHM = 'SHA1'; // Standard for Google Authenticator compatibility
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;

// WebAuthn configuration
const RP_NAME = APP_NAME;
const RP_ID = config.webauthn?.rpId || 'localhost';
// Support multiple origins for cross-platform (web, desktop, mobile)
const RP_ORIGINS: string[] = config.webauthn?.origins || ['http://localhost:5173'];

// Log WebAuthn configuration on module load
elog.info('WebAuthn configuration loaded', {
  rpId: RP_ID,
  rpOrigins: RP_ORIGINS,
  rpName: RP_NAME,
});

// MFA challenge TTL (5 minutes)
const MFA_CHALLENGE_TTL_SECONDS = 300;

// ============================================================================
// TOTP Service Functions
// ============================================================================

/**
 * Generate a new TOTP secret for setup
 * Returns the secret and QR code URL (not yet saved to database)
 */
export function generateTotpSetup(userIdentifier: string): {
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
} {
  // Generate a random secret
  const secret = new OTPAuth.Secret({ size: 20 });

  // Create TOTP instance
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: userIdentifier,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret,
  });

  // Generate QR code URL (otpauth:// URI)
  const qrCodeUrl = totp.toString();

  // Return base32 encoded secret for manual entry
  const manualEntryKey = secret.base32;

  return {
    secret: manualEntryKey,
    qrCodeUrl,
    manualEntryKey,
  };
}

/**
 * Save a TOTP credential (during setup, before verification)
 */
export async function savePendingTotp(
  userId: string | ObjectId,
  secret: string,
  name: string
): Promise<TotpCredentialDocument> {
  const repo = getTotpRepository();
  const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

  // Encrypt the secret before storing
  const encryptedSecret = encrypt(secret);

  return await repo.create({
    userId: objectId,
    encryptedSecret,
    name,
  });
}

/**
 * Verify a TOTP code during setup and activate the credential
 */
export async function verifyAndActivateTotp(
  totpId: string,
  code: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const repo = getTotpRepository();
  const credential = await repo.findById(totpId);

  if (!credential) {
    return { success: false, error: 'totp_not_found' };
  }

  // Verify ownership
  if (credential.userId.toHexString() !== userId) {
    return { success: false, error: 'unauthorized' };
  }

  // Already verified
  if (credential.verified) {
    return { success: false, error: 'already_verified' };
  }

  // Decrypt the secret
  const secret = decrypt(credential.encryptedSecret);
  if (!secret) {
    return { success: false, error: 'decryption_failed' };
  }

  // Verify the code
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // Allow 1 period of drift (30 seconds before/after)
  const delta = totp.validate({ token: code, window: 1 });

  if (delta === null) {
    return { success: false, error: 'invalid_code' };
  }

  // Activate the credential
  await repo.verify(totpId);

  elog.info('TOTP activated', { userId, totpId: totpId.substring(0, 8) });

  void reconcileMfaDiscount(userId);

  return { success: true };
}

/**
 * Verify a TOTP code during login
 */
export async function verifyTotpCode(
  userId: string,
  code: string
): Promise<{ success: boolean; credentialId?: string; error?: string }> {
  const repo = getTotpRepository();
  const credentials = await repo.findVerifiedByUserId(userId);

  if (credentials.length === 0) {
    return { success: false, error: 'no_totp_configured' };
  }

  // Try each credential until one matches
  for (const credential of credentials) {
    const secret = decrypt(credential.encryptedSecret);
    if (!secret) continue;

    const totp = new OTPAuth.TOTP({
      issuer: TOTP_ISSUER,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: code, window: 1 });

    if (delta !== null) {
      // Update last used
      await repo.updateLastUsed(credential._id);

      return { success: true, credentialId: credential._id.toHexString() };
    }
  }

  return { success: false, error: 'invalid_code' };
}

/**
 * Delete a TOTP credential
 */
export async function deleteTotp(
  totpId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const repo = getTotpRepository();
  const credential = await repo.findById(totpId);

  if (!credential) {
    return { success: false, error: 'not_found' };
  }

  if (credential.userId.toHexString() !== userId) {
    return { success: false, error: 'unauthorized' };
  }

  await repo.delete(totpId);

  elog.info('TOTP deleted', { userId, totpId: totpId.substring(0, 8) });

  void reconcileMfaDiscount(userId);

  return { success: true };
}

// ============================================================================
// WebAuthn Service Functions
// ============================================================================

/**
 * Generate WebAuthn registration options
 */
export async function generateWebAuthnRegistrationOptions(
  userId: string,
  userIdentifier: string,
  userName?: string
): Promise<{
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
  challenge: string;
}> {
  const repo = getWebAuthnRepository();
  const existingCredentials = await repo.findByUserId(userId);

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId),
    userName: userIdentifier,
    userDisplayName: userName || userIdentifier,
    attestationType: 'none', // Don't require attestation for privacy
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      // Don't specify authenticatorAttachment to allow both platform (Windows Hello, Touch ID)
      // and cross-platform (Yubikey, security keys) authenticators
    },
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports as AuthenticatorTransportFuture[],
    })),
  };

  const options = await generateRegistrationOptions(opts);

  // Store challenge temporarily
  await storeMfaChallenge(userId, 'registration', options.challenge);

  return { options, challenge: options.challenge };
}

/**
 * Verify WebAuthn registration response and save credential
 */
export async function verifyWebAuthnRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  credentialName: string
): Promise<{ success: boolean; credential?: WebAuthnCredentialDocument; error?: string }> {
  // Retrieve the challenge
  const storedChallenge = await getMfaChallenge(userId, 'registration');
  if (!storedChallenge) {
    return { success: false, error: 'challenge_expired' };
  }

  // Decode clientDataJSON to extract actual origin for debugging
  let actualOrigin: string | undefined;
  try {
    const clientDataBuffer = Buffer.from(response.response.clientDataJSON, 'base64url');
    const clientData = JSON.parse(clientDataBuffer.toString('utf-8'));
    actualOrigin = clientData.origin;
  } catch {
    // Ignore decode errors - this is just for debugging
  }

  elog.debug('WebAuthn registration attempt', {
    userId,
    expectedOrigins: RP_ORIGINS,
    actualOrigin,
    expectedRPID: RP_ID,
  });

  const opts: VerifyRegistrationResponseOpts = {
    response,
    expectedChallenge: storedChallenge,
    expectedOrigin: RP_ORIGINS,
    expectedRPID: RP_ID,
    requireUserVerification: false, // Allow both UV and non-UV
  };

  // Validate response structure
  if (!response?.response?.clientDataJSON || !response?.response?.attestationObject) {
    elog.warn('WebAuthn registration failed: invalid response structure', {
      userId,
      hasResponse: !!response,
      hasNestedResponse: !!response?.response,
      hasClientDataJSON: !!response?.response?.clientDataJSON,
      hasAttestationObject: !!response?.response?.attestationObject,
    });
    return { success: false, error: 'invalid_response' };
  }

  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse(opts);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    elog.warn('WebAuthn registration verification failed', {
      errorMessage,
      errorStack,
      userId,
      expectedOrigins: RP_ORIGINS,
      expectedRPID: RP_ID,
      actualOrigin,
    });
    return { success: false, error: 'verification_failed' };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { success: false, error: 'verification_failed' };
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Save the credential
  // Use response.id directly - it's already base64url-encoded from the browser
  // Using Buffer.from(credential.id) can cause double-encoding issues
  const repo = getWebAuthnRepository();
  const savedCredential = await repo.create({
    userId: new ObjectId(userId),
    credentialId: response.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: response.response.transports as AuthenticatorTransport[],
    name: credentialName,
    aaguid: verification.registrationInfo.aaguid,
  });

  // Clear the challenge
  await clearMfaChallenge(userId, 'registration');

  elog.info('WebAuthn credential registered', {
    userId,
    credentialId: savedCredential._id.toHexString().substring(0, 8),
    credentialIdB64: savedCredential.credentialId.substring(0, 20) + '...',
    deviceType: credentialDeviceType,
    transports: savedCredential.transports,
    aaguid: savedCredential.aaguid,
  });

  void reconcileMfaDiscount(userId);

  return { success: true, credential: savedCredential };
}

/**
 * Generate WebAuthn authentication options
 */
export async function generateWebAuthnAuthenticationOptions(
  userId: string
): Promise<{
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
  challenge: string;
} | null> {
  const repo = getWebAuthnRepository();
  const credentials = await repo.findByUserId(userId);

  if (credentials.length === 0) {
    return null;
  }

  const allowCredentials = credentials.map((cred) => ({
    id: cred.credentialId,
    transports: cred.transports as AuthenticatorTransportFuture[],
  }));

  elog.debug('WebAuthn authentication options', {
    userId,
    credentialCount: credentials.length,
    allowedCredentialIds: allowCredentials.map(c => c.id),
    credentialTransports: allowCredentials.map(c => c.transports),
  });

  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: RP_ID,
    userVerification: 'preferred',
    allowCredentials,
  };

  const options = await generateAuthenticationOptions(opts);

  elog.debug('WebAuthn authentication options generated', {
    userId,
    rpId: options.rpId,
    challenge: options.challenge?.substring(0, 20) + '...',
    allowCredentialsCount: options.allowCredentials?.length,
    allowCredentialIds: options.allowCredentials?.map(c => c.id?.substring(0, 20) + '...'),
    userVerification: options.userVerification,
  });

  // Store challenge temporarily
  await storeMfaChallenge(userId, 'authentication', options.challenge);

  return { options, challenge: options.challenge };
}

/**
 * Verify WebAuthn authentication response
 */
export async function verifyWebAuthnAuthentication(
  userId: string,
  response: AuthenticationResponseJSON
): Promise<{ success: boolean; credentialId?: string; error?: string }> {
  // Retrieve the challenge
  const storedChallenge = await getMfaChallenge(userId, 'authentication');
  if (!storedChallenge) {
    return { success: false, error: 'challenge_expired' };
  }

  // Find the credential
  const repo = getWebAuthnRepository();

  // Debug: log what we're looking for
  elog.debug('WebAuthn authentication: looking up credential', {
    userId,
    responseId: response.id,
    responseIdLength: response.id?.length,
  });

  const credential = await repo.findByCredentialId(response.id);

  if (!credential) {
    // Debug: check what credentials exist for this user
    const userCredentials = await repo.findByUserId(userId);
    elog.warn('WebAuthn authentication: credential not found', {
      userId,
      responseId: response.id,
      storedCredentialIds: userCredentials.map(c => c.credentialId),
    });
    return { success: false, error: 'credential_not_found' };
  }

  // Verify ownership
  if (credential.userId.toHexString() !== userId) {
    return { success: false, error: 'unauthorized' };
  }

  let verification: VerifiedAuthenticationResponse;
  try {
    const opts: VerifyAuthenticationResponseOpts = {
      response,
      expectedChallenge: storedChallenge,
      expectedOrigin: RP_ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, 'base64url'),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: false,
    };

    verification = await verifyAuthenticationResponse(opts);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    elog.warn('WebAuthn authentication verification failed', {
      errorMessage,
      errorStack,
      userId,
      expectedOrigins: RP_ORIGINS,
      expectedRPID: RP_ID,
    });
    return { success: false, error: 'verification_failed' };
  }

  if (!verification.verified) {
    return { success: false, error: 'verification_failed' };
  }

  // Update counter
  await repo.updateCounter(credential._id, verification.authenticationInfo.newCounter);

  // Clear the challenge
  await clearMfaChallenge(userId, 'authentication');

  return { success: true, credentialId: credential._id.toHexString() };
}

/**
 * Delete a WebAuthn credential
 */
export async function deleteWebAuthnCredential(
  credentialId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const repo = getWebAuthnRepository();
  const credential = await repo.findById(credentialId);

  if (!credential) {
    return { success: false, error: 'not_found' };
  }

  if (credential.userId.toHexString() !== userId) {
    return { success: false, error: 'unauthorized' };
  }

  await repo.delete(credentialId);

  elog.info('WebAuthn credential deleted', { userId, credentialId: credentialId.substring(0, 8) });

  void reconcileMfaDiscount(userId);

  return { success: true };
}

/**
 * Rename a WebAuthn credential
 */
export async function renameWebAuthnCredential(
  credentialId: string,
  userId: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  const repo = getWebAuthnRepository();
  const credential = await repo.findById(credentialId);

  if (!credential) {
    return { success: false, error: 'not_found' };
  }

  if (credential.userId.toHexString() !== userId) {
    return { success: false, error: 'unauthorized' };
  }

  await repo.rename(credentialId, newName);

  return { success: true };
}

// ============================================================================
// MFA Status Functions
// ============================================================================

/**
 * Get MFA status for a user
 */
export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const totpRepo = getTotpRepository();
  const webauthnRepo = getWebAuthnRepository();

  const [totpCredentials, webauthnCredentials] = await Promise.all([
    totpRepo.findVerifiedByUserId(userId),
    webauthnRepo.findByUserId(userId),
  ]);

  const totpEnabled = totpCredentials.length > 0;
  const webauthnEnabled = webauthnCredentials.length > 0;

  const hasHardwareKey = webauthnCredentials.some(
    (c) => !c.backedUp && c.transports?.some((t) => t === 'usb' || t === 'nfc' || t === 'ble'),
  );

  let discountTier: 'none' | 'basic' | 'hardware_key' = 'none';
  if (hasHardwareKey) {
    discountTier = 'hardware_key';
  } else if (totpEnabled || webauthnEnabled) {
    discountTier = 'basic';
  }

  return {
    enabled: totpEnabled || webauthnEnabled,
    totpEnabled,
    totpCount: totpCredentials.length,
    webauthnEnabled,
    webauthnCount: webauthnCredentials.length,
    discountTier,
  };
}

/**
 * Get all MFA credentials for a user
 */
export async function getMfaCredentials(userId: string): Promise<{
  totp: TotpCredentialDocument[];
  webauthn: WebAuthnCredentialDocument[];
}> {
  const totpRepo = getTotpRepository();
  const webauthnRepo = getWebAuthnRepository();

  const [totp, webauthn] = await Promise.all([
    totpRepo.findVerifiedByUserId(userId),
    webauthnRepo.findByUserId(userId),
  ]);

  return { totp, webauthn };
}

// ============================================================================
// MFA Challenge Storage (Redis)
// ============================================================================

async function storeMfaChallenge(
  userId: string,
  type: 'registration' | 'authentication',
  challenge: string
): Promise<void> {
  if (!isRedisConnected()) {
    elog.warn('Redis not connected, MFA challenge not stored');
    return;
  }

  const redis = getRedis();
  const key = `mfa:challenge:${type}:${userId}`;
  await redis.set(key, challenge, 'EX', MFA_CHALLENGE_TTL_SECONDS);
}

async function getMfaChallenge(
  userId: string,
  type: 'registration' | 'authentication'
): Promise<string | null> {
  if (!isRedisConnected()) {
    return null;
  }

  const redis = getRedis();
  const key = `mfa:challenge:${type}:${userId}`;
  return await redis.get(key);
}

async function clearMfaChallenge(
  userId: string,
  type: 'registration' | 'authentication'
): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  const redis = getRedis();
  const key = `mfa:challenge:${type}:${userId}`;
  await redis.del(key);
}

// ============================================================================
// MFA Login Challenge (for 2FA during login)
// ============================================================================

/**
 * Create an MFA challenge for login (stored in Redis)
 */
export async function createMfaLoginChallenge(
  userId: string,
  sessionId: string
): Promise<MfaChallengeData | null> {
  const status = await getMfaStatus(userId);

  if (!status.enabled) {
    return null;
  }

  const requiredMfaTypes: ('totp' | 'webauthn')[] = [];
  if (status.totpEnabled) requiredMfaTypes.push('totp');
  if (status.webauthnEnabled) requiredMfaTypes.push('webauthn');

  const challenge: MfaChallengeData = {
    userId,
    sessionId,
    requiredMfaTypes,
    createdAt: Date.now(),
    expiresAt: Date.now() + MFA_CHALLENGE_TTL_SECONDS * 1000,
  };

  // Generate WebAuthn challenge if needed
  if (status.webauthnEnabled) {
    const webauthnOpts = await generateWebAuthnAuthenticationOptions(userId);
    if (webauthnOpts) {
      challenge.webauthnChallenge = webauthnOpts.challenge;
    }
  }

  // Store in Redis
  if (isRedisConnected()) {
    const redis = getRedis();
    const key = `mfa:login:${sessionId}`;
    await redis.set(key, JSON.stringify(challenge), 'EX', MFA_CHALLENGE_TTL_SECONDS);
  }

  return challenge;
}

/**
 * Get MFA login challenge
 */
export async function getMfaLoginChallenge(sessionId: string): Promise<MfaChallengeData | null> {
  if (!isRedisConnected()) {
    return null;
  }

  const redis = getRedis();
  const key = `mfa:login:${sessionId}`;
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  let challenge: MfaChallengeData;
  try {
    challenge = JSON.parse(data) as MfaChallengeData;
  } catch {
    // Malformed data in Redis - log and clean up
    elog.warn('Failed to parse MFA login challenge data', {
      sessionIdPrefix: sessionId.substring(0, 8),
    });
    await redis.del(key);
    return null;
  }

  // Check expiration
  if (challenge.expiresAt < Date.now()) {
    await redis.del(key);
    return null;
  }

  return challenge;
}

/**
 * Clear MFA login challenge
 */
export async function clearMfaLoginChallenge(sessionId: string): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  const redis = getRedis();
  const key = `mfa:login:${sessionId}`;
  await redis.del(key);
}
