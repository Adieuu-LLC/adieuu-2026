/**
 * Identity routes module.
 *
 * Provides endpoints for anonymous identity management including creation,
 * login, logout, deletion, and blocklist management.
 *
 * @module routes/identity
 *
 * SECURITY ARCHITECTURE:
 * - All identity routes require an authenticated user session
 * - Identities are cryptographically unlinkable to users
 * - Rate limiting with progressive backoff prevents brute force attacks
 * - Lockout notifications alert users to potential attack attempts
 *
 * PRIVACY NOTES (Blocklist):
 * - Blocks are invisible to the blocked party
 * - Only the blocker can see their block list
 * - Cannot check if someone has blocked you
 */

import { Router } from '../../router';
import {
  searchIdentitiesCtrl,
  getIdentityByIdCtrl,
  createIdentityCtrl,
  loginIdentityCtrl,
  logoutIdentityCtrl,
  getIdentitySessionCtrl,
  deleteIdentityCtrl,
  getBlocklistCtrl,
  addToBlocklistCtrl,
  removeFromBlocklistCtrl,
  checkBlocklistCtrl,
  registerDeviceCtrl,
  getIdentityKeysCtrl,
  storeKeyBundleCtrl,
  getKeyBundleCtrl,
  listDevicesCtrl,
  removeDeviceCtrl,
  updateDeviceCtrl,
  putDeviceStaticKeyAttestationCtrl,
  initializeE2ECtrl,
  listIdentitySessionsCtrl,
  revokeIdentitySessionCtrl,
  revokeAllOtherIdentitySessionsCtrl,
  changePassphraseCtrl,
  getBundleByPassphraseCtrl,
} from './controller';
import {
  uploadPreKeysCtrl,
  claimPreKeysCtrl,
  getPreKeyCountCtrl,
  purgeOneTimePreKeysCtrl,
} from './pre-key.controller';
import {
  updateProfileCtrl,
  getProfileCtrl,
} from './profile.controller';
import {
  getIdentityPreferencesCtrl,
  putIdentityPreferencesCtrl,
} from './preferences.controller';
import {
  getIdentityAchievementsForTargetResult,
  respondIdentityAchievementsForTarget,
} from '../achievements/controller';

const router = new Router();

// ============================================================================
// Identity Search
// ============================================================================

/**
 * GET /identity/search - Search for identities
 *
 * Endpoint for searching identities by username or display name.
 * Returns public identity information only.
 * If the caller has an identity session, blocked identities are filtered out.
 *
 * @route GET /api/identity/search
 *
 * @queryParam q (string, required): Search query (min 2 characters)
 * @queryParam limit (number, optional): Max results (default: 10, max: 50)
 *
 * @returns 200 OK with array of matching identities
 * @returns 400 Bad Request if query is too short
 */
router.get('/identity/search', async (ctx) => {
  return await searchIdentitiesCtrl(ctx);
});

// ============================================================================
// Identity Session
// ============================================================================

/**
 * GET /identity/session - Get current identity session
 *
 * Returns the current identity's public profile if logged in.
 *
 * @route GET /api/identity/session
 *
 * @returns 200 OK with identity profile
 * @returns 401 Unauthorized if not logged into an identity
 */
router.get('/identity/session', async (ctx) => {
  return await getIdentitySessionCtrl(ctx);
});

// ============================================================================
// Blocklist Management
// ============================================================================

/**
 * GET /identity/blocklist - Get list of blocked identities
 *
 * Returns the list of identities blocked by the current identity.
 * Uses cursor-based pagination.
 *
 * @route GET /api/identity/blocklist
 *
 * @queryParam limit (number, optional): Max results (default: 50, max: 100)
 * @queryParam cursor (string, optional): Pagination cursor
 *
 * @returns 200 OK with array of blocked identities and pagination cursor
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/identity/blocklist', async (ctx) => {
  return await getBlocklistCtrl(ctx);
});

/**
 * POST /identity/blocklist - Block an identity
 *
 * Blocks the specified identity. Side effects:
 * - Any existing friendship is removed (both directions)
 * - Any pending friend requests between the identities are cancelled/ignored
 * - Future friend requests from blocked identity are silently ignored
 *
 * @route POST /api/identity/blocklist
 *
 * @requestBody
 * - `identityId` (string, required): The identity ID to block
 *
 * @returns 200 OK with success message
 * @returns 400 Bad Request if cannot block yourself or already blocked
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if identity doesn't exist
 */
router.post('/identity/blocklist', async (ctx) => {
  return await addToBlocklistCtrl(ctx);
});

/**
 * GET /identity/blocklist/check/:identityId - Check if an identity is blocked
 *
 * Checks if the current identity has blocked the specified identity.
 * NOTE: This only checks if YOU have blocked them, not if they blocked you.
 *
 * @route GET /api/identity/blocklist/check/:identityId
 *
 * @param identityId (string, required): The identity ID to check
 *
 * @returns 200 OK with blocked status
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/identity/blocklist/check/:identityId', async (ctx) => {
  return await checkBlocklistCtrl(ctx);
});

/**
 * DELETE /identity/blocklist/:identityId - Unblock an identity
 *
 * Removes the block on the specified identity.
 *
 * @route DELETE /api/identity/blocklist/:identityId
 *
 * @param identityId (string, required): The identity ID to unblock
 *
 * @returns 200 OK with success message
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if block doesn't exist
 */
router.delete('/identity/blocklist/:identityId', async (ctx) => {
  return await removeFromBlocklistCtrl(ctx);
});

// ============================================================================
// Identity CRUD
// ============================================================================

/**
 * POST /identity - Create a new identity
 *
 * Creates a new anonymous identity for the authenticated user.
 * The identity is cryptographically unlinkable to the user.
 *
 * @route POST /api/identity
 *
 * @requestBody
 * - `passphrase` (string, required): Min 8 characters
 * - `username` (string, required): 3-30 chars, alphanumeric + underscores/hyphens
 * - `displayName` (string, required): 1-50 characters
 *
 * @returns 200 OK with identity data
 * @returns 400 Bad Request if validation fails
 * @returns 401 Unauthorized if not authenticated
 * @returns 409 Conflict if username is taken or max identities reached
 */
router.post('/identity', async (ctx) => {
  return await createIdentityCtrl(ctx);
});

/**
 * POST /identity/change-passphrase - Change password for an existing alias
 *
 * Changes the alias' password (ident hash) and migrates the encrypted
 * key bundle. The client must re-encrypt the key bundle with the new
 * passphrase before calling this endpoint.
 *
 * @route POST /api/identity/change-passphrase
 *
 * @requestBody
 * - `signedToken` (string, required): Bridging token for accountHash
 * - `currentPassphrase` (string, required): Current passphrase for verification
 * - `newPassphrase` (string, required): New passphrase (min 8 characters)
 * - `newEncryptedBundle` (string, required): Bundle re-encrypted with new passphrase
 * - `newBundleSalt` (string, required): New Argon2id salt (base64)
 * - `newBundleNonce` (string, required): New ChaCha20-Poly1305 nonce (base64)
 *
 * @returns 200 OK on success
 * @returns 401 Unauthorized if current passphrase is invalid or not authenticated
 * @returns 400 Bad Request if validation fails
 */
router.post('/identity/change-passphrase', async (ctx) => {
  return await changePassphraseCtrl(ctx);
});

/**
 * POST /identity/bundle-by-passphrase - Fetch encrypted key bundle via account session
 *
 * Allows account-session users to retrieve their alias's encrypted key bundle
 * by proving passphrase knowledge. Used during passphrase change flows when
 * the user is signed into their account (not their alias).
 *
 * @route POST /api/identity/bundle-by-passphrase
 *
 * @requestBody
 * - `signedToken` (string, required): Bridging token for accountHash
 * - `passphrase` (string, required): Current alias passphrase
 *
 * @returns 200 OK with encrypted bundle data
 * @returns 401 Unauthorized if not authenticated or token invalid
 * @returns 404 Not Found if bundle does not exist
 */
router.post('/identity/bundle-by-passphrase', async (ctx) => {
  return await getBundleByPassphraseCtrl(ctx);
});

/**
 * POST /identity/login - Login to an identity
 *
 * Authenticates to an identity using the passphrase.
 * Creates an identity session cookie on success.
 *
 * @route POST /api/identity/login
 *
 * @requestBody
 * - `passphrase` (string, required): The identity passphrase
 *
 * @returns 200 OK with identity data and session cookie
 * @returns 401 Unauthorized if passphrase is invalid
 * @returns 429 Too Many Requests if rate limited or locked out
 */
router.post('/identity/login', async (ctx) => {
  return await loginIdentityCtrl(ctx);
});

/**
 * POST /identity/logout - Logout from identity
 *
 * Revokes the current identity session and clears the identity cookie.
 *
 * @route POST /api/identity/logout
 *
 * @returns 200 OK with cleared identity cookie
 */
router.post('/identity/logout', async (ctx) => {
  return await logoutIdentityCtrl(ctx);
});

/**
 * DELETE /identity - Delete the current identity
 *
 * Soft-deletes the current identity. The identity record remains
 * for historical references (chats, posts) but the ident hash is cleared.
 *
 * @route DELETE /api/identity
 *
 * @returns 200 OK with cleared identity cookie
 * @returns 401 Unauthorized if not logged into an identity
 */
router.delete('/identity', async (ctx) => {
  return await deleteIdentityCtrl(ctx);
});

// ============================================================================
// E2E Encryption
// ============================================================================

/**
 * POST /identity/:id/e2e/initialize - Initialize E2E encryption for an identity
 *
 * Atomic operation that sets up E2E encryption: creates the signing key,
 * stores the encrypted bundle, and registers the first device.
 *
 * @route POST /api/identity/:id/e2e/initialize
 *
 * @requestBody
 * - `signingPublicKey` (string): Ed25519 signing public key (base64)
 * - `preferredCryptoProfile` (string, optional): 'default' or 'cnsa2'
 * - `device` (object): First device to register
 * - `bundle` (object): Encrypted signing key bundle
 *
 * @returns 200 OK on success
 * @returns 400 Bad Request if already initialized or invalid data
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to initialize for another identity
 */
router.post('/identity/:id/e2e/initialize', async (ctx) => {
  return await initializeE2ECtrl(ctx);
});

/**
 * GET /identity/:id/keys - Get public keys for an identity
 *
 * Returns signing key, device keys, and active signed pre-keys per device (when present).
 * Requires an identity session; caller must be self, friend, or share a conversation
 * with the target (blocked pairs denied).
 *
 * @route GET /api/identity/:id/keys
 *
 * @returns 200 OK with public keys
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if not allowed to view target keys
 * @returns 404 Not Found if identity has no E2E keys
 */
router.get('/identity/:id/keys', async (ctx) => {
  return await getIdentityKeysCtrl(ctx);
});

/**
 * GET /identity/:id/bundle - Get the encrypted key bundle
 *
 * Returns the encrypted signing key bundle for the identity.
 * Only the identity owner can access their bundle.
 *
 * @route GET /api/identity/:id/bundle
 *
 * @returns 200 OK with encrypted bundle
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to access another identity's bundle
 * @returns 404 Not Found if no bundle exists
 */
router.get('/identity/:id/bundle', async (ctx) => {
  return await getKeyBundleCtrl(ctx);
});

/**
 * PUT /identity/:id/bundle - Store or update the encrypted key bundle
 *
 * Stores the encrypted signing key bundle. Can be used to update
 * the bundle when rotating encryption or changing passphrase.
 *
 * @route PUT /api/identity/:id/bundle
 *
 * @requestBody
 * - `encryptedBundle` (string): Encrypted signing key (base64)
 * - `salt` (string): Argon2id salt (base64)
 * - `nonce` (string): AES-GCM nonce (base64)
 *
 * @returns 200 OK on success
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to store for another identity
 */
router.put('/identity/:id/bundle', async (ctx) => {
  return await storeKeyBundleCtrl(ctx);
});

/**
 * GET /identity/:id/devices - List all devices for an identity
 *
 * Returns all registered devices with their public keys.
 * Only the identity owner can list their devices.
 *
 * @route GET /api/identity/:id/devices
 *
 * @returns 200 OK with device list
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to access another identity's devices
 */
router.get('/identity/:id/devices', async (ctx) => {
  return await listDevicesCtrl(ctx);
});

/**
 * POST /identity/:id/devices - Register a new device
 *
 * Registers a new device with its ECDH/KEM public keys.
 *
 * @route POST /api/identity/:id/devices
 *
 * @requestBody
 * - `deviceId` (string): UUID for the device
 * - `name` (string): Human-readable device name
 * - `ecdhPublicKey` (string): X25519 public key (base64)
 * - `kemPublicKey` (string, optional): ML-KEM public key (base64)
 *
 * @returns 200 OK on success
 * @returns 400 Bad Request if device already registered
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to register for another identity
 */
router.post('/identity/:id/devices', async (ctx) => {
  return await registerDeviceCtrl(ctx);
});

/**
 * DELETE /identity/:id/devices/:deviceId - Remove a device
 *
 * Removes a registered device. Cannot remove the last device.
 *
 * @route DELETE /api/identity/:id/devices/:deviceId
 *
 * @returns 200 OK on success
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to remove for another identity
 * @returns 404 Not Found if device doesn't exist
 */
router.delete('/identity/:id/devices/:deviceId', async (ctx) => {
  return await removeDeviceCtrl(ctx);
});

/**
 * PATCH /identity/:id/devices/:deviceId - Update a device
 *
 * Updates device properties (name, activity).
 *
 * @route PATCH /api/identity/:id/devices/:deviceId
 *
 * @requestBody
 * - `name` (string, optional): New device name (1-100 chars)
 * - `updateActivity` (boolean, optional): If true, updates lastActiveAt to now
 *
 * @returns 200 OK on success
 * @returns 400 Bad Request if name is invalid
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to update for another identity
 * @returns 404 Not Found if device doesn't exist
 */
router.patch('/identity/:id/devices/:deviceId', async (ctx) => {
  return await updateDeviceCtrl(ctx);
});

/**
 * PUT /identity/:id/devices/:deviceId/static-key-attestation
 *
 * Stores Ed25519 attestation over the device's static ECDH/KEM keys (device-trust v3).
 *
 * @route PUT /api/identity/:id/devices/:deviceId/static-key-attestation
 */
router.put('/identity/:id/devices/:deviceId/static-key-attestation', async (ctx) => {
  return await putDeviceStaticKeyAttestationCtrl(ctx);
});

// ============================================================================
// Pre-Keys (Forward Secrecy)
// ============================================================================

/**
 * POST /identity/:id/devices/:deviceId/pre-keys - Upload pre-keys
 *
 * Upload signed pre-key and/or one-time pre-keys for a device.
 * Signed pre-keys provide medium-term forward secrecy (rotated periodically).
 * One-time pre-keys provide per-message forward secrecy (consumed once).
 *
 * @route POST /api/identity/:id/devices/:deviceId/pre-keys
 *
 * @requestBody
 * - `signedPreKey` (object, optional): Signed pre-key with keyId, ecdhPublicKey, kemPublicKey, signature
 * - `oneTimePreKeys` (array, optional): Batch of one-time pre-keys (max 200)
 * - `signedPreKeyExpiresInDays` (number, optional): SPK expiry in days (default: 7, max: 90)
 *
 * @returns 200 OK with counts of stored keys
 * @returns 400 Bad Request if validation fails or OTPK capacity reached
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to upload for another identity
 * @returns 404 Not Found if device doesn't exist
 */
router.post('/identity/:id/devices/:deviceId/pre-keys', async (ctx) => {
  return await uploadPreKeysCtrl(ctx);
});

/**
 * POST /identity/:id/pre-keys/claim - Claim pre-keys for sending
 *
 * Claims one one-time pre-key per device (atomically consumed).
 * Also returns the active signed pre-key for each device.
 * Any authenticated identity can claim (needed for sending DMs).
 *
 * @route POST /api/identity/:id/pre-keys/claim
 *
 * @requestBody
 * - `deviceIds` (string[], optional): Specific devices to claim for (default: all)
 *
 * @returns 200 OK with claimed pre-keys per device
 * @returns 400 Bad Request if no matching devices
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if identity doesn't exist or has no E2E keys
 */
router.post('/identity/:id/pre-keys/claim', async (ctx) => {
  return await claimPreKeysCtrl(ctx);
});

/**
 * GET /identity/:id/devices/:deviceId/pre-keys/count - Get pre-key counts
 *
 * Returns remaining pre-key counts for a device.
 * Used by the device to decide when to upload more pre-keys.
 *
 * @route GET /api/identity/:id/devices/:deviceId/pre-keys/count
 *
 * @returns 200 OK with signed pre-key info and OTPK count
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to query another identity
 * @returns 404 Not Found if device doesn't exist
 */
router.get('/identity/:id/devices/:deviceId/pre-keys/count', async (ctx) => {
  return await getPreKeyCountCtrl(ctx);
});

/**
 * DELETE /identity/:id/devices/:deviceId/pre-keys/one-time - Purge unconsumed OTPKs
 *
 * Deletes all unconsumed one-time pre-keys for a device, resetting the
 * server-side pool. Used when local and server OTPK state have diverged.
 * After purging, the client should upload a fresh batch.
 *
 * @route DELETE /api/identity/:id/devices/:deviceId/pre-keys/one-time
 *
 * @returns 200 OK with count of purged OTPKs
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to purge for another identity
 * @returns 404 Not Found if device doesn't exist
 */
router.delete('/identity/:id/devices/:deviceId/pre-keys/one-time', async (ctx) => {
  return await purgeOneTimePreKeysCtrl(ctx);
});

// ============================================================================
// Identity Session Management
// ============================================================================

/**
 * GET /identity/:id/sessions - List all identity sessions
 *
 * Returns all active sessions for the identity.
 * Only the identity owner can list their sessions.
 *
 * @route GET /api/identity/:id/sessions
 *
 * @returns 200 OK with session list
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to access another identity's sessions
 */
router.get('/identity/:id/sessions', async (ctx) => {
  return await listIdentitySessionsCtrl(ctx);
});

/**
 * DELETE /identity/:id/sessions/:sessionId - Revoke a specific identity session
 *
 * Revokes a single session. Cannot revoke the current session.
 *
 * @route DELETE /api/identity/:id/sessions/:sessionId
 *
 * @returns 200 OK on success
 * @returns 400 Bad Request if trying to revoke current session
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to revoke for another identity
 * @returns 404 Not Found if session doesn't exist
 */
router.delete('/identity/:id/sessions/:sessionId', async (ctx) => {
  return await revokeIdentitySessionCtrl(ctx);
});

/**
 * DELETE /identity/:id/sessions - Revoke all other identity sessions
 *
 * Revokes all sessions except the current one.
 *
 * @route DELETE /api/identity/:id/sessions
 *
 * @returns 200 OK with count of revoked sessions
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if trying to revoke for another identity
 */
router.delete('/identity/:id/sessions', async (ctx) => {
  return await revokeAllOtherIdentitySessionsCtrl(ctx);
});

// ============================================================================
// Identity Profile Management
// ============================================================================

/**
 * PATCH /identity/me/profile - Update own profile
 *
 * Updates profile fields including displayName, bio, avatar, banner,
 * profileColors, and privacySettings. Avatar/banner updates accept a
 * mediaId from the upload service.
 *
 * @route PATCH /api/identity/me/profile
 *
 * @requestBody
 * - `displayName` (string, optional): 1-50 characters
 * - `bio` (string, optional): max 160 characters
 * - `avatarMediaId` (string, optional): mediaId from upload service
 * - `bannerMediaId` (string, optional): mediaId from upload service
 * - `removeAvatar` (boolean, optional): remove current avatar
 * - `removeBanner` (boolean, optional): remove current banner
 * - `profileColors` (object, optional): { primary?, secondary?, accent? } hex strings
 * - `privacySettings` (object, optional): per-field visibility (public/friends/private)
 *
 * @returns 200 OK with updated identity profile
 * @returns 400 Bad Request if validation fails
 * @returns 401 Unauthorized if not authenticated
 */
router.patch('/identity/me/profile', async (ctx) => {
  return await updateProfileCtrl(ctx);
});

// ============================================================================
// Identity encrypted preferences (opaque blobs)
// ============================================================================

/**
 * GET /identity/me/preferences
 *
 * @route GET /api/identity/me/preferences
 * @query prefsId — derived preferences identifier
 */
router.get('/identity/me/preferences', async (ctx) => {
  return await getIdentityPreferencesCtrl(ctx);
});

/**
 * PUT /identity/me/preferences
 *
 * @route PUT /api/identity/me/preferences
 */
router.put('/identity/me/preferences', async (ctx) => {
  return await putIdentityPreferencesCtrl(ctx);
});

/**
 * GET /identity/:id/profile - Get privacy-filtered profile
 *
 * Returns the identity's profile with fields filtered according to
 * the viewer's relationship (self, friend, or stranger).
 *
 * @route GET /api/identity/:id/profile
 *
 * @param id (string, required): Identity ID
 *
 * @returns 200 OK with filtered profile
 * @returns 404 Not Found if identity doesn't exist
 */
router.get('/identity/:id/profile', async (ctx) => {
  return await getProfileCtrl(ctx);
});

// ============================================================================
// Identity Achievements (privacy-gated)
// ============================================================================

/**
 * GET /identity/:id/achievements - Get an identity's achievements
 *
 * Returns the achievements earned by this identity. Respects the identity's
 * achievements privacy setting (public/friends/private).
 *
 * @route GET /api/identity/:id/achievements
 * @param id (string, required): Identity ID
 *
 * @returns 200 OK with achievements array
 * @returns 404 Not Found if identity doesn't exist
 */
router.get('/identity/:id/achievements', async (ctx) => {
  const viewerId = ctx.identitySession?.identity._id ?? null;
  const result = await getIdentityAchievementsForTargetResult(ctx.params.id, viewerId);
  return respondIdentityAchievementsForTarget(ctx, result);
});

// ============================================================================
// Identity by ID (parameterized - must be last)
// ============================================================================

/**
 * GET /identity/:id - Get a public identity by ID
 *
 * Public endpoint for fetching a specific identity's public profile.
 * NOTE: This route must be defined last as it matches any path segment.
 *
 * @route GET /api/identity/:id
 *
 * @param id (string, required): Identity ID
 *
 * @returns 200 OK with identity profile
 * @returns 404 Not Found if identity doesn't exist
 */
router.get('/identity/:id', async (ctx) => {
  return await getIdentityByIdCtrl(ctx);
});

export const identityRoutes = router;
