/**
 * Identity Backup Codes Service
 *
 * Generates, verifies, and manages recovery codes for identities.
 * Codes are produced in the same XXXX-XXXX format used by the account-level
 * MFA backup codes for consistency.
 *
 * @module services/identity-backup-codes
 */

import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { config } from '../config';
import { randomUniformIndex } from '../utils/randomUniformIndex';
import { getIdentityBackupCodesRepository } from '../repositories/identity-backup-codes.repository';
import elog from '../utils/adieuuLogger';

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a single XXXX-XXXX backup code using cryptographically secure RNG.
 */
function generateSingleCode(): string {
  let code = '';
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    const idx = randomUniformIndex(BACKUP_CODE_ALPHABET.length);
    code += BACKUP_CODE_ALPHABET[idx];
  }
  return code.slice(0, 4) + '-' + code.slice(4);
}

/**
 * Hash a backup code for storage.
 * Uses SHA-256 with the identityId and server secret as binding material.
 */
function hashCode(code: string, identityId: string): string {
  const normalized = code.replace(/-/g, '').toUpperCase();
  const data = `${normalized}:${identityId}:${config.security.otpSecret}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate backup codes for an identity.
 * Returns the plaintext codes (shown once to the user) and persists
 * only the hashed versions. Any previously stored codes are replaced.
 */
export async function generateIdentityBackupCodes(identityId: string): Promise<string[]> {
  const repo = getIdentityBackupCodesRepository();
  const objectId = new ObjectId(identityId);

  const codes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateSingleCode();
    codes.push(code);
    hashedCodes.push(hashCode(code, identityId));
  }

  await repo.create({
    identityId: objectId,
    hashedCodes,
    totalGenerated: BACKUP_CODE_COUNT,
  });

  elog.info('Identity backup codes generated', {
    identityId,
    count: BACKUP_CODE_COUNT,
  });

  return codes;
}

/**
 * Verify and consume a backup code for an identity.
 * On success the code is removed from the stored set so it cannot be reused.
 */
export async function verifyIdentityBackupCode(
  identityId: string,
  code: string,
): Promise<{ success: boolean; remaining?: number; error?: string }> {
  const repo = getIdentityBackupCodesRepository();
  const doc = await repo.findByIdentityId(identityId);

  if (!doc || doc.hashedCodes.length === 0) {
    return { success: false, error: 'no_backup_codes' };
  }

  const hashedInput = hashCode(code, identityId);
  const index = doc.hashedCodes.indexOf(hashedInput);

  if (index === -1) {
    // Also try with the raw (non-hyphenated) form normalised
    const normalizedCode = code.replace(/-/g, '').toUpperCase();
    const hashedNormalized = hashCode(normalizedCode, identityId);
    const normalizedIndex = doc.hashedCodes.indexOf(hashedNormalized);
    if (normalizedIndex === -1) {
      return { success: false, error: 'invalid_code' };
    }
    doc.hashedCodes.splice(normalizedIndex, 1);
  } else {
    doc.hashedCodes.splice(index, 1);
  }

  await repo.updateCodes(identityId, doc.hashedCodes);

  elog.info('Identity backup code consumed', {
    identityId,
    remaining: doc.hashedCodes.length,
  });

  return { success: true, remaining: doc.hashedCodes.length };
}

/**
 * Get the number of remaining (unconsumed) backup codes for an identity.
 */
export async function getIdentityBackupCodesCount(identityId: string): Promise<number> {
  const repo = getIdentityBackupCodesRepository();
  const doc = await repo.findByIdentityId(identityId);
  return doc?.hashedCodes.length ?? 0;
}
