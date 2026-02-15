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
 * Session info returned from /auth/session endpoint.
 * Note: The actual session token is stored in HTTP-only cookies,
 * not exposed to JavaScript.
 */
export interface SessionInfo {
  identifier: string;
  identifierType: 'email' | 'phone';
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
   * On success, the server sets an HTTP-only session cookie.
   * The response body contains success status but no token
   * (token is in the cookie, not accessible to JS).
   *
   * @param params - The identifier and OTP code
   * @returns Success on valid OTP, error on failure
   */
  async verifyOtp(params: VerifyOtpParams): Promise<ApiResponse<void>> {
    return this.client.post('/api/auth/verify', params);
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
  };
}

/**
 * Default API client configuration for development.
 */
export const defaultConfig: ApiClientConfig = {
  baseUrl: typeof window !== 'undefined' ? '' : 'http://localhost:4000',
};
