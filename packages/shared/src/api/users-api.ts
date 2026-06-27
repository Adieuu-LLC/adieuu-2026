import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { UserProfile } from './auth-types';

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
  constructor(private client: HttpClient) {}

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

  async updateDisplayName(displayName: string): Promise<ApiResponse<{ displayName: string }>> {
    return this.client.patch('/api/users/me/display-name', { displayName });
  }
}
