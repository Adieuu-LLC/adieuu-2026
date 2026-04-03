/**
 * API Client for Adieuu
 *
 * A minimal, type-safe API client for communicating with the Adieuu API.
 * Supports both browser and Node.js environments.
 */

import type { ApiResponse } from '../types';

export interface ApiClientConfig {
  baseUrl: string;
  /** Default headers to include in all requests */
  headers?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface RequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Signal for aborting the request */
  signal?: AbortSignal;
}

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;

  constructor(config: ApiClientConfig) {
    // Remove trailing slash from baseUrl
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.timeout = config.timeout ?? 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...this.defaultHeaders,
      ...options?.headers,
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal ?? controller.signal,
        credentials: 'include', // Include cookies for session management
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      return data as ApiResponse<T>;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            error: {
              code: 'TIMEOUT',
              message: 'Request timed out',
            },
          };
        }

        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: error.message || 'Network error',
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unknown error occurred',
        },
      };
    }
  }

  async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

// ============================================================================
// Auth API Methods
// ============================================================================

export interface RequestOtpParams {
  identifier: string;
  type: 'email' | 'sms';
}

export interface VerifyOtpParams {
  identifier: string;
  code: string;
}

/**
 * Response from OTP verification.
 * May indicate MFA is required.
 */
export interface VerifyOtpResponse {
  /** If true, MFA verification is required before session is created */
  mfaRequired?: boolean;
  /** Token to use for MFA verification (only if mfaRequired) */
  mfaToken?: string;
  /** Available MFA options */
  mfaOptions?: {
    totp: boolean;
    webauthn: boolean;
    backupCodes: boolean;
  };
  /** WebAuthn challenge options (only if webauthn is available) */
  webauthnChallenge?: PublicKeyCredentialRequestOptionsJSON;
}

/**
 * PublicKeyCredentialRequestOptionsJSON from WebAuthn
 */
export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: Array<{ id: string; type: 'public-key'; transports?: string[] }>;
  userVerification?: 'discouraged' | 'preferred' | 'required';
}

/**
 * Session info returned from /auth/session endpoint.
 * Note: The actual session token is stored in HTTP-only cookies,
 * not exposed to JavaScript.
 */
export interface SessionInfo {
  identifier: string;
  identifierType: 'email' | 'phone';
  /** Number of identities the user has created */
  identityCount: number;
  /** Maximum number of identities allowed */
  maxIdentities: number;
  /** Whether this user can access platform admin APIs and UI */
  isPlatformAdmin: boolean;
}

/**
 * Detailed session info for session management.
 */
export interface SessionDetails {
  /** Session ID (for revocation) */
  id: string;
  /** User identifier (email or phone) */
  identifier: string;
  /** Identifier type */
  identifierType: 'email' | 'phone';
  /** When the session was created */
  createdAt: string;
  /** Last activity timestamp */
  lastActivityAt: string;
  /** User agent (browser/device info) */
  userAgent?: string;
  /** IP address (partially masked for privacy) */
  ipAddress?: string;
  /** Whether this is the current session */
  isCurrent?: boolean;
}

/**
 * Response from revoking sessions.
 */
export interface RevokeSessionsResponse {
  revokedCount: number;
}

/**
 * Avatar data for rendering deterministic avatars.
 */
export interface AvatarInfo {
  /** Background color (hex) */
  backgroundColor: string;
  /** Skin tone color (hex) */
  skinColor: string;
  /** Hair color (hex) */
  hairColor: string;
  /** Hair style index (0-4) */
  hairStyle: number;
  /** Face shape index (0-3) */
  faceShape: number;
  /** Eye style index (0-3) */
  eyeStyle: number;
  /** Accessory index (0-3, 0 = none) */
  accessory: number;
  /** Facial hair index (0-4, 0 = none) */
  facialHair: number;
  /** Hash used to generate the avatar */
  hash: string;
}

/**
 * User profile returned from /users/me endpoint.
 */
export interface UserProfile {
  id: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  displayName?: string;
  createdAt: string;
  lastLoginAt?: string;
  avatar?: AvatarInfo;
}

/**
 * @deprecated Use SessionInfo instead - sessions are now cookie-based
 */
export interface AuthSession {
  accessToken: string;
  expiresIn: number;
}

export class AuthApi {
  constructor(private client: ApiClient) { }

  /**
   * Request an OTP for passwordless authentication.
   *
   * @param params - The identifier (email/phone) and delivery type
   * @returns Success when a code may be sent; **403** if the platform auth allowlist blocks this identifier.
   */
  async requestOtp(params: RequestOtpParams): Promise<ApiResponse<void>> {
    return this.client.post('/api/auth/request', params);
  }

  /**
   * Verify an OTP code.
   *
   * On success, either sets a session cookie (login complete) or
   * returns MFA challenge data if MFA is enabled.
   *
   * @param params - The identifier and OTP code
   * @returns Success with optional MFA challenge, or error on failure; **403** if the platform auth allowlist blocks this identifier.
   */
  async verifyOtp(params: VerifyOtpParams): Promise<ApiResponse<VerifyOtpResponse>> {
    return this.client.post('/api/auth/verify', params);
  }

  /**
   * Complete MFA with TOTP code.
   *
   * @param mfaToken - Token from verifyOtp response
   * @param code - 6-digit TOTP code from authenticator app
   * @returns Success on valid code (session cookie is set)
   */
  async verifyMfaTotp(mfaToken: string, code: string): Promise<ApiResponse<void>> {
    return this.client.post('/api/auth/mfa/totp', { mfaToken, code });
  }

  /**
   * Complete MFA with WebAuthn.
   *
   * @param mfaToken - Token from verifyOtp response
   * @param response - WebAuthn authentication response
   * @returns Success on valid response (session cookie is set)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async verifyMfaWebAuthn(mfaToken: string, response: any): Promise<ApiResponse<void>> {
    return this.client.post('/api/auth/mfa/webauthn', { mfaToken, response });
  }

  /**
   * Complete MFA with backup code.
   *
   * @param mfaToken - Token from verifyOtp response
   * @param code - Backup code
   * @returns Success on valid code (session cookie is set)
   */
  async verifyMfaBackupCode(mfaToken: string, code: string): Promise<ApiResponse<void>> {
    return this.client.post('/api/auth/mfa/backup-code', { mfaToken, code });
  }

  /**
   * Get current session status.
   *
   * Returns session info if authenticated (cookie is valid),
   * or error if not authenticated.
   *
   * @returns Session info on success, error if not authenticated
   */
  async getSession(): Promise<ApiResponse<SessionInfo>> {
    return this.client.get('/api/auth/session');
  }

  /**
   * Log out the current session.
   *
   * Destroys the session server-side and clears the session cookie.
   *
   * @returns Success on logout
   */
  async logout(): Promise<ApiResponse<void>> {
    return this.client.post('/api/auth/logout');
  }

  /**
   * Get all sessions for the current user.
   *
   * Returns a list of all active sessions, with the current session marked.
   *
   * @returns List of session details
   */
  async getSessions(): Promise<ApiResponse<SessionDetails[]>> {
    return this.client.get('/api/auth/sessions');
  }

  /**
   * Revoke a specific session.
   *
   * Cannot revoke the current session (use logout for that).
   *
   * @param sessionId - The ID of the session to revoke
   * @returns Success on revocation
   */
  async revokeSession(sessionId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/auth/sessions/${sessionId}`);
  }

  /**
   * Revoke all sessions except the current one.
   *
   * Useful for "log out all other devices" functionality.
   *
   * @returns Count of revoked sessions
   */
  async revokeAllOtherSessions(): Promise<ApiResponse<RevokeSessionsResponse>> {
    return this.client.delete('/api/auth/sessions');
  }
}

// ============================================================================
// MFA Types
// ============================================================================

/**
 * MFA status for a user
 */
export interface MfaStatus {
  enabled: boolean;
  totpEnabled: boolean;
  totpCount: number;
  webauthnEnabled: boolean;
  webauthnCount: number;
  backupCodesExist: boolean;
  backupCodesRemaining: number;
}

/**
 * Public TOTP credential
 */
export interface TotpCredential {
  id: string;
  name: string;
  verified: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Public WebAuthn credential
 */
export interface WebAuthnCredential {
  id: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * MFA credentials response
 */
export interface MfaCredentials {
  totp: TotpCredential[];
  webauthn: WebAuthnCredential[];
}

/**
 * TOTP setup response
 */
export interface TotpSetupResponse {
  credentialId: string;
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
}

/**
 * TOTP verify response
 */
export interface TotpVerifyResponse {
  verified: boolean;
  backupCodes?: string[];
}

/**
 * WebAuthn register start response
 */
export interface WebAuthnRegisterStartResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  credentialName: string;
}

/**
 * WebAuthn register finish response
 */
export interface WebAuthnRegisterFinishResponse {
  credential: WebAuthnCredential;
  backupCodes?: string[];
}

/**
 * Backup codes regenerate response
 */
export interface BackupCodesResponse {
  codes: string[];
  message: string;
}

/**
 * PublicKeyCredentialCreationOptionsJSON from WebAuthn
 * Simplified type for client usage
 */
export interface PublicKeyCredentialCreationOptionsJSON {
  challenge: string;
  rp: { name: string; id?: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout?: number;
  excludeCredentials?: Array<{ id: string; type: 'public-key'; transports?: string[] }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    residentKey?: 'discouraged' | 'preferred' | 'required';
    requireResidentKey?: boolean;
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
}

// ============================================================================
// MFA API Methods
// ============================================================================

export class MfaApi {
  constructor(private client: ApiClient) { }

  /**
   * Get MFA status for current user.
   */
  async getStatus(): Promise<ApiResponse<MfaStatus>> {
    return this.client.get('/api/mfa/status');
  }

  /**
   * Get all MFA credentials for current user.
   */
  async getCredentials(): Promise<ApiResponse<MfaCredentials>> {
    return this.client.get('/api/mfa/credentials');
  }

  // TOTP methods

  /**
   * Start TOTP setup - returns secret and QR code URL.
   */
  async setupTotp(name?: string): Promise<ApiResponse<TotpSetupResponse>> {
    return this.client.post('/api/mfa/totp/setup', { name: name || 'Authenticator' });
  }

  /**
   * Verify and activate TOTP with code from authenticator app.
   */
  async verifyTotp(credentialId: string, code: string): Promise<ApiResponse<TotpVerifyResponse>> {
    return this.client.post('/api/mfa/totp/verify', { credentialId, code });
  }

  /**
   * Delete a TOTP credential.
   */
  async deleteTotp(credentialId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/mfa/totp/${credentialId}`);
  }

  // WebAuthn methods

  /**
   * Start WebAuthn registration.
   */
  async startWebAuthnRegistration(name?: string): Promise<ApiResponse<WebAuthnRegisterStartResponse>> {
    return this.client.post('/api/mfa/webauthn/register/start', { name: name || 'Passkey' });
  }

  /**
   * Complete WebAuthn registration.
   */
  async finishWebAuthnRegistration(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: any,
    name: string
  ): Promise<ApiResponse<WebAuthnRegisterFinishResponse>> {
    return this.client.post('/api/mfa/webauthn/register/finish', { response, name });
  }

  /**
   * Rename a WebAuthn credential.
   */
  async renameWebAuthn(credentialId: string, name: string): Promise<ApiResponse<void>> {
    return this.client.patch(`/api/mfa/webauthn/${credentialId}`, { name });
  }

  /**
   * Delete a WebAuthn credential.
   */
  async deleteWebAuthn(credentialId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/mfa/webauthn/${credentialId}`);
  }

  // Backup codes methods

  /**
   * Regenerate backup codes.
   */
  async regenerateBackupCodes(): Promise<ApiResponse<BackupCodesResponse>> {
    return this.client.post('/api/mfa/backup-codes/regenerate');
  }

  /**
   * Get remaining backup codes count.
   */
  async getBackupCodesCount(): Promise<ApiResponse<{ remaining: number }>> {
    return this.client.get('/api/mfa/backup-codes/count');
  }
}

// ============================================================================
// Users API Methods
// ============================================================================

export interface RequestEmailVerificationParams {
  email: string;
}

export interface VerifyEmailParams {
  email: string;
  code: string;
}

export interface RequestPhoneVerificationParams {
  phone: string;
}

export interface VerifyPhoneParams {
  phone: string;
  code: string;
}

export class UsersApi {
  constructor(private client: ApiClient) { }

  /**
   * Get the current user's profile.
   *
   * @returns User profile with avatar data
   */
  async getProfile(): Promise<ApiResponse<UserProfile>> {
    return this.client.get('/api/users/me');
  }

  /**
   * Request email verification.
   *
   * Sends a verification code to the specified email address.
   *
   * @param params - Email address to verify
   * @returns Success on code sent
   */
  async requestEmailVerification(params: RequestEmailVerificationParams): Promise<ApiResponse<void>> {
    return this.client.post('/api/users/me/email', params);
  }

  /**
   * Verify email address with OTP.
   *
   * @param params - Email and verification code
   * @returns Updated user profile on success
   */
  async verifyEmail(params: VerifyEmailParams): Promise<ApiResponse<UserProfile>> {
    return this.client.post('/api/users/me/email/verify', params);
  }

  /**
   * Request phone verification.
   *
   * Sends a verification code to the specified phone number.
   *
   * @param params - Phone number to verify
   * @returns Success on code sent
   */
  async requestPhoneVerification(params: RequestPhoneVerificationParams): Promise<ApiResponse<void>> {
    return this.client.post('/api/users/me/phone', params);
  }

  /**
   * Verify phone number with OTP.
   *
   * @param params - Phone and verification code
   * @returns Updated user profile on success
   */
  async verifyPhone(params: VerifyPhoneParams): Promise<ApiResponse<UserProfile>> {
    return this.client.post('/api/users/me/phone/verify', params);
  }

  /**
   * Get the current user's theme and appearance preferences.
   */
  async getPreferences(): Promise<ApiResponse<{ themeId?: string; customThemes?: import('../types/theme').ThemeDefinition[]; iconPackId?: string }>> {
    return this.client.get('/api/users/me/preferences');
  }

  /**
   * Update the current user's theme and appearance preferences.
   */
  async updatePreferences(prefs: { themeId?: string; customThemes?: import('../types/theme').ThemeDefinition[]; iconPackId?: string }): Promise<ApiResponse<void>> {
    return this.client.put('/api/users/me/preferences', prefs);
  }
}

// ============================================================================
// Identity API Methods
// ============================================================================

/**
 * Crypto profile type for E2E encryption.
 */
export type CryptoProfile = 'default' | 'cnsa2';

/**
 * Visibility level for profile fields.
 */
export type ProfileVisibility = 'public' | 'friends' | 'private';

/**
 * Per-field privacy settings for identity profiles.
 */
export interface ProfilePrivacySettings {
  avatar: ProfileVisibility;
  banner: ProfileVisibility;
  bio: ProfileVisibility;
  lastActiveAt: ProfileVisibility;
  profileColors: ProfileVisibility;
}

/**
 * Customisable profile accent colours.
 */
export interface ProfileColors {
  primary?: string;
  secondary?: string;
  accent?: string;
}

/**
 * Public identity info (safe for clients).
 */
export interface PublicIdentity {
  /** Unique identity ID */
  id: string;
  /** Username for the identity */
  username: string;
  /** Display name for the identity */
  displayName: string;
  /** Short bio/description (max 160 characters) */
  bio?: string;
  /** URL to avatar image */
  avatarUrl?: string;
  /** URL to banner image */
  bannerUrl?: string;
  /** Profile accent colours */
  profileColors?: ProfileColors;
  /** Per-field privacy settings (only visible to self) */
  privacySettings?: ProfilePrivacySettings;
  /** When the identity was created */
  createdAt: string;
  /** Last time this identity was active */
  lastActiveAt: string;
  /** Whether this identity has been deleted */
  isDeleted: boolean;
  /** Preferred crypto profile for E2E encryption */
  preferredCryptoProfile?: CryptoProfile;
  /** Whether this identity has E2E keys set up */
  hasE2EKeys?: boolean;
  /** Number of registered devices */
  deviceCount?: number;
  /** Whether adding this identity to a group requires their explicit approval */
  requireGroupApproval?: boolean;
}

/**
 * Public device info for E2E encryption.
 */
export interface PublicDevice {
  deviceId: string;
  name: string;
  ecdhPublicKey: string;
  kemPublicKey?: string;
  registeredAt?: string;
  lastActiveAt?: string;
}

/**
 * Public identity session info for session management.
 */
export interface PublicIdentitySession {
  /** Session ID (for revocation) */
  id: string;
  /** When the session was created */
  createdAt: string;
  /** Last activity timestamp */
  lastActivityAt: string;
  /** User agent (browser/device info) */
  userAgent?: string;
  /** IP address (partially masked for privacy) */
  ipAddress?: string;
  /** Whether this is the current session */
  isCurrent?: boolean;
}

/**
 * Identity public keys for E2E encryption.
 */
export interface IdentityPublicKeys {
  identityId: string;
  signingPublicKey: string;
  preferredCryptoProfile: CryptoProfile;
  devices: PublicDevice[];
}

/**
 * Encrypted key bundle from server.
 */
export interface EncryptedKeyBundle {
  encryptedBundle: string;
  salt: string;
  nonce: string;
  useSeparatePassphrase: boolean;
  schemeVersion: number;
}

/**
 * Parameters for initializing E2E encryption.
 */
export interface InitializeE2EParams {
  signingPublicKey: string;
  preferredCryptoProfile?: CryptoProfile;
  device: {
    deviceId: string;
    name: string;
    ecdhPublicKey: string;
    kemPublicKey?: string;
  };
  bundle: {
    encryptedBundle: string;
    salt: string;
    nonce: string;
    useSeparatePassphrase: boolean;
  };
}

/**
 * Parameters for registering a new device.
 */
export interface RegisterDeviceParams {
  deviceId: string;
  name: string;
  ecdhPublicKey: string;
  kemPublicKey?: string;
}

/**
 * Parameters for updating an encrypted key bundle.
 */
export interface UpdateKeyBundleParams {
  encryptedBundle: string;
  salt: string;
  nonce: string;
}

/**
 * Parameters for creating an identity.
 */
export interface CreateIdentityParams {
  /** Passphrase (min 8 characters) */
  passphrase: string;
  /** Username (3-30 chars, alphanumeric + underscores/hyphens) */
  username: string;
  /** Display name (1-50 chars) */
  displayName: string;
}

/**
 * Parameters for logging into an identity.
 */
export interface LoginIdentityParams {
  /** Passphrase to authenticate */
  passphrase: string;
}

/**
 * Response from identity login.
 */
export interface IdentityLoginResponse {
  identity: PublicIdentity;
}

/**
 * Response from identity login failure with attempt info.
 */
export interface IdentityLoginErrorResponse {
  error: string;
  attemptNumber?: number;
  retryAfter?: number;
}

export class IdentityApi {
  constructor(private client: ApiClient) { }

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

  // ==========================================================================
  // E2E Encryption Methods
  // ==========================================================================

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
  async getPublicKeys(identityId: string): Promise<ApiResponse<IdentityPublicKeys>> {
    return this.client.get(
      `/api/identity/${encodeURIComponent(identityId)}/keys`
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

  // ==========================================================================
  // Pre-Keys (Forward Secrecy)
  // ==========================================================================

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
    params?: ClaimPreKeysParams
  ): Promise<ApiResponse<{ devices: ClaimedDevicePreKeys[] }>> {
    return this.client.post(
      `/api/identity/${encodeURIComponent(identityId)}/pre-keys/claim`,
      params ?? {}
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

  // ==========================================================================
  // Profile
  // ==========================================================================

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
}

// ============================================================================
// Blocks API Types
// ============================================================================

/**
 * Blocked identity with info
 */
export interface BlockedIdentity {
  identity: PublicIdentity;
  blockedAt: string;
}

/**
 * Block check result
 */
export interface BlockCheckResult {
  blocked: boolean;
  blockedAt?: string;
}

export class BlocksApi {
  constructor(private client: ApiClient) {}

  /**
   * Block an identity.
   */
  async block(identityId: string): Promise<ApiResponse<void>> {
    return this.client.post('/api/blocks', { identityId });
  }

  /**
   * Unblock an identity.
   */
  async unblock(identityId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/blocks/${encodeURIComponent(identityId)}`);
  }

  /**
   * Get blocked identities list.
   */
  async getBlocked(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ blocks: BlockedIdentity[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/blocks${query ? `?${query}` : ''}`);
  }

  /**
   * Check if an identity is blocked by you.
   */
  async checkBlocked(identityId: string): Promise<ApiResponse<BlockCheckResult>> {
    return this.client.get(`/api/blocks/check/${encodeURIComponent(identityId)}`);
  }
}

// ============================================================================
// Notifications API Types
// ============================================================================

/**
 * Notification type identifier.
 * Concrete values will be defined as features are implemented.
 */
export type NotificationType = string;

/**
 * Notification data (varies by type).
 * Concrete fields will be added as notification types are defined.
 */
export interface NotificationData {
  [key: string]: unknown;
}

/**
 * Notification
 */
export interface Notification {
  id: string;
  type: NotificationType;
  data: NotificationData;
  read: boolean;
  createdAt: string;
}

/**
 * Notification counts
 */
export interface NotificationCounts {
  unread: number;
  byType: Record<string, number>;
}

export class NotificationsApi {
  constructor(private client: ApiClient) {}

  /**
   * Get notifications.
   */
  async getNotifications(options?: {
    limit?: number;
    since?: string;
    unreadOnly?: boolean;
    types?: NotificationType[];
  }): Promise<ApiResponse<{ notifications: Notification[]; unreadCount: number }>> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.since) params.set('since', options.since);
    if (options?.unreadOnly) params.set('unreadOnly', 'true');
    if (options?.types) params.set('types', options.types.join(','));
    const query = params.toString();
    return this.client.get(`/api/notifications${query ? `?${query}` : ''}`);
  }

  /**
   * Mark notifications as read.
   */
  async markAsRead(notificationIds: string[] | 'all'): Promise<ApiResponse<{ markedCount: number }>> {
    return this.client.post('/api/notifications/read', { notificationIds });
  }

  /**
   * Mark notifications as unread.
   */
  async markAsUnread(notificationIds: string[] | 'all'): Promise<ApiResponse<{ markedCount: number }>> {
    return this.client.post('/api/notifications/unread', { notificationIds });
  }

  /**
   * Delete notifications.
   */
  async deleteNotifications(notificationIds: string[] | 'all'): Promise<ApiResponse<{ deletedCount: number }>> {
    return this.client.delete('/api/notifications');
  }

  /**
   * Get unread notification counts.
   */
  async getCounts(): Promise<ApiResponse<NotificationCounts>> {
    return this.client.get('/api/notifications/count');
  }
}

// ============================================================================
// Friends API Types
// ============================================================================

/**
 * Friendship status between two identities
 */
export type FriendshipStatus = 'none' | 'friends' | 'pending_incoming' | 'pending_outgoing';

/**
 * Public friend request
 */
export interface PublicFriendRequest {
  id: string;
  fromIdentityId: string;
  toIdentityId: string;
  status: 'pending' | 'accepted' | 'ignored';
  createdAt: string;
}

/**
 * Friend info with denormalised identity data
 */
export interface FriendInfo {
  identity: PublicIdentity;
  friendsSince: string;
}

/**
 * Incoming friend request with sender identity info
 */
export interface IncomingFriendRequestInfo {
  request: PublicFriendRequest;
  fromIdentity: PublicIdentity;
}

export class FriendsApi {
  constructor(private client: ApiClient) {}

  /**
   * Send a friend request.
   */
  async sendRequest(identityId: string): Promise<ApiResponse<PublicFriendRequest>> {
    return this.client.post('/api/friends/requests', { identityId });
  }

  /**
   * Accept a friend request.
   */
  async acceptRequest(requestId: string): Promise<ApiResponse<PublicFriendRequest>> {
    return this.client.post(`/api/friends/requests/${encodeURIComponent(requestId)}/accept`, {});
  }

  /**
   * Ignore a friend request.
   */
  async ignoreRequest(requestId: string): Promise<ApiResponse<void>> {
    return this.client.post(`/api/friends/requests/${encodeURIComponent(requestId)}/ignore`, {});
  }

  /**
   * Cancel an outgoing friend request.
   */
  async cancelRequest(requestId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/friends/requests/${encodeURIComponent(requestId)}`);
  }

  /**
   * Get incoming friend requests.
   */
  async getIncomingRequests(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ requests: IncomingFriendRequestInfo[]; count: number; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/friends/requests/incoming${query ? `?${query}` : ''}`);
  }

  /**
   * Get outgoing friend requests.
   */
  async getOutgoingRequests(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ requests: PublicFriendRequest[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/friends/requests/outgoing${query ? `?${query}` : ''}`);
  }

  /**
   * Get pending incoming request count.
   */
  async getIncomingRequestCount(): Promise<ApiResponse<{ count: number }>> {
    return this.client.get('/api/friends/requests/count');
  }

  /**
   * Get friends list (paginated).
   */
  async getFriends(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ friends: FriendInfo[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/friends${query ? `?${query}` : ''}`);
  }

  /**
   * Search friends by username/displayName.
   */
  async searchFriends(
    query: string,
    limit?: number
  ): Promise<ApiResponse<{ friends: FriendInfo[] }>> {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set('limit', limit.toString());
    return this.client.get(`/api/friends/search?${params.toString()}`);
  }

  /**
   * Remove a friend.
   */
  async removeFriend(identityId: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/friends/${encodeURIComponent(identityId)}`);
  }

  /**
   * Get friendship status with an identity.
   */
  async getFriendshipStatus(identityId: string): Promise<ApiResponse<{ status: FriendshipStatus }>> {
    return this.client.get(`/api/friends/status/${encodeURIComponent(identityId)}`);
  }
}

// ============================================================================
// Pre-Key Types
// ============================================================================

/**
 * Public signed pre-key (returned when claiming).
 */
export interface PublicSignedPreKey {
  keyId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
  signature: string;
}

/**
 * Public one-time pre-key (returned when claiming).
 */
export interface PublicOneTimePreKey {
  keyId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
}

/**
 * Claimed pre-keys for a single device.
 */
export interface ClaimedDevicePreKeys {
  deviceId: string;
  signedPreKey: PublicSignedPreKey | null;
  oneTimePreKey: PublicOneTimePreKey | null;
}

/**
 * Parameters for uploading pre-keys.
 */
export interface UploadPreKeysParams {
  signedPreKey?: {
    keyId: string;
    ecdhPublicKey: string;
    kemPublicKey: string;
    signature: string;
  };
  oneTimePreKeys?: Array<{
    keyId: string;
    ecdhPublicKey: string;
    kemPublicKey: string;
  }>;
  signedPreKeyExpiresInDays?: number;
}

/**
 * Parameters for claiming pre-keys.
 */
export interface ClaimPreKeysParams {
  deviceIds?: string[];
}

/**
 * Response from the pre-key count endpoint.
 */
export interface PreKeyCountResponse {
  signedPreKey: { keyId: string; expiresAt: string | null } | null;
  oneTimePreKeysRemaining: number;
  otpkDigest: string;
  consumedOtpkKeyIds: string[];
}


// ============================================================================
// Admin (platform) API
// ============================================================================

/** Canonical platform setting keys (must match API `platform_settings.key`). */
export const PLATFORM_SETTING_KEYS = {
  AUTH_ALLOWLIST_ENFORCED: 'platform-auth-allowlist-enforced',
  AUTH_ALLOWLIST_EMAIL: 'platform-auth-allowlist-email',
  AUTH_ALLOWLIST_PHONE: 'platform-auth-allowlist-phone',
  ADMIN_ACCOUNT_LIST: 'platform-admin-account-list',
} as const;

export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

export interface AdminMetrics {
  totalUsers: number;
  totalIdentities: number;
  activeIdentities15m: number;
  activeIdentities24h: number;
}

export type PlatformSettingValueType =
  | 'boolean'
  | 'string'
  | 'number'
  | 'stringArray'
  | 'objectIdArray';

export interface PublicPlatformSetting {
  key: string;
  description?: string;
  valueType: PlatformSettingValueType;
  value: unknown;
  lastUpdatedBy?: string;
  updatedAt: string;
  createdAt: string;
}

export interface PutPlatformSettingBody {
  valueType: PlatformSettingValueType;
  value: unknown;
  description?: string;
}

export interface PlatformAdminRow {
  userId: string;
  email?: string;
  phone?: string;
  displayName?: string;
  /** True when the user id is listed but no longer exists in the database */
  stale?: boolean;
}

export class AdminApi {
  constructor(private client: ApiClient) {}

  async getMetrics(): Promise<ApiResponse<AdminMetrics>> {
    return this.client.get('/api/admin/metrics');
  }

  async getPlatformSettings(): Promise<ApiResponse<PublicPlatformSetting[]>> {
    return this.client.get('/api/admin/platform-settings');
  }

  async getPlatformSetting(key: string): Promise<ApiResponse<PublicPlatformSetting>> {
    return this.client.get(`/api/admin/platform-settings/${encodeURIComponent(key)}`);
  }

  async putPlatformSetting(
    key: string,
    body: PutPlatformSettingBody
  ): Promise<ApiResponse<PublicPlatformSetting>> {
    return this.client.put(`/api/admin/platform-settings/${encodeURIComponent(key)}`, body);
  }

  async listPlatformAdmins(): Promise<ApiResponse<{ admins: PlatformAdminRow[] }>> {
    return this.client.get('/api/admin/platform-admins');
  }

  async addPlatformAdmin(params: {
    identifier: string;
  }): Promise<ApiResponse<{ admins: PlatformAdminRow[] }>> {
    return this.client.post('/api/admin/platform-admins', params);
  }

  async removePlatformAdmin(
    userId: string
  ): Promise<ApiResponse<{ admins: PlatformAdminRow[] }>> {
    return this.client.delete(`/api/admin/platform-admins/${encodeURIComponent(userId)}`);
  }
}

// ============================================================================
// Themes API Methods (Community Themes)
// ============================================================================

export interface ThemeListParams {
  page?: number;
  limit?: number;
  search?: string;
  tag?: string;
  sort?: 'newest' | 'downloads' | 'upvotes';
}

export interface ThemeListResponse {
  themes: import('../types/theme').CommunityTheme[];
  total: number;
  page: number;
  limit: number;
}

export class ThemesApi {
  constructor(private client: ApiClient) { }

  /**
   * List community themes with optional search/filter.
   * Public endpoint -- no auth required.
   */
  async list(params?: ThemeListParams): Promise<ApiResponse<ThemeListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.sort) qs.set('sort', params.sort);
    const query = qs.toString();
    return this.client.get(`/api/themes${query ? `?${query}` : ''}`);
  }

  /**
   * Get a single community theme by ID.
   * Public endpoint -- no auth required.
   */
  async get(id: string): Promise<ApiResponse<import('../types/theme').CommunityTheme>> {
    return this.client.get(`/api/themes/${encodeURIComponent(id)}`);
  }

  /**
   * Upload/share a theme publicly. Requires identity session.
   */
  async create(data: {
    name: string;
    description?: string;
    theme: import('../types/theme').ThemeDefinition;
    tags?: string[];
  }): Promise<ApiResponse<import('../types/theme').CommunityTheme>> {
    return this.client.post('/api/themes', data);
  }

  /**
   * Delete a community theme. Requires identity session; must be the author.
   */
  async delete(id: string): Promise<ApiResponse<void>> {
    return this.client.delete(`/api/themes/${encodeURIComponent(id)}`);
  }

  /**
   * Upvote a community theme. Requires identity session. Idempotent.
   */
  async upvote(id: string): Promise<ApiResponse<{ upvoted: boolean; upvotes: number }>> {
    return this.client.post(`/api/themes/${encodeURIComponent(id)}/upvote`, {});
  }

  /**
   * Report a community theme. Requires identity session.
   */
  async report(id: string): Promise<ApiResponse<void>> {
    return this.client.post(`/api/themes/${encodeURIComponent(id)}/report`, {});
  }
}

// ============================================================================
// Profile Update Types
// ============================================================================

/**
 * Parameters for updating an identity profile.
 */
export interface UpdateProfileParams {
  displayName?: string;
  bio?: string;
  avatarMediaId?: string;
  bannerMediaId?: string;
  removeAvatar?: boolean;
  removeBanner?: boolean;
  profileColors?: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
  };
  privacySettings?: Partial<ProfilePrivacySettings>;
  requireGroupApproval?: boolean;
}

// ============================================================================
// Upload API Types
// ============================================================================

export type UploadPurpose = 'avatar' | 'banner' | 'dm_attachment' | 'space_media';

export type UploadStatus = 'pending' | 'uploaded' | 'processing' | 'ready' | 'rejected' | 'failed';

export interface RequestUploadParams {
  purpose: UploadPurpose;
  contentType: string;
  contentLength: number;
}

export interface RequestUploadResponse {
  mediaId: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface UploadStatusResponse {
  mediaId: string;
  status: UploadStatus;
  cdnUrl: string | null;
  rejectionReason: string | null;
}

export class UploadApi {
  constructor(private client: ApiClient) {}

  /**
   * Request a presigned S3 upload URL.
   */
  async requestUpload(
    params: RequestUploadParams
  ): Promise<ApiResponse<RequestUploadResponse>> {
    return this.client.post('/api/uploads/request', params);
  }

  /**
   * Notify the server that a file upload is complete.
   */
  async completeUpload(mediaId: string): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/uploads/${encodeURIComponent(mediaId)}/complete`,
      {}
    );
  }

  /**
   * Check the processing status of an upload.
   */
  async getStatus(
    mediaId: string
  ): Promise<ApiResponse<UploadStatusResponse>> {
    return this.client.get(
      `/api/uploads/${encodeURIComponent(mediaId)}/status`
    );
  }
}

// ============================================================================
// Conversations API Types
// ============================================================================

export type ConversationType = 'dm' | 'group';

export type PreKeyType = 'static' | 'spk' | 'otpk';

export type MessageCryptoProfile = 'default' | 'cnsa2';

export type MessageType = 'user' | 'system';

export interface SystemEvent {
  type: string;
  identityId: string;
  displayName?: string;
  actorIdentityId?: string;
  actorDisplayName?: string;
}

export interface PublicConversation {
  id: string;
  type: ConversationType;
  participants: string[];
  createdBy: string;
  admins: string[];
  encryptedName?: string;
  nameNonce?: string;
  lastMessageAt?: string;
  lastMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedWrappedKey {
  identityId: string;
  ephemeralPublicKey: string;
  kemCiphertext: string;
  wrappedSessionKey: string;
  wrappingNonce: string;
  preKeyType: PreKeyType;
  signedPreKeyId?: string;
  oneTimePreKeyId?: string;
  spkKemCiphertext?: string;
  otpkKemCiphertext?: string;
  /**
   * Key-fingerprint routing tag for O(1) wrapped key lookup on multi-device
   * identities. Truncated SHA-256 of the recipient device's public keys.
   * Absent on messages created before this field was introduced.
   */
  routingTag?: string;
}

export interface PublicMessage {
  id: string;
  conversationId: string;
  fromIdentityId: string;
  messageType?: MessageType;
  systemEvent?: SystemEvent;
  ciphertext?: string;
  nonce?: string;
  wrappedKeys?: SerializedWrappedKey[];
  signature?: string;
  cryptoProfile: MessageCryptoProfile;
  clientMessageId: string;
  expiresAt?: string;
  deleted: boolean;
  createdAt: string;
}

export interface PublicGroupInvite {
  id: string;
  conversationId: string;
  invitedIdentityId: string;
  invitedByIdentityId: string;
  status: string;
  groupName?: string;
  hasGroupName?: boolean;
  memberCount: number;
  createdAt: string;
}

export interface GroupInvitePreviewMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isAdmin: boolean;
}

export interface GroupInvitePreview {
  inviteId: string;
  conversationId: string;
  groupName?: string;
  hasGroupName?: boolean;
  memberCount: number;
  members: GroupInvitePreviewMember[];
  invitedMembers: GroupInvitePreviewMember[];
  invitedBy: GroupInvitePreviewMember;
  createdAt: string;
}

export interface FormerMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface SendMessageParams {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: MessageCryptoProfile;
  clientMessageId: string;
  expiresInSeconds?: number;
}

export class ConversationsApi {
  constructor(private client: ApiClient) {}

  async create(params: {
    type: ConversationType;
    participants: string[];
    encryptedName?: string;
    nameNonce?: string;
  }): Promise<ApiResponse<PublicConversation>> {
    return this.client.post('/api/conversations', params);
  }

  async list(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ conversations: PublicConversation[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/conversations${query ? `?${query}` : ''}`);
  }

  async get(conversationId: string): Promise<ApiResponse<PublicConversation>> {
    return this.client.get(`/api/conversations/${encodeURIComponent(conversationId)}`);
  }

  async updateName(
    conversationId: string,
    encryptedName: string,
    nameNonce: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.patch(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      { encryptedName, nameNonce }
    );
  }

  async sendMessage(
    conversationId: string,
    params: SendMessageParams
  ): Promise<ApiResponse<PublicMessage>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      params
    );
  }

  async getMessages(
    conversationId: string,
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ messages: PublicMessage[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages${query ? `?${query}` : ''}`
    );
  }

  async deleteMessageForSelf(
    conversationId: string,
    messageId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`
    );
  }

  async deleteMessageForEveryone(
    conversationId: string,
    messageId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/everyone`
    );
  }

  async addMember(
    conversationId: string,
    identityId: string
  ): Promise<ApiResponse<PublicConversation | PublicGroupInvite>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/members`,
      { identityId }
    );
  }

  async removeMember(
    conversationId: string,
    identityId: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(identityId)}`
    );
  }

  async getFormerMembers(
    conversationId: string
  ): Promise<ApiResponse<FormerMember[]>> {
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/former-members`
    );
  }

  async leave(
    conversationId: string,
    options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
  ): Promise<ApiResponse<void>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/leave`,
      options ?? {}
    );
  }

  async promoteToAdmin(
    conversationId: string,
    identityId: string
  ): Promise<ApiResponse<PublicConversation>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/admins`,
      { identityId }
    );
  }

  async terminateGroup(conversationId: string): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}`
    );
  }

  async listInvites(
    limit?: number,
    cursor?: string
  ): Promise<ApiResponse<{ invites: PublicGroupInvite[]; cursor: string | null }>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return this.client.get(`/api/conversations/invites${query ? `?${query}` : ''}`);
  }

  async acceptInvite(inviteId: string): Promise<ApiResponse<PublicGroupInvite>> {
    return this.client.post(
      `/api/conversations/invites/${encodeURIComponent(inviteId)}/accept`,
      {}
    );
  }

  async declineInvite(inviteId: string): Promise<ApiResponse<PublicGroupInvite>> {
    return this.client.post(
      `/api/conversations/invites/${encodeURIComponent(inviteId)}/decline`,
      {}
    );
  }

  async getInvitePreview(inviteId: string): Promise<ApiResponse<GroupInvitePreview>> {
    return this.client.get(
      `/api/conversations/invites/${encodeURIComponent(inviteId)}/preview`
    );
  }
}

// ============================================================================
// Reactions API
// ============================================================================

export interface PublicReaction {
  id: string;
  messageId: string;
  conversationId: string;
  fromIdentityId: string;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: MessageCryptoProfile;
  clientReactionId: string;
  createdAt: string;
}

export interface SendReactionParams {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: MessageCryptoProfile;
  clientReactionId: string;
}

export class ReactionsApi {
  constructor(private client: ApiClient) {}

  async add(
    conversationId: string,
    messageId: string,
    params: SendReactionParams
  ): Promise<ApiResponse<PublicReaction>> {
    return this.client.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      params
    );
  }

  async remove(
    conversationId: string,
    reactionId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete(
      `/api/conversations/${encodeURIComponent(conversationId)}/reactions/${encodeURIComponent(reactionId)}`
    );
  }

  async getForMessages(
    conversationId: string,
    messageIds: string[]
  ): Promise<ApiResponse<{ reactions: PublicReaction[] }>> {
    const query = `messageIds=${messageIds.map(encodeURIComponent).join(',')}`;
    return this.client.get(
      `/api/conversations/${encodeURIComponent(conversationId)}/reactions?${query}`
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates an API client instance with all API modules.
 */
export function createApiClient(config: ApiClientConfig) {
  const client = new ApiClient(config);

  return {
    client,
    auth: new AuthApi(client),
    users: new UsersApi(client),
    mfa: new MfaApi(client),
    identity: new IdentityApi(client),
    blocks: new BlocksApi(client),
    friends: new FriendsApi(client),
    notifications: new NotificationsApi(client),
    admin: new AdminApi(client),
    themes: new ThemesApi(client),
    uploads: new UploadApi(client),
    conversations: new ConversationsApi(client),
    reactions: new ReactionsApi(client),
  };
}

/**
 * Default API client configuration for development.
 */
export const defaultConfig: ApiClientConfig = {
  baseUrl: typeof window !== 'undefined' ? '' : 'http://localhost:4000',
};
