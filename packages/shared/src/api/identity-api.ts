import type { ApiResponse } from '../types';
import type { HttpClient, RequestOptions } from './http-client';
import type {
  ChangePassphraseParams,
  CreateIdentityParams,
  EncryptedKeyBundle,
  IdentityLoginResponse,
  IdentityPublicKeys,
  InitializeE2EParams,
  LoginIdentityParams,
  PublicDevice,
  PublicIdentity,
  PublicIdentitySession,
  RegisterDeviceParams,
  PutDeviceStaticKeyAttestationParams,
  UpdateKeyBundleParams,
} from './identity-types';
import type {
  ClaimPreKeysParams,
  ClaimedDevicePreKeys,
  PreKeyCountResponse,
  UploadPreKeysParams,
} from './pre-keys-types';
import type { UpdateProfileParams } from './profile-update-types';

export class IdentityApi {
  constructor(private client: HttpClient) {}

  /**
   * Create a new identity.
   *
   * @param params - Identity creation parameters
   * @returns Created identity on success
   */
  async create(params: CreateIdentityParams): Promise<ApiResponse<PublicIdentity>> {
    return this.client.post('/api/identity', params);
  }

  /**
   * Login to an identity using passphrase.
   *
   * On success, sets an identity session cookie.
   *
   * @param params - Login parameters with passphrase
   * @returns Identity info on success, error with retry info on failure
   */
  async login(params: LoginIdentityParams): Promise<ApiResponse<IdentityLoginResponse>> {
    return this.client.post('/api/identity/login', params);
  }

  /**
   * Logout from the current identity session.
   *
   * Clears the identity session cookie.
   *
   * @returns Success on logout
   */
  async logout(): Promise<ApiResponse<void>> {
    return this.client.post('/api/identity/logout', {});
  }

  /**
   * Get the current identity session.
   *
   * @returns Current identity if logged in, error if not
   */
  async getSession(): Promise<ApiResponse<PublicIdentity>> {
    return this.client.get('/api/identity/session');
  }

  /**
   * Delete the current identity (soft delete).
   *
   * The identity record is preserved for historical purposes,
   * but the passphrase hash is cleared.
   *
   * @returns Success on deletion
   */
  async delete(): Promise<ApiResponse<void>> {
    return this.client.delete('/api/identity');
  }

  /**
   * Search for identities by username or display name.
   *
   * Public endpoint - no authentication required.
   *
   * @param query - Search query (min 2 characters)
   * @param limit - Max results (default: 10, max: 50)
   * @returns Array of matching identities
   */
  async search(query: string, limit?: number): Promise<ApiResponse<PublicIdentity[]>> {
    const params = new URLSearchParams({ q: query });
    if (limit !== undefined) {
      params.set('limit', limit.toString());
    }
    return this.client.get(`/api/identity/search?${params.toString()}`);
  }

  /**
   * Get a public identity by ID.
   *
   * Public endpoint - no authentication required.
   *
   * @param id - Identity ID
   * @returns Identity profile
   */
  async getById(id: string): Promise<ApiResponse<PublicIdentity>> {
    return this.client.get(`/api/identity/${encodeURIComponent(id)}`);
  }

  /**
   * Initialize E2E encryption for an identity.
   *
   * Atomic operation that sets up E2E: stores signing public key,
   * uploads encrypted bundle, and registers the first device.
   *
   * @param identityId - Identity ID
   * @param params - E2E initialization parameters
   * @returns Success on initialization
   */
  async initializeE2E(
    identityId: string,
    params: InitializeE2EParams
  ): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/identity/${encodeURIComponent(identityId)}/e2e/initialize`,
      params
    );
  }

  /**
   * Get public keys for an identity (for encryption).
   *
   * Returns the signing public key and all device keys.
   * Public endpoint - anyone can fetch keys to encrypt messages.
   *
   * @param identityId - Identity ID
   * @returns Public keys for E2E encryption
   */
  async getPublicKeys(
    identityId: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<IdentityPublicKeys>> {
    return this.client.get(
      `/api/identity/${encodeURIComponent(identityId)}/keys`,
      requestOptions
    );
  }

  /**
   * Get the encrypted key bundle for an identity.
   *
   * Only the identity owner can access their bundle.
   *
   * @param identityId - Identity ID
   * @returns Encrypted key bundle
   */
  async getKeyBundle(identityId: string): Promise<ApiResponse<EncryptedKeyBundle>> {
    return this.client.get(
      `/api/identity/${encodeURIComponent(identityId)}/bundle`
    );
  }

  /**
   * Update the encrypted key bundle.
   *
   * Used when rotating encryption or changing passphrase.
   *
   * @param identityId - Identity ID
   * @param params - New encrypted bundle data
   * @returns Success on update
   */
  async updateKeyBundle(
    identityId: string,
    params: UpdateKeyBundleParams
  ): Promise<ApiResponse<void>> {
    return this.client.put(
      `/api/identity/${encodeURIComponent(identityId)}/bundle`,
      params
    );
  }

  /**
   * Register a new device for E2E encryption.
   *
   * @param identityId - Identity ID
   * @param params - Device registration parameters
   * @returns Success on registration
   */
  async registerDevice(
    identityId: string,
    params: RegisterDeviceParams
  ): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/identity/${encodeURIComponent(identityId)}/devices`,
      params
    );
  }

  /**
   * List all devices for an identity.
   *
   * Only the identity owner can list their devices.
   *
   * @param identityId - Identity ID
   * @returns Object containing array of registered devices
   */
  async listDevices(identityId: string): Promise<ApiResponse<{ devices: PublicDevice[] }>> {
    return this.client.get(
      `/api/identity/${encodeURIComponent(identityId)}/devices`
    );
  }

  /**
   * Remove a device from an identity.
   *
   * @param identityId - Identity ID
   * @param deviceId - Device ID to remove
   * @returns Success on removal
   */
  async removeDevice(
    identityId: string,
    deviceId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/identity/${encodeURIComponent(identityId)}/devices/${encodeURIComponent(deviceId)}`
    );
  }

  /**
   * Update a device (name and/or activity).
   *
   * @param identityId - Identity ID
   * @param deviceId - Device ID to update
   * @param params - Update parameters
   * @returns Success on update
   */
  async updateDevice(
    identityId: string,
    deviceId: string,
    params: { name?: string; updateActivity?: boolean }
  ): Promise<ApiResponse<void>> {
    return this.client.patch(
      `/api/identity/${encodeURIComponent(identityId)}/devices/${encodeURIComponent(deviceId)}`,
      params
    );
  }

  /**
   * Upload Ed25519 attestation over this device's static public keys (device-trust v3).
   */
  async putDeviceStaticKeyAttestation(
    identityId: string,
    deviceId: string,
    params: PutDeviceStaticKeyAttestationParams
  ): Promise<ApiResponse<{ updated: boolean }>> {
    return this.client.put(
      `/api/identity/${encodeURIComponent(identityId)}/devices/${encodeURIComponent(deviceId)}/static-key-attestation`,
      params
    );
  }

  /**
   * Update device activity (heartbeat).
   *
   * @param identityId - Identity ID
   * @param deviceId - Device ID
   * @returns Success on update
   */
  async updateDeviceActivity(
    identityId: string,
    deviceId: string
  ): Promise<ApiResponse<void>> {
    return this.client.patch(
      `/api/identity/${encodeURIComponent(identityId)}/devices/${encodeURIComponent(deviceId)}`,
      { updateActivity: true }
    );
  }

  /**
   * Rename a device.
   *
   * @param identityId - Identity ID
   * @param deviceId - Device ID
   * @param name - New device name
   * @returns Success on update
   */
  async renameDevice(
    identityId: string,
    deviceId: string,
    name: string
  ): Promise<ApiResponse<void>> {
    return this.client.patch(
      `/api/identity/${encodeURIComponent(identityId)}/devices/${encodeURIComponent(deviceId)}`,
      { name }
    );
  }

  /**
   * Upload pre-keys for a device (signed pre-key and/or one-time pre-keys).
   */
  async uploadPreKeys(
    identityId: string,
    deviceId: string,
    params: UploadPreKeysParams
  ): Promise<ApiResponse<{ storedSignedPreKey: boolean; storedOneTimePreKeys: number }>> {
    return this.client.post(
      `/api/identity/${encodeURIComponent(identityId)}/devices/${encodeURIComponent(deviceId)}/pre-keys`,
      params
    );
  }

  /**
   * Claim pre-keys for all (or specified) devices of an identity.
   * Used by senders before encrypting a message.
   */
  async claimPreKeys(
    identityId: string,
    params?: ClaimPreKeysParams,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<{ devices: ClaimedDevicePreKeys[] }>> {
    return this.client.post(
      `/api/identity/${encodeURIComponent(identityId)}/pre-keys/claim`,
      params ?? {},
      requestOptions
    );
  }

  /**
   * Get remaining pre-key counts for a device.
   */
  async getPreKeyCount(
    identityId: string,
    deviceId: string
  ): Promise<ApiResponse<PreKeyCountResponse>> {
    return this.client.get(
      `/api/identity/${encodeURIComponent(identityId)}/devices/${encodeURIComponent(deviceId)}/pre-keys/count`
    );
  }

  /**
   * Purge all unconsumed one-time pre-keys for a device on the server.
   * Used to reset the OTPK pool when local and server state have diverged.
   */
  async purgeOneTimePreKeys(
    identityId: string,
    deviceId: string
  ): Promise<ApiResponse<{ purged: number; consumedKeyIds: string[] }>> {
    return this.client.delete(
      `/api/identity/${encodeURIComponent(identityId)}/devices/${encodeURIComponent(deviceId)}/pre-keys/one-time`
    );
  }

  /**
   * List all identity sessions.
   *
   * @param identityId - Identity ID
   * @returns Object containing array of active sessions
   */
  async listSessions(
    identityId: string
  ): Promise<ApiResponse<{ sessions: PublicIdentitySession[] }>> {
    return this.client.get(
      `/api/identity/${encodeURIComponent(identityId)}/sessions`
    );
  }

  /**
   * Revoke a specific identity session.
   * Cannot revoke the current session.
   *
   * @param identityId - Identity ID
   * @param sessionId - Session ID to revoke
   * @returns Success on revocation
   */
  async revokeIdentitySession(
    identityId: string,
    sessionId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/identity/${encodeURIComponent(identityId)}/sessions/${encodeURIComponent(sessionId)}`
    );
  }

  /**
   * Revoke all other identity sessions (except the current one).
   *
   * @param identityId - Identity ID
   * @returns Count of revoked sessions
   */
  async revokeAllOtherIdentitySessions(
    identityId: string
  ): Promise<ApiResponse<{ count: number }>> {
    return this.client.delete(
      `/api/identity/${encodeURIComponent(identityId)}/sessions`
    );
  }

  /**
   * Update own profile (display name, bio, avatar, banner, colours, privacy).
   */
  async updateProfile(
    params: UpdateProfileParams
  ): Promise<ApiResponse<PublicIdentity>> {
    return this.client.patch('/api/identity/me/profile', params);
  }

  /**
   * Get a privacy-filtered profile for an identity.
   *
   * Fields are filtered server-side based on the viewer's relationship
   * to the profile owner (self, friend, or stranger).
   */
  async getProfile(identityId: string): Promise<ApiResponse<PublicIdentity>> {
    return this.client.get(
      `/api/identity/${encodeURIComponent(identityId)}/profile`
    );
  }

  /**
   * Change the identity passphrase.
   *
   * The client must re-encrypt the key bundle with the new passphrase
   * before calling this endpoint.
   */
  async changePassphrase(
    params: ChangePassphraseParams,
  ): Promise<ApiResponse<void>> {
    return this.client.post('/api/identity/change-passphrase', params);
  }

  /**
   * Fetch encrypted key bundle using account session + passphrase proof.
   *
   * Used during passphrase change flows when signed into the account
   * (not the alias). The signedToken proves account ownership and the
   * passphrase is used server-side to derive the bundle lookup key.
   */
  async bundleByPassphrase(
    params: { signedToken: string; passphrase: string },
  ): Promise<ApiResponse<EncryptedKeyBundle>> {
    return this.client.post('/api/identity/bundle-by-passphrase', params);
  }
}
