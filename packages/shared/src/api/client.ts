/**
 * API Client for Chadder
 *
 * A minimal, type-safe API client for communicating with the Chadder API.
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
  constructor(private client: ApiClient) {}

  /**
   * Request an OTP for passwordless authentication.
   *
   * @param params - The identifier (email/phone) and delivery type
   * @returns Success response (always returns success to prevent enumeration)
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
   * @returns Success with optional MFA challenge, or error on failure
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
  constructor(private client: ApiClient) {}

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
  constructor(private client: ApiClient) {}

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
}

// ============================================================================
// Identity API Methods
// ============================================================================

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
  /** When the identity was created */
  createdAt: string;
  /** Last time this identity was active */
  lastActiveAt: string;
  /** Whether this identity has been deleted */
  isDeleted: boolean;
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
  constructor(private client: ApiClient) {}

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
  };
}

/**
 * Default API client configuration for development.
 */
export const defaultConfig: ApiClientConfig = {
  baseUrl: typeof window !== 'undefined' ? '' : 'http://localhost:4000',
};
