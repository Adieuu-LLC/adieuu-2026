import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type {
  RequestOtpParams,
  RevokeSessionsResponse,
  SessionDetails,
  SessionInfo,
  VerifyOtpParams,
  VerifyOtpResponse,
} from './auth-types';

export class AuthApi {
  constructor(private client: HttpClient) {}

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
   * @returns Success with optional MFA challenge, or error on failure.
   *
   * Possible error codes:
   * - **403 `ACCOUNT_BANNED`** — account permanently banned; `error.details.moderationReason` may be set.
   * - **403 `ACCOUNT_SUSPENDED`** — account temporarily suspended; `error.details.suspendedUntil` (ISO-8601)
   *   and `error.details.moderationReason` may be set.
   * - **403** — platform auth allowlist blocks this identifier.
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
   * Clear the current session cookie without destroying the session server-side.
   * Used when transitioning between account and identity contexts.
   */
  async clearSession(): Promise<ApiResponse<void>> {
    return this.client.post('/api/auth/clear-session');
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
