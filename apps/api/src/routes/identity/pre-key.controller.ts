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
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getPreKeyRepository } from '../../repositories/pre-key.repository';
import { toIdentityPublicKeys } from '../../models/identity';
import { MAX_OTPK_BATCH_SIZE, MAX_OTPK_PER_DEVICE } from '../../models/pre-key';
import { sanitizeObjectId, sanitizeString } from '../../utils/sanitize';
import { z } from '@adieuu/shared/schemas';
import { verifySignedPreKey, fromBase64, type SignedPreKeyPublic } from '@adieuu/crypto';
import { canViewerAccessTargetIdentityKeys } from '../../services/identity-keys-access.service';
import { checkRateLimit } from '../../services/rate-limit.service';

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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot upload pre-keys for another identity.');
  }

  const rawDeviceId = ctx.params.deviceId;
  const deviceId = sanitizeString(rawDeviceId ?? '', 'general').value;
  if (!deviceId || !rawDeviceId) {
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
 * Authenticated; caller must be self, friend, or share a conversation with target.
 *
 * Atomically consumes one OTPK per device. Returns signed pre-key
 * as fallback if no OTPKs are available.
 */
export async function claimPreKeysCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const callerIdentity = ctx.identitySession.identity;

  const parsedId = sanitizeObjectId(ctx.params.id);
  if (!parsedId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }

  // Rate limit claims per caller and per caller-target pair so a single
  // authenticated caller cannot drain one-time pre-key pools.
  const callerId = callerIdentity._id.toHexString();
  const [callerLimit, pairLimit] = await Promise.all([
    checkRateLimit('prekeys:claim:identity', callerId),
    checkRateLimit('prekeys:claim:target', `${callerId}:${parsedId.id}`),
  ]);
  if (!callerLimit.allowed || !pairLimit.allowed) {
    return ctx.errors.rateLimited();
  }

  const identityRepo = getIdentityRepository();
  const targetIdentity = await identityRepo.findByIdentityId(parsedId.id);
  if (!targetIdentity) {
    return errors.notFound('Identity not found.');
  }

  const canAccess = await canViewerAccessTargetIdentityKeys(
    callerIdentity._id,
    targetIdentity._id
  );
  if (!canAccess) {
    return errors.forbidden('Cannot claim pre-keys for this identity.');
  }

  const includeDeviceNames = callerIdentity._id.equals(targetIdentity._id);
  const publicKeys = toIdentityPublicKeys(targetIdentity, { includeDeviceNames });
  if (!publicKeys) {
    return errors.notFound('Identity has not set up E2E encryption.');
  }

  const parseResult = ClaimPreKeysSchema.safeParse(ctx.body ?? {});
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { deviceIds } = parseResult.data;

  const normalizedRequested = deviceIds?.map((d) => sanitizeString(d, 'general').value).filter(Boolean) as string[] | undefined;

  // Get all device IDs for the target identity, or filter by requested ones
  const allDeviceIds = publicKeys.devices.map((d) => d.deviceId);
  const targetDeviceIds = normalizedRequested?.length
    ? allDeviceIds.filter((did) => normalizedRequested.includes(did))
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot purge pre-keys for another identity.');
  }

  const rawDeviceId = ctx.params.deviceId;
  const deviceId = sanitizeString(rawDeviceId ?? '', 'general').value;
  if (!deviceId || !rawDeviceId) {
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const routeId = sanitizeObjectId(ctx.params.id);
  if (!routeId.ok) {
    return errors.badRequest('Invalid identity ID.');
  }
  if (identity._id.toHexString() !== routeId.id) {
    return errors.forbidden('Cannot query pre-key count for another identity.');
  }

  const rawDeviceId = ctx.params.deviceId;
  const deviceId = sanitizeString(rawDeviceId ?? '', 'general').value;
  if (!deviceId || !rawDeviceId) {
    return errors.badRequest('Device ID is required.');
  }

  const devices = identity.devices ?? [];
  if (!devices.some((d) => d.deviceId === deviceId)) {
    return errors.notFound('Device not found.');
  }

  const preKeyRepo = getPreKeyRepository();
  const [signedPreKey, oneTimePreKeysRemaining, otpkDigest, consumedOtpkKeyIds] = await Promise.all([
    preKeyRepo.getActiveSignedPreKey(identity._id, deviceId),
    preKeyRepo.countUnconsumedOneTimePreKeys(identity._id, deviceId),
    preKeyRepo.getUnconsumedOtpkDigest(identity._id, deviceId),
    preKeyRepo.getConsumedOtpkKeyIds(identity._id, deviceId),
  ]);

  return success({
    signedPreKey: signedPreKey
      ? { keyId: signedPreKey.keyId, expiresAt: signedPreKey.expiresAt?.toISOString() ?? null }
      : null,
    oneTimePreKeysRemaining,
    otpkDigest,
    consumedOtpkKeyIds,
  });
}
