/**
 * Identity Backup Codes model
 *
 * Stores hashed recovery codes for an identity. Codes are generated on
 * identity creation and whenever the passphrase is changed, giving the
 * user a fallback if they lose access to their passphrase.
 *
 * SECURITY NOTES:
 * - Plaintext codes are returned exactly once (at generation time)
 * - Only SHA-256 hashes are persisted
 * - Codes are consumed on use (removed from the array)
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Identity backup codes document stored in MongoDB.
 * One document per identity containing all remaining hashed codes.
 */
export interface IdentityBackupCodesDocument extends BaseDocument {
  /** Reference to the identity document */
  identityId: ObjectId;

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
export interface CreateIdentityBackupCodesInput {
  identityId: ObjectId;
  hashedCodes: string[];
  totalGenerated: number;
}
