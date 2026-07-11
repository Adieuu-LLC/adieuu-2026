/**
 * Identity controller module.
 *
 * Contains the business logic for identity management endpoints including
 * creation, login, logout, deletion, and blocklist management.
 *
 * @module routes/identity/controller
 */

import elog from '../../utils/adieuuLogger';
import { success, errors, error as errorResponse } from '../../utils/response';
import { RouteContext } from '../../router';
import {
  parseOptionalObjectIdCursor,
  sanitizeObjectId,
  sanitizeString,
} from '../../utils/sanitize';
import {
  getSessionIdFromRequest,
  appendAuthClearCookies,
  requireAccountSession,
} from '../../services/session.service';
import { verifySignedToken } from '../../services/account-token.service';
import { getSessionRepository } from '../../repositories/session.repository';
import {
  getIdentityRepository,
  IDENTITY_SEARCH_DEFAULTS,
} from '../../repositories/identity.repository';
import {
  createIdentity,
  loginToIdentity,
  logoutFromIdentity,
  deleteIdentity,
  changePassphrase,
  MIN_PASSPHRASE_LENGTH,
} from '../../services/identity.service';
import {
  generateIdentityHash,
  CURRENT_HASH_VERSION,
} from '../../utils/identity-hash';
import {
  blockIdentity,
  unblockIdentity,
  checkIfBlocked,
  getBlockedIdentities,
  getBlockedIdentityIds,
} from '../../services/block.service';
import {
  toPublicIdentity,
  toIdentityPublicKeys,
  type CryptoProfile,
  type IdentityDevice,
  type IdentityDocument,
} from '../../models/identity';
import {
  attachActiveSignedPreKeysToPublicKeys,
  canViewerAccessTargetIdentityKeys,
} from '../../services/identity-keys-access.service';
import { verifyDeviceStoredStaticKeyAttestation } from '../../services/device-static-attestation.service';
import { config } from '../../config';
import { toPublicIdentitySession } from '../../models/session';
import { applyPrivacyFilter, areFriends } from './profile.controller';

import { z } from '@adieuu/shared/schemas';
import { getKeyBundleRepository } from '../../repositories/key-bundle.repository';
import { deriveBundleId } from '../../utils/crypto';
// ============================================================================
// Zod Schemas
// ============================================================================

const CreateIdentitySchema = z.object({
  signedToken: z.string().min(1),
  passphrase: z.string().min(MIN_PASSPHRASE_LENGTH),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  displayName: z.string().min(1).max(50),
});

const LoginIdentitySchema = z.object({
  signedToken: z.string().min(1),
  passphrase: z.string().min(1),
});

const BlockIdentitySchema = z.object({
  identityId: z.string().length(24),
});

/** Allowed username chars after stripping invisibles (must match {@link CreateIdentitySchema}). */
const USERNAME_ALLOWED = /^[a-zA-Z0-9_-]+$/;

/**
 * Shared "require-if-flagged, verify-if-present" attestation gate used by
 * both {@link registerDeviceCtrl} and {@link initializeE2ECtrl}.
 *
 * Returns a 400 Response when validation fails, or `null` when the
 * attestation is absent-but-optional or present-and-valid.
 */
function verifyStaticKeyAttestationOrReject(
  identity: IdentityDocument,
  device: IdentityDevice,
  attestation: string | undefined,
): Response | null {
  if (config.security.requireDeviceAttestation && !attestation) {
    return errors.badRequest('Static key attestation is required to register a device.');
  }
  if (attestation) {
    if (!verifyDeviceStoredStaticKeyAttestation(identity, device, attestation)) {
      return errors.badRequest('Invalid static key attestation.');
    }
  }
  return null;
}

// ============================================================================
// Identity Search & Profile Controllers
// ============================================================================

export async function searchIdentitiesCtrl(ctx: RouteContext): Promise<Response> {
  const trimmed = ctx.query.get('q')?.trim() ?? '';
  const sanitizedQ = sanitizeString(trimmed, 'general');
  const query = sanitizedQ.value ?? '';

  const limitParam = ctx.query.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : IDENTITY_SEARCH_DEFAULTS.DEFAULT_LIMIT;

  if (query.length < IDENTITY_SEARCH_DEFAULTS.MIN_QUERY_LENGTH) {
    return errors.badRequest(
      `Search query must be at least ${IDENTITY_SEARCH_DEFAULTS.MIN_QUERY_LENGTH} characters.`
    );
  }

  if (isNaN(limit) || limit < 1) {
    return errors.badRequest('Invalid limit parameter.');
  }

  let excludeIds;
  let viewerIdentityId: string | undefined;
  if (ctx.identitySession) {
    const { identity } = ctx.identitySession;
    excludeIds = await getBlockedIdentityIds(identity._id);
    viewerIdentityId = identity._id.toHexString();
  }

  const identityRepo = getIdentityRepository();
  const results = await identityRepo.search(query, limit, excludeIds);

  return success(
    results.map((doc) => {
      const profile = toPublicIdentity(doc);
      const relation =
        viewerIdentityId === doc._id.toHexString() ? 'self' : 'stranger';
      return applyPrivacyFilter(profile, doc, relation);
    })
  );
}

export async function getIdentityByIdCtrl(ctx: RouteContext): Promise<Response> {
  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findByIdentityId(routeId.id);

  if (!identity) {
    return errors.notFound('Identity not found.');
  }

  const publicProfile = toPublicIdentity(identity);

  let viewerRelation: 'self' | 'friend' | 'stranger' = 'stranger';
  if (ctx.identitySession) {
    const viewerIdentity = ctx.identitySession.identity;
    if (viewerIdentity._id.equals(identity._id)) {
      viewerRelation = 'self';
    } else {
      const friends = await areFriends(viewerIdentity._id, identity._id);
      if (friends) {
        viewerRelation = 'friend';
      }
    }
  }

  return success(applyPrivacyFilter(publicProfile, identity, viewerRelation));
}

// ============================================================================
// Identity CRUD Controllers
// ============================================================================

export async function createIdentityCtrl(ctx: RouteContext): Promise<Response> {
  const parseResult = CreateIdentitySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { signedToken, passphrase, username: rawUsername, displayName: rawDisplayName } = parseResult.data;

  const usernameCandidate = sanitizeString(rawUsername, 'idenhanced').value ?? '';
  if (
    usernameCandidate.length < 3 ||
    usernameCandidate.length > 30 ||
    !USERNAME_ALLOWED.test(usernameCandidate)
  ) {
    return ctx.errors.validationFailed();
  }
  const username = usernameCandidate;

  // Verify the bridging token
  const tokenPayload = verifySignedToken(signedToken);
  if (!tokenPayload) {
    return ctx.errors.unauthorized();
  }

  const { value: displayName } = sanitizeString(rawDisplayName, 'general');
  if (!displayName || displayName.length === 0) {
    return ctx.errors.validationFailed();
  }

  const userAgent = ctx.request.headers.get('User-Agent') ?? undefined;

  const result = await createIdentity(
    tokenPayload.sub,
    tokenPayload.maxIdentities,
    passphrase,
    username,
    displayName,
    {
      autoLogin: true,
      metadata: {
        userAgent,
        maxVideoDurationSeconds: tokenPayload.maxVideoDurationSeconds,
        subscriptions: tokenPayload.subscriptions,
        entitlements: tokenPayload.entitlements,
        currentPeriodEnd: tokenPayload.currentPeriodEnd,
        isLifetime: tokenPayload.isLifetime,
      },
    },
  );

  if (!result.success) {
    if (result.errorCode === 'MAX_IDENTITIES') {
      return errors.conflict('Maximum number of identities reached.');
    }
    if (result.errorCode === 'USERNAME_TAKEN') {
      return errors.conflict('Username is already taken.');
    }
    return errors.badRequest(result.error ?? 'Identity creation failed.');
  }

  const response = success(
    result.identity,
    'Identity created successfully.',
  );
  if (result.cookie) {
    const headers = new Headers(response.headers);
    headers.append('Set-Cookie', result.cookie);
    if (result.csrfCookie) {
      headers.append('Set-Cookie', result.csrfCookie);
    }
    return new Response(response.body, { status: response.status, headers });
  }

  return response;
}

export async function loginIdentityCtrl(ctx: RouteContext): Promise<Response> {
  const parseResult = LoginIdentitySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { signedToken, passphrase } = parseResult.data;

  // Verify the bridging token
  const tokenPayload = verifySignedToken(signedToken);
  if (!tokenPayload) {
    return ctx.errors.unauthorized();
  }

  const userAgent = ctx.request.headers.get('User-Agent') ?? undefined;

  const result = await loginToIdentity(
    tokenPayload.sub,
    passphrase,
    {
      userAgent,
      maxVideoDurationSeconds: tokenPayload.maxVideoDurationSeconds,
      subscriptions: tokenPayload.subscriptions,
      entitlements: tokenPayload.entitlements,
      currentPeriodEnd: tokenPayload.currentPeriodEnd,
      isLifetime: tokenPayload.isLifetime,
    },
  );

  if (!result.success) {
    if (result.errorCode === 'IDENTITY_SUSPENDED' || result.errorCode === 'IDENTITY_BANNED') {
      return errorResponse(
        result.errorCode,
        result.error ?? 'This alias is restricted.',
        403,
        {
          moderationReason: result.moderationReason,
          moderationReportId: result.moderationReportId,
          suspendedUntil: result.suspendedUntil,
        },
      );
    }

    if (result.errorCode === 'LOCKED_OUT' || result.errorCode === 'RATE_LIMITED') {
      const response = ctx.errors.rateLimited();
      if (result.retryAfter) {
        const headers = new Headers(response.headers);
        headers.set('Retry-After', result.retryAfter.toString());

        const body = JSON.stringify({
          success: false,
          error: result.error,
          retryAfter: result.retryAfter,
          attemptNumber: result.attemptNumber,
        });

        return new Response(body, {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': result.retryAfter.toString(),
          },
        });
      }
      return response;
    }

    if (result.errorCode === 'INVALID_PASSPHRASE') {
      const body = JSON.stringify({
        success: false,
        error: result.error,
        attemptNumber: result.attemptNumber,
        retryAfter: result.retryAfter,
      });

      return new Response(body, {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return ctx.errors.unauthorized();
  }

  // Success - set identity session cookie
  const response = success({ identity: result.identity }, 'Identity login successful.');
  const headers = new Headers(response.headers);
  if (result.cookie) {
    headers.append('Set-Cookie', result.cookie);
    if (result.csrfCookie) {
      headers.append('Set-Cookie', result.csrfCookie);
    }
    elog.debug('Identity login: Set-Cookie applied', {
      sessionIdPrefix: result.sessionId?.substring(0, 8) + '...',
    });
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function logoutIdentityCtrl(ctx: RouteContext): Promise<Response> {
  const sessionId = getSessionIdFromRequest(ctx.request);
  const destroyed = sessionId ? await logoutFromIdentity(sessionId) : false;

  const response = success(undefined, 'Identity logout successful.');

  if (destroyed || !sessionId) {
    const headers = new Headers(response.headers);
    appendAuthClearCookies(headers);
    return new Response(response.body, { status: response.status, headers });
  }

  return response;
}

export async function getIdentitySessionCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) {
    return ctx.errors.unauthorized();
  }

  const publicIdentity = toPublicIdentity(ctx.identitySession.identity);

  const ents = ctx.identitySession.entitlements;
  const earned: string[] = [];
  if (ents.includes('vanguard') || ents.includes('founder')) earned.push('vanguard');
  if (ents.includes('founder')) earned.push('founder');
  if (earned.length > 0) {
    publicIdentity.earnedBadges = earned;
  }

  return success(publicIdentity);
}

export async function deleteIdentityCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity, sessionId } = ctx.identitySession;

  const result = await deleteIdentity(identity._id, sessionId);
  if (!result.success) {
    return errors.badRequest(result.error ?? 'Identity deletion failed.');
  }

  const response = success(undefined, 'Identity deleted successfully.');
  const headers = new Headers(response.headers);
  appendAuthClearCookies(headers);
  return new Response(response.body, { status: response.status, headers });
}

// ============================================================================
// Blocklist Controllers
// ============================================================================

export async function getBlocklistCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  // Parse pagination params
  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  // Validate cursor if provided
  const validCursor = parseOptionalObjectIdCursor(cursor);

  const result = await getBlockedIdentities(identity._id, limit, validCursor);

  return success({
    blocks: result.blocks,
    cursor: result.cursor,
  });
}

export async function addToBlocklistCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  // Validate request body
  const parseResult = BlockIdentitySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { identityId: rawIdentityId } = parseResult.data;
  const sanitizedId = sanitizeObjectId(rawIdentityId);
  if (!sanitizedId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await blockIdentity(identity._id, sanitizedId.id);

  if (!result.success) {
    switch (result.errorCode) {
      case 'CANNOT_BLOCK_SELF':
        return errors.badRequest('Cannot block yourself.');
      case 'ALREADY_BLOCKED':
        return errors.badRequest('Identity already blocked.');
      case 'IDENTITY_NOT_FOUND':
        return errors.notFound('Identity not found.');
      default:
        return errors.badRequest(result.error ?? 'Block failed.');
    }
  }

  return success(undefined, 'Identity blocked.');
}

export async function removeFromBlocklistCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const { identityId } = ctx.params;
  const sanitizedId = sanitizeObjectId(identityId ?? '');
  if (!sanitizedId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await unblockIdentity(identity._id, sanitizedId.id);

  if (!result.success) {
    if (result.errorCode === 'BLOCK_NOT_FOUND') {
      return errors.notFound('Block not found.');
    }
    return errors.badRequest(result.error ?? 'Unblock failed.');
  }

  return success(undefined, 'Identity unblocked.');
}

export async function checkBlocklistCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const { identityId } = ctx.params;
  const sanitizedId = sanitizeObjectId(identityId ?? '');
  if (!sanitizedId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await checkIfBlocked(identity._id, sanitizedId.id);

  return success({
    blocked: result.blocked,
    blockedAt: result.blockedAt,
  });
}

// ============================================================================
// E2E Encryption Endpoints
// ============================================================================

const RegisterDeviceSchema = z.object({
  deviceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  ecdhPublicKey: z.string().min(32).max(200),
  kemPublicKey: z.string().min(32).max(2000).optional(),
  /** Ed25519 attestation (base64) over static device keys */
  staticKeyAttestation: z.string().min(32).max(200).optional(),
});

const PutStaticKeyAttestationSchema = z.object({
  signature: z.string().min(32).max(200),
});

const StoreKeyBundleSchema = z.object({
  encryptedBundle: z.string().min(32).max(8000),
  salt: z.string().min(16).max(64),
  nonce: z.string().min(16).max(64),
});

const InitializeE2ESchema = z.object({
  signingPublicKey: z.string().min(32).max(200),
  preferredCryptoProfile: z.enum(['default', 'cnsa2']).optional(),
  device: RegisterDeviceSchema,
  bundle: StoreKeyBundleSchema,
});

/**
 * Register a new device for an identity.
 * POST /identity/:id/devices
 */
export async function registerDeviceCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot register device for another identity.');
  }

  const parseResult = RegisterDeviceSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { deviceId, name, ecdhPublicKey, kemPublicKey, staticKeyAttestation } = parseResult.data;
  const identityRepo = getIdentityRepository();

  const existingDevices = await identityRepo.getDevices(identity._id);
  if (existingDevices.some(d => d.deviceId === deviceId)) {
    return errors.badRequest('Device already registered.');
  }

  const now = new Date();
  const device: IdentityDevice = {
    deviceId,
    name: sanitizeString(name, 'general').value ?? name,
    ecdhPublicKey,
    kemPublicKey,
    registeredAt: now,
    lastActiveAt: now,
  };

  const attestationError = verifyStaticKeyAttestationOrReject(identity, device, staticKeyAttestation);
  if (attestationError) return attestationError;
  if (staticKeyAttestation) {
    device.staticKeyAttestation = staticKeyAttestation;
  }

  const added = await identityRepo.addDevice(identity._id, device);
  if (!added) {
    return errors.badRequest('Failed to register device.');
  }

  return success({ deviceId }, 'Device registered successfully.');
}

/**
 * Get public keys for an identity (for E2E encryption).
 * GET /identity/:id/keys
 */
export async function getIdentityKeysCtrl(ctx: RouteContext): Promise<Response> {
  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }

  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const viewerIdentity = ctx.identitySession.identity;

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findByIdentityId(routeId.id);

  if (!identity) {
    return errors.notFound('Identity not found.');
  }

  const allowed = await canViewerAccessTargetIdentityKeys(
    viewerIdentity._id,
    identity._id
  );
  if (!allowed) {
    return errors.forbidden('Cannot access this identity\'s keys.');
  }

  const includeDeviceNames = viewerIdentity._id.equals(identity._id);
  const publicKeys = toIdentityPublicKeys(identity, { includeDeviceNames });
  if (!publicKeys) {
    return errors.notFound('Identity has not set up E2E encryption.');
  }

  const withSpk = await attachActiveSignedPreKeysToPublicKeys(identity, publicKeys);

  // Debug logging for public keys retrieval
  if (process.env.LOGGING_INCLUDE_PUBLIC_KEY_SIGNS === 'true') {
    console.log('[Get Keys] Identity ID:', identity._id.toHexString());
    console.log('[Get Keys] Signing public key:', withSpk.signingPublicKey);
  }

  return success(withSpk);
}

/**
 * Store an encrypted key bundle.
 * PUT /identity/:id/bundle
 */
export async function storeKeyBundleCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot store key bundle for another identity.');
  }

  const parseResult = StoreKeyBundleSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { encryptedBundle, salt, nonce } = parseResult.data;
  const keyBundleRepo = getKeyBundleRepository();
  const bundleId = deriveBundleId(identity.ident);

  const existing = await keyBundleRepo.findByBundleId(bundleId);
  if (existing) {
    await keyBundleRepo.updateBundle(bundleId, encryptedBundle, salt, nonce);
    return success({ updated: true }, 'Key bundle updated.');
  }

  await keyBundleRepo.create({
    bundleId,
    encryptedBundle,
    salt,
    nonce,
    useSeparatePassphrase: false,
  });

  return success({ created: true }, 'Key bundle stored.');
}

/**
 * Get an encrypted key bundle.
 * GET /identity/:id/bundle
 */
export async function getKeyBundleCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot retrieve key bundle for another identity.');
  }

  const keyBundleRepo = getKeyBundleRepository();
  const bundleId = deriveBundleId(identity.ident);
  
  // Debug logging for bundle retrieval
  // console.log('[Get Bundle] Identity ID:', identity._id.toHexString());
  // console.log('[Get Bundle] Identity ident:', identity.ident);
  // console.log('[Get Bundle] Derived bundle ID:', bundleId);

  const bundle = await keyBundleRepo.findByBundleId(bundleId);
  if (!bundle) {
    // console.log('[Get Bundle] Bundle not found!');
    return errors.notFound('Key bundle not found.');
  }
  
  // console.log('[Get Bundle] Bundle found, salt length:', bundle.salt.length);

  return success({
    encryptedBundle: bundle.encryptedBundle,
    salt: bundle.salt,
    nonce: bundle.nonce,
    useSeparatePassphrase: bundle.useSeparatePassphrase,
    schemeVersion: bundle.schemeVersion,
  });
}

/**
 * List all devices for an identity.
 * GET /identity/:id/devices
 */
export async function listDevicesCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot list devices for another identity.');
  }

  const identityRepo = getIdentityRepository();
  const devices = await identityRepo.getDevices(identity._id);

  return success({
    devices: devices.map(d => ({
      deviceId: d.deviceId,
      name: d.name,
      ecdhPublicKey: d.ecdhPublicKey,
      kemPublicKey: d.kemPublicKey,
      staticKeyAttestation: d.staticKeyAttestation,
      registeredAt: d.registeredAt.toISOString(),
      lastActiveAt: d.lastActiveAt.toISOString(),
    })),
  });
}

/**
 * Remove a device from an identity.
 * DELETE /identity/:id/devices/:deviceId
 */
export async function removeDeviceCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot remove device for another identity.');
  }

  const { deviceId } = ctx.params;
  const sanitizedDeviceId = sanitizeString(deviceId ?? '', 'general');
  if (!sanitizedDeviceId.value) {
    return errors.badRequest('Invalid device ID.');
  }

  const identityRepo = getIdentityRepository();
  const removed = await identityRepo.removeDevice(identity._id, sanitizedDeviceId.value);

  if (!removed) {
    return errors.notFound('Device not found.');
  }

  return success(undefined, 'Device removed.');
}

/**
 * Update a device (name and/or activity).
 * PATCH /identity/:id/devices/:deviceId
 */
export async function updateDeviceCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot update device for another identity.');
  }

  const { deviceId } = ctx.params;
  const sanitizedDeviceId = sanitizeString(deviceId ?? '', 'general');
  if (!sanitizedDeviceId.value) {
    return errors.badRequest('Invalid device ID.');
  }

  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const { name, updateActivity } = body;

  const identityRepo = getIdentityRepository();

  // Verify device exists
  const devices = await identityRepo.getDevices(identity._id);
  const deviceExists = devices.some(d => d.deviceId === sanitizedDeviceId.value);
  if (!deviceExists) {
    return errors.notFound('Device not found.');
  }

  // Update name if provided
  if (typeof name === 'string') {
    const sanitizedName = sanitizeString(name, 'general');
    if (!sanitizedName.value || sanitizedName.value.length > 100) {
      return errors.badRequest('Device name must be 1-100 characters.');
    }
    const nameUpdated = await identityRepo.updateDeviceName(
      identity._id,
      sanitizedDeviceId.value,
      sanitizedName.value
    );
    if (!nameUpdated) {
      return errors.internal('Failed to update device name.');
    }
  }

  // Update activity if requested
  if (updateActivity === true) {
    await identityRepo.updateDeviceActivity(identity._id, sanitizedDeviceId.value);
  }

  return success(undefined, 'Device updated.');
}

/**
 * PUT /identity/:id/devices/:deviceId/static-key-attestation
 *
 * Owner uploads Ed25519 attestation over this device's static public keys.
 */
export async function putDeviceStaticKeyAttestationCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot update device attestation for another identity.');
  }

  const { deviceId } = ctx.params;
  const sanitizedDeviceId = sanitizeString(deviceId ?? '', 'general');
  if (!sanitizedDeviceId.value) {
    return errors.badRequest('Invalid device ID.');
  }

  const parseResult = PutStaticKeyAttestationSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { signature } = parseResult.data;
  const identityRepo = getIdentityRepository();
  const devices = await identityRepo.getDevices(identity._id);
  const device = devices.find(d => d.deviceId === sanitizedDeviceId.value);
  if (!device) {
    return errors.notFound('Device not found.');
  }

  if (!verifyDeviceStoredStaticKeyAttestation(identity, device, signature)) {
    return errors.badRequest('Invalid static key attestation.');
  }

  if (device.staticKeyAttestation === signature) {
    return success({ updated: false }, 'Static key attestation unchanged.');
  }

  const updated = await identityRepo.setDeviceStaticKeyAttestation(
    identity._id,
    sanitizedDeviceId.value,
    signature
  );
  if (!updated) {
    return errors.internal('Failed to store static key attestation.');
  }

  return success({ updated: true }, 'Static key attestation stored.');
}

// ============================================================================
// Identity Session Management
// ============================================================================

/**
 * List all sessions for an identity.
 * GET /identity/:id/sessions
 */
export async function listIdentitySessionsCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity, sessionId: currentSessionId } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot list sessions for another identity.');
  }

  const sessionRepo = getSessionRepository();
  const sessions = await sessionRepo.findByIdentityId(identity._id);

  const activeSessions = sessions.filter((s) => s.expiresAt > new Date());

  return success({
    sessions: activeSessions.map((s) => toPublicIdentitySession(s, currentSessionId)),
  });
}

/**
 * Revoke a specific identity session.
 * DELETE /identity/:id/sessions/:sessionId
 */
export async function revokeIdentitySessionCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity, sessionId: currentSessionId } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot revoke sessions for another identity.');
  }

  const rawSessionParam = ctx.params.sessionId;

  if (!rawSessionParam) {
    return errors.badRequest('Session ID is required.');
  }

  // Block revoking current session — compare raw segments first so opaque tokens behave predictably.
  if (
    rawSessionParam === currentSessionId ||
    currentSessionId.startsWith(`${rawSessionParam}.`)
  ) {
    return errors.badRequest('Cannot revoke your current session. Use logout instead.');
  }

  /** Strip hostile Unicode from persisted session‑id lookups (canonical token is URL‑safe base64). */
  const sessionIdCandidate = sanitizeString(rawSessionParam, 'base64url').value;
  if (!sessionIdCandidate) {
    return errors.badRequest('Session ID is required.');
  }

  const sessionRepo = getSessionRepository();

  const session = await sessionRepo.findBySessionId(sessionIdCandidate);
  if (
    !session ||
    session.type !== 'identity' ||
    session.identityId?.toHexString() !== identity._id.toHexString()
  ) {
    return errors.notFound('Session not found.');
  }

  await sessionRepo.revoke(sessionIdCandidate);

  return success(undefined, 'Session revoked.');
}

/**
 * Revoke all other identity sessions (except the current one).
 * DELETE /identity/:id/sessions
 */
export async function revokeAllOtherIdentitySessionsCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity, sessionId: currentSessionId } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot revoke sessions for another identity.');
  }

  const sessionRepo = getSessionRepository();
  const revokedCount = await sessionRepo.revokeAllForIdentityExcept(
    identity._id,
    currentSessionId,
  );

  return success({ count: revokedCount }, `${revokedCount} session(s) revoked.`);
}

/**
 * Initialize E2E encryption for an identity.
 * This is an atomic operation that sets up the signing key, stores the bundle,
 * and registers the first device in a single transaction.
 * POST /identity/:id/e2e/initialize
 */
export async function initializeE2ECtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot initialize E2E for another identity.');
  }

  if (identity.signingPublicKey) {
    return errors.badRequest('E2E encryption already initialized.');
  }

  const parseResult = InitializeE2ESchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { signingPublicKey, preferredCryptoProfile, device, bundle } = parseResult.data;

  // The signing key is not stored on the identity yet, so verify the
  // attestation against the signing public key provided in this request.
  const attestationIdentity = {
    ...identity,
    signingPublicKey,
    preferredCryptoProfile: (preferredCryptoProfile as CryptoProfile) ?? 'default',
  };
  const attestationDevice: IdentityDevice = {
    deviceId: device.deviceId,
    name: device.name,
    ecdhPublicKey: device.ecdhPublicKey,
    kemPublicKey: device.kemPublicKey,
    registeredAt: new Date(),
    lastActiveAt: new Date(),
  };
  const e2eAttestationError = verifyStaticKeyAttestationOrReject(
    attestationIdentity,
    attestationDevice,
    device.staticKeyAttestation,
  );
  if (e2eAttestationError) return e2eAttestationError;

  // Debug logging for E2E initialization
  console.log('[E2E Init] Identity ID:', identity._id.toHexString());
  console.log('[E2E Init] Identity ident:', identity.ident);
  console.log('[E2E Init] Signing public key to store:', signingPublicKey);

  try {
    const { withTransaction } = await import('../../db');
    await withTransaction(async (_session) => {
      const identityRepo = getIdentityRepository();
      const keyBundleRepo = getKeyBundleRepository();
      const bundleId = deriveBundleId(identity.ident);
      console.log('[E2E Init] Derived bundle ID:', bundleId);

      await identityRepo.setSigningPublicKey(
        identity._id,
        signingPublicKey,
        (preferredCryptoProfile as CryptoProfile) ?? 'default'
      );

      await keyBundleRepo.create({
        bundleId,
        encryptedBundle: bundle.encryptedBundle,
        salt: bundle.salt,
        nonce: bundle.nonce,
        useSeparatePassphrase: false,
      });

      const now = new Date();
      const deviceDoc: IdentityDevice = {
        deviceId: device.deviceId,
        name: sanitizeString(device.name, 'general').value ?? device.name,
        ecdhPublicKey: device.ecdhPublicKey,
        kemPublicKey: device.kemPublicKey,
        registeredAt: now,
        lastActiveAt: now,
      };

      if (device.staticKeyAttestation) {
        deviceDoc.staticKeyAttestation = device.staticKeyAttestation;
      }

      await identityRepo.addDevice(identity._id, deviceDoc);
    });

    return success({
      initialized: true,
      deviceId: device.deviceId,
    }, 'E2E encryption initialized successfully.');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return errors.badRequest(`Failed to initialize E2E encryption: ${errorMessage}`);
  }
}

// ============================================================================
// Passphrase Change Controller
// ============================================================================

const ChangePassphraseSchema = z.object({
  signedToken: z.string().min(1),
  currentPassphrase: z.string().min(1),
  newPassphrase: z.string().min(MIN_PASSPHRASE_LENGTH),
  newEncryptedBundle: z.string().min(32).max(8000),
  newBundleSalt: z.string().min(16).max(64),
  newBundleNonce: z.string().min(16).max(64),
});

/**
 * Change the passphrase for the current identity.
 * POST /identity/change-passphrase
 *
 * Accepts either an identity session (alias mode) or an account session.
 * In account mode, ownership is proven by signedToken + currentPassphrase derivation.
 */
export async function changePassphraseCtrl(ctx: RouteContext): Promise<Response> {
  const callerIdentityId = ctx.identitySession?.identity._id.toHexString();
  const callerSessionId = ctx.identitySession?.sessionId;

  if (!ctx.identitySession) {
    const accountSession = await requireAccountSession(ctx.request);
    if (!accountSession) return ctx.errors.unauthorized();
  }

  const parseResult = ChangePassphraseSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const {
    signedToken,
    currentPassphrase,
    newPassphrase,
    newEncryptedBundle,
    newBundleSalt,
    newBundleNonce,
  } = parseResult.data;

  const tokenPayload = verifySignedToken(signedToken);
  if (!tokenPayload) {
    return ctx.errors.unauthorized();
  }

  const result = await changePassphrase(
    tokenPayload.sub,
    currentPassphrase,
    newPassphrase,
    { encryptedBundle: newEncryptedBundle, salt: newBundleSalt, nonce: newBundleNonce },
    callerIdentityId,
    callerSessionId,
  );

  if (!result.success) {
    if (result.errorCode === 'INVALID_PASSPHRASE') {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return errors.badRequest(result.error ?? 'Passphrase change failed.');
  }

  return success(undefined, 'Passphrase changed successfully.');
}

// ============================================================================
// Bundle Retrieval by Passphrase (Account Session)
// ============================================================================

const BundleByPassphraseSchema = z.object({
  signedToken: z.string().min(1),
  passphrase: z.string().min(MIN_PASSPHRASE_LENGTH),
});

/**
 * Fetch an encrypted key bundle using account session + passphrase proof.
 * POST /identity/bundle-by-passphrase
 *
 * Allows account-session users to retrieve their alias's encrypted bundle
 * for client-side decryption during passphrase change flows.
 */
export async function getBundleByPassphraseCtrl(ctx: RouteContext): Promise<Response> {
  const accountSession = await requireAccountSession(ctx.request);
  if (!accountSession) return ctx.errors.unauthorized();

  const parseResult = BundleByPassphraseSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { signedToken, passphrase } = parseResult.data;

  const tokenPayload = verifySignedToken(signedToken);
  if (!tokenPayload) {
    return ctx.errors.unauthorized();
  }

  let ident: string;
  try {
    const result = await generateIdentityHash(
      passphrase,
      tokenPayload.sub,
      CURRENT_HASH_VERSION,
    );
    ident = result.hash;
  } catch {
    return errors.badRequest('Invalid passphrase format.');
  }

  const keyBundleRepo = getKeyBundleRepository();
  const bundleId = deriveBundleId(ident);
  const bundle = await keyBundleRepo.findByBundleId(bundleId);

  if (!bundle) {
    return errors.notFound('Key bundle not found.');
  }

  return success({
    encryptedBundle: bundle.encryptedBundle,
    salt: bundle.salt,
    nonce: bundle.nonce,
    useSeparatePassphrase: bundle.useSeparatePassphrase ?? false,
    schemeVersion: bundle.schemeVersion ?? 1,
  });
}
