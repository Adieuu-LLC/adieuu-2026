/**
 * Pre-Key Controller
 *
 * Handles upload, claim, and count of pre-keys for forward secrecy.
 *
 * Endpoints:
 * - POST /identity/:id/devices/:deviceId/pre-keys  (upload, owner only)
 * - POST /identity/:id/pre-keys/claim               (claim, any authenticated identity)
 * - GET  /identity/:id/devices/:deviceId/pre-keys/count (count, owner only)
 *
 * @module routes/identity/pre-key-controller
 */

import { success, errors } from '../../utils/response';
import type { RouteContext } from '../../router';
import {
  getIdentityFromSession,
  getIdentitySessionIdFromRequest,
} from '../../services/identity.service';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getPreKeyRepository } from '../../repositories/pre-key.repository';
import { toIdentityPublicKeys } from '../../models/identity';
import { MAX_OTPK_BATCH_SIZE, MAX_OTPK_PER_DEVICE } from '../../models/pre-key';
import { isValidObjectId } from '../../utils';
import { sanitizeString } from '../../utils/sanitize';
import { z } from '@adieuu/shared/schemas';
import { ObjectId } from 'mongodb';
import { verifySignedPreKey, fromBase64, type SignedPreKeyPublic } from '@adieuu/crypto';

// ============================================================================
// Zod Schemas
// ============================================================================

const SignedPreKeySchema = z.object({
  keyId: z.string().uuid(),
  ecdhPublicKey: z.string().min(32).max(200),
  kemPublicKey: z.string().min(32).max(2000),
  signature: z.string().min(1).max(500),
});

const OneTimePreKeySchema = z.object({
  keyId: z.string().uuid(),
  ecdhPublicKey: z.string().min(32).max(200),
  kemPublicKey: z.string().min(32).max(2000),
});

const UploadPreKeysSchema = z.object({
  signedPreKey: SignedPreKeySchema.optional(),
  oneTimePreKeys: z.array(OneTimePreKeySchema).max(MAX_OTPK_BATCH_SIZE).optional(),
  signedPreKeyExpiresInDays: z.number().int().min(1).max(90).optional(),
});

const ClaimPreKeysSchema = z.object({
  deviceIds: z.array(z.string()).optional(),
});

// ============================================================================
// Controllers
// ============================================================================

/**
 * POST /identity/:id/devices/:deviceId/pre-keys
 *
 * Upload signed pre-key and/or one-time pre-keys for a device.
 * Authenticated, owner only.
 */
export async function uploadPreKeysCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  if (identity._id.toHexString() !== ctx.params.id) {
    return errors.forbidden('Cannot upload pre-keys for another identity.');
  }

  const { deviceId } = ctx.params;
  if (!deviceId) {
    return errors.badRequest('Device ID is required.');
  }

  const devices = identity.devices ?? [];
  if (!devices.some((d) => d.deviceId === deviceId)) {
    return errors.notFound('Device not found.');
  }

  const parseResult = UploadPreKeysSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { signedPreKey, oneTimePreKeys, signedPreKeyExpiresInDays } = parseResult.data;

  if (!signedPreKey && (!oneTimePreKeys || oneTimePreKeys.length === 0)) {
    return errors.badRequest('Must provide at least a signed pre-key or one-time pre-keys.');
  }

  const preKeyRepo = getPreKeyRepository();
  const identityId = identity._id;
  let storedSignedPreKey = false;
  let storedOneTimePreKeys = 0;

  // Store signed pre-key (replaces existing)
  if (signedPreKey) {
    if (!identity.signingPublicKey) {
      return errors.badRequest('Identity has no signing public key configured.');
    }

    const spkPublic: SignedPreKeyPublic = {
      keyId: signedPreKey.keyId,
      ecdhPublicKey: fromBase64(signedPreKey.ecdhPublicKey),
      kemPublicKey: fromBase64(signedPreKey.kemPublicKey),
      signature: fromBase64(signedPreKey.signature),
    };

    const signingPubKey = fromBase64(identity.signingPublicKey);
    if (!verifySignedPreKey(spkPublic, signingPubKey)) {
      return errors.badRequest('Signed pre-key signature verification failed.');
    }

    const expiresInDays = signedPreKeyExpiresInDays ?? 7;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    await preKeyRepo.storeSignedPreKey({
      identityId,
      deviceId,
      keyId: signedPreKey.keyId,
      ecdhPublicKey: signedPreKey.ecdhPublicKey,
      kemPublicKey: signedPreKey.kemPublicKey,
      signature: signedPreKey.signature,
      expiresAt,
    });
    storedSignedPreKey = true;
  }

  // Store one-time pre-keys (batch)
  if (oneTimePreKeys && oneTimePreKeys.length > 0) {
    const currentCount = await preKeyRepo.countUnconsumedOneTimePreKeys(identityId, deviceId);
    const remaining = MAX_OTPK_PER_DEVICE - currentCount;

    if (remaining <= 0) {
      if (!storedSignedPreKey) {
        return errors.badRequest(
          `Device already has ${MAX_OTPK_PER_DEVICE} unconsumed one-time pre-keys.`
        );
      }
      // Signed pre-key was stored successfully but OTPKs are at capacity
    } else {
      const toStore = oneTimePreKeys.slice(0, remaining);
      storedOneTimePreKeys = await preKeyRepo.storeOneTimePreKeys(
        toStore.map((otpk) => ({
          identityId,
          deviceId,
          keyId: otpk.keyId,
          ecdhPublicKey: otpk.ecdhPublicKey,
          kemPublicKey: otpk.kemPublicKey,
        }))
      );
    }
  }

  return success({
    storedSignedPreKey,
    storedOneTimePreKeys,
  });
}

/**
 * POST /identity/:id/pre-keys/claim
 *
 * Claim pre-keys for all (or specified) devices of an identity.
 * Authenticated, any identity can claim (needed for sending DMs).
 *
 * Atomically consumes one OTPK per device. Returns signed pre-key
 * as fallback if no OTPKs are available.
 */
export async function claimPreKeysCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const callerIdentity = await getIdentityFromSession(identitySessionId);
  if (!callerIdentity) {
    return ctx.errors.unauthorized();
  }

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const identityRepo = getIdentityRepository();
  const targetIdentity = await identityRepo.findByIdentityId(sanitized.value);
  if (!targetIdentity) {
    return errors.notFound('Identity not found.');
  }

  const publicKeys = toIdentityPublicKeys(targetIdentity);
  if (!publicKeys) {
    return errors.notFound('Identity has not set up E2E encryption.');
  }

  const parseResult = ClaimPreKeysSchema.safeParse(ctx.body ?? {});
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { deviceIds } = parseResult.data;

  // Get all device IDs for the target identity, or filter by requested ones
  const allDeviceIds = publicKeys.devices.map((d) => d.deviceId);
  const targetDeviceIds = deviceIds
    ? allDeviceIds.filter((id) => deviceIds.includes(id))
    : allDeviceIds;

  if (targetDeviceIds.length === 0) {
    return errors.badRequest('No matching devices found.');
  }

  const preKeyRepo = getPreKeyRepository();
  const claimed = await preKeyRepo.claimPreKeysForAllDevices(
    targetIdentity._id,
    targetDeviceIds
  );

  return success({ devices: claimed });
}

/**
 * DELETE /identity/:id/devices/:deviceId/pre-keys/one-time
 *
 * Purge all unconsumed one-time pre-keys for a device.
 * Used to reset the OTPK pool when local and server state have diverged.
 * Authenticated, owner only.
 */
export async function purgeOneTimePreKeysCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  if (identity._id.toHexString() !== ctx.params.id) {
    return errors.forbidden('Cannot purge pre-keys for another identity.');
  }

  const { deviceId } = ctx.params;
  if (!deviceId) {
    return errors.badRequest('Device ID is required.');
  }

  const devices = identity.devices ?? [];
  if (!devices.some((d) => d.deviceId === deviceId)) {
    return errors.notFound('Device not found.');
  }

  const preKeyRepo = getPreKeyRepository();
  const [purged, consumedKeyIds] = await Promise.all([
    preKeyRepo.purgeUnconsumedOneTimePreKeys(identity._id, deviceId),
    preKeyRepo.getConsumedOtpkKeyIds(identity._id, deviceId),
  ]);

  return success({ purged, consumedKeyIds });
}

/**
 * GET /identity/:id/devices/:deviceId/pre-keys/count
 *
 * Get pre-key count information for a device.
 * Authenticated, owner only. Used to decide when to replenish.
 */
export async function getPreKeyCountCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  if (identity._id.toHexString() !== ctx.params.id) {
    return errors.forbidden('Cannot query pre-key count for another identity.');
  }

  const { deviceId } = ctx.params;
  if (!deviceId) {
    return errors.badRequest('Device ID is required.');
  }

  const devices = identity.devices ?? [];
  if (!devices.some((d) => d.deviceId === deviceId)) {
    return errors.notFound('Device not found.');
  }

  const preKeyRepo = getPreKeyRepository();
  const [signedPreKey, oneTimePreKeysRemaining, otpkDigest] = await Promise.all([
    preKeyRepo.getActiveSignedPreKey(identity._id, deviceId),
    preKeyRepo.countUnconsumedOneTimePreKeys(identity._id, deviceId),
    preKeyRepo.getUnconsumedOtpkDigest(identity._id, deviceId),
  ]);

  return success({
    signedPreKey: signedPreKey
      ? { keyId: signedPreKey.keyId, expiresAt: signedPreKey.expiresAt?.toISOString() ?? null }
      : null,
    oneTimePreKeysRemaining,
    otpkDigest,
  });
}
