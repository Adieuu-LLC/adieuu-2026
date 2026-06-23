import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

/**
 * MFA status for a user
 */
export interface MfaStatus {
  enabled: boolean;
  totpEnabled: boolean;
  totpCount: number;
  webauthnEnabled: boolean;
  webauthnCount: number;
  discountTier: 'none' | 'basic' | 'hardware_key';
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

export class MfaApi {
  constructor(private client: HttpClient) {}

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
}
