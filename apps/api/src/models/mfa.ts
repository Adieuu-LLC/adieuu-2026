/**
 * MFA (Multi-Factor Authentication) models
 * Supports TOTP (Google Authenticator, Authy) and WebAuthn (Passkeys, hardware keys)
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

// ============================================================================
// TOTP (Time-based One-Time Password) Models
// ============================================================================

/**
 * TOTP credential document stored in MongoDB
 */
export interface TotpCredentialDocument extends BaseDocument {
  /** Reference to the user document */
  userId: ObjectId;

  /** Encrypted TOTP secret (base32 encoded before encryption) */
  encryptedSecret: string;

  /** User-friendly name for this authenticator (e.g., "Google Authenticator") */
  name: string;

  /** Whether this TOTP is verified and active */
  verified: boolean;

  /** When the TOTP was verified */
  verifiedAt?: Date;

  /** Last used timestamp */
  lastUsedAt?: Date;
}

/**
 * TOTP creation input
 */
export interface CreateTotpInput {
  userId: ObjectId;
  encryptedSecret: string;
  name: string;
}

/**
 * Public TOTP representation (safe to send to client)
 */
export interface PublicTotpCredential {
  id: string;
  name: string;
  verified: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Convert TotpCredentialDocument to public representation
 */
export function toPublicTotp(doc: TotpCredentialDocument): PublicTotpCredential {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    verified: doc.verified,
    createdAt: doc.createdAt.toISOString(),
    lastUsedAt: doc.lastUsedAt?.toISOString(),
  };
}

// ============================================================================
// WebAuthn (Passkeys / Hardware Keys) Models
// ============================================================================

/**
 * WebAuthn credential document stored in MongoDB
 */
export interface WebAuthnCredentialDocument extends BaseDocument {
  /** Reference to the user document */
  userId: ObjectId;

  /** Credential ID (base64url encoded) */
  credentialId: string;

  /** Public key (base64url encoded) */
  publicKey: string;

  /** Sign counter for replay attack prevention */
  counter: number;

  /** Credential device type */
  deviceType: 'singleDevice' | 'multiDevice';

  /** Whether the credential is backed up (passkey sync) */
  backedUp: boolean;

  /** Transports the authenticator supports */
  transports?: AuthenticatorTransport[];

  /** User-friendly name for this credential */
  name: string;

  /** AAGUID of the authenticator (for identifying authenticator type) */
  aaguid?: string;

  /** Last used timestamp */
  lastUsedAt?: Date;
}

/**
 * Authenticator transport types
 */
export type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid';

/**
 * WebAuthn credential creation input
 */
export interface CreateWebAuthnInput {
  userId: ObjectId;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  transports?: AuthenticatorTransport[];
  name: string;
  aaguid?: string;
}

/**
 * Public WebAuthn credential representation (safe to send to client)
 */
export interface PublicWebAuthnCredential {
  id: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Convert WebAuthnCredentialDocument to public representation
 */
export function toPublicWebAuthn(doc: WebAuthnCredentialDocument): PublicWebAuthnCredential {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    deviceType: doc.deviceType,
    backedUp: doc.backedUp,
    createdAt: doc.createdAt.toISOString(),
    lastUsedAt: doc.lastUsedAt?.toISOString(),
  };
}

// ============================================================================
// Backup Codes Model
// ============================================================================

/**
 * MFA backup codes document stored in MongoDB
 * One document per user containing all their backup codes
 */
export interface MfaBackupCodesDocument extends BaseDocument {
  /** Reference to the user document */
  userId: ObjectId;

  /** Array of hashed backup codes (unused codes only) */
  hashedCodes: string[];

  /** Total codes originally generated */
  totalGenerated: number;

  /** When the codes were generated */
  generatedAt: Date;
}

/**
 * Backup codes creation input
 */
export interface CreateBackupCodesInput {
  userId: ObjectId;
  hashedCodes: string[];
  totalGenerated: number;
}

// ============================================================================
// MFA Challenge Models (for pending authentication)
// ============================================================================

/**
 * MFA challenge stored in Redis (short-lived)
 */
export interface MfaChallengeData {
  /** User ID */
  userId: string;

  /** Session ID that initiated the challenge */
  sessionId: string;

  /** Type of MFA required */
  requiredMfaTypes: ('totp' | 'webauthn')[];

  /** WebAuthn challenge (if webauthn is an option) */
  webauthnChallenge?: string;

  /** When the challenge was created (ms timestamp) */
  createdAt: number;

  /** When the challenge expires (ms timestamp) */
  expiresAt: number;
}

/**
 * MFA status for a user (returned by API)
 */
export interface MfaStatus {
  /** Whether MFA is enabled */
  enabled: boolean;

  /** TOTP authenticators configured */
  totpEnabled: boolean;
  totpCount: number;

  /** WebAuthn credentials configured */
  webauthnEnabled: boolean;
  webauthnCount: number;

  /** Whether backup codes exist */
  backupCodesExist: boolean;
  backupCodesRemaining: number;
}
