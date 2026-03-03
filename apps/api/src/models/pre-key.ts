/**
 * Pre-Key Model
 *
 * Represents cryptographic pre-keys used for forward secrecy in DMs.
 * Two types:
 * - Signed pre-keys: Medium-term keys rotated periodically, signed by identity Ed25519 key
 * - One-time pre-keys: Ephemeral keys consumed once per message exchange
 *
 * Pre-keys provide recipient-side forward secrecy: once a one-time pre-key's
 * private counterpart is deleted after decryption, the message cannot be
 * re-decrypted even if the device is later compromised.
 *
 * @module models/pre-key
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export type PreKeyType = 'signed' | 'one-time';

/**
 * Pre-key document stored in MongoDB.
 */
export interface PreKeyDocument extends BaseDocument {
  /** Identity that owns this pre-key */
  identityId: ObjectId;

  /** Device this pre-key belongs to */
  deviceId: string;

  /** Whether this is a signed pre-key or a one-time pre-key */
  keyType: PreKeyType;

  /** Client-generated key identifier (UUID) */
  keyId: string;

  /** X25519 public key for ECDH (base64) */
  ecdhPublicKey: string;

  /** ML-KEM public key for post-quantum (base64) */
  kemPublicKey: string;

  /** Ed25519 signature over the public keys (signed pre-keys only, base64) */
  signature?: string;

  /** Whether this one-time pre-key has been claimed by a sender */
  consumed: boolean;

  /** When this pre-key was claimed */
  consumedAt?: Date;

  /** Expiration time (signed pre-keys: rotation expiry; consumed OTPKs: cleanup TTL) */
  expiresAt?: Date;
}

/**
 * Input for creating a signed pre-key.
 */
export interface CreateSignedPreKeyInput {
  identityId: ObjectId;
  deviceId: string;
  keyId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
  signature: string;
  expiresAt: Date;
}

/**
 * Input for creating a batch of one-time pre-keys.
 */
export interface CreateOneTimePreKeyInput {
  identityId: ObjectId;
  deviceId: string;
  keyId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
}

/**
 * Public representation of a signed pre-key (returned to senders).
 */
export interface PublicSignedPreKey {
  keyId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
  signature: string;
}

/**
 * Public representation of a one-time pre-key (returned to senders).
 */
export interface PublicOneTimePreKey {
  keyId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
}

/**
 * Claimed pre-keys for a single device (returned by the claim endpoint).
 */
export interface ClaimedDevicePreKeys {
  deviceId: string;
  signedPreKey: PublicSignedPreKey | null;
  oneTimePreKey: PublicOneTimePreKey | null;
}

/**
 * Pre-key count information for a device (returned by the count endpoint).
 */
export interface PreKeyCountInfo {
  signedPreKey: { keyId: string; expiresAt: string } | null;
  oneTimePreKeysRemaining: number;
}

/** Maximum one-time pre-keys per upload batch */
export const MAX_OTPK_BATCH_SIZE = 200;

/** Maximum unconsumed one-time pre-keys stored per device */
export const MAX_OTPK_PER_DEVICE = 500;

/** Days after which consumed OTPKs are cleaned up */
export const CONSUMED_OTPK_TTL_DAYS = 30;
