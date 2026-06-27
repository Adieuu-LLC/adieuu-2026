/**
 * Key Backup Export & Import Service
 *
 * Handles exporting and importing identity backups as encrypted binary files.
 * Supports device keys and ciphers (both already encrypted with the identity
 * passphrase wrapping key).
 *
 * Export format: `.adieuu-keys` binary file
 *   [4 bytes: header length as uint32 big-endian]
 *   [header JSON bytes]
 *   [AES-256-GCM ciphertext + 16-byte auth tag]
 *
 * Key derivation chain:
 *   export password
 *     -> Argon2id (HIGH_SECURITY: 256 MB, timeCost 4, parallelism 4)
 *     -> HKDF-SHA3-256 (info = 'adieuu-key-backup-v1')
 *     -> 32-byte AES-256-GCM key
 *
 * The encrypted payload contains StoredDeviceKeys and/or StoredCipher records
 * that are already encrypted with the identity passphrase. The outer export
 * encryption is an independent layer -- two passwords are needed to reach
 * raw key material.
 *
 * @module services/keyBackupService
 */

import {
  deriveKeyFromPassword,
  generateArgon2Salt,
  hkdfSha3_256,
  KDF_INFO,
  encryptAES256GCM,
  decryptAES256GCM,
  toBase64,
  fromBase64,
  clearBytes,
  randomBytes,
  unwrapEntropy,
  ARGON2_HIGH_SECURITY,
  AES_GCM_NONCE_SIZE,
} from '@adieuu/crypto';

import { getDeviceKeysForIdentity, type StoredDeviceKeys } from './deviceKeyStorage';
import { getStoredCiphersForIdentity, storePreEncryptedCipher, type StoredCipher } from '../hooks/useCipherStore';

// ============================================================================
// Constants
// ============================================================================

const BACKUP_FORMAT = 'adieuu-key-backup';
const BACKUP_VERSION = 1;
const PAYLOAD_VERSION = 1;
const MIN_EXPORT_PASSWORD_LENGTH = 8;

// ============================================================================
// Types
// ============================================================================

export interface KeyBackupHeader {
  v: number;
  format: string;
  createdAt: string;
  kdf: {
    algorithm: 'argon2id';
    timeCost: number;
    memoryCost: number;
    parallelism: number;
    salt: string;
  };
  hkdf: {
    algorithm: 'hkdf-sha3-256';
    info: string;
  };
  encryption: {
    algorithm: 'AES-256-GCM';
    nonce: string;
  };
}

/** Content types that can be included in a backup. */
export type BackupContentType = 'devices' | 'ciphers';

export interface KeyBackupPayload {
  payloadVersion: number;
  identityId: string;
  wrappingSalt: string;
  devices: StoredDeviceKeys[];
  /** Stored ciphers (added in payload v1, optional for backward compat). */
  ciphers?: StoredCipher[];
}

export interface KeyBackupImportResult {
  imported: number;
  skipped: number;
  ciphersImported: number;
  ciphersSkipped: number;
}

export class KeyBackupError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'KeyBackupError';
  }
}

// ============================================================================
// Key Derivation
// ============================================================================

async function deriveExportKey(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  const ikm = await deriveKeyFromPassword({
    password,
    salt,
    memoryCost: ARGON2_HIGH_SECURITY.memoryCost,
    timeCost: ARGON2_HIGH_SECURITY.timeCost,
    parallelism: ARGON2_HIGH_SECURITY.parallelism,
    outputLength: ARGON2_HIGH_SECURITY.outputLength,
  });

  const key = hkdfSha3_256(ikm, salt, KDF_INFO.KEY_BACKUP, 32);

  clearBytes(ikm);

  return key;
}

// ============================================================================
// Export
// ============================================================================

/**
 * Exports selected identity data as an encrypted backup file.
 *
 * @param identityId - The identity whose data to export
 * @param wrappingSalt - The wrapping salt for the identity (needed for import)
 * @param exportPassword - User-chosen password to encrypt the backup
 * @param content - Which data types to include (defaults to all)
 * @returns Binary data for the .adieuu-keys file
 */
export async function exportKeyBackup(
  identityId: string,
  wrappingSalt: Uint8Array,
  exportPassword: string,
  content: BackupContentType[] = ['devices', 'ciphers']
): Promise<Uint8Array> {
  if (exportPassword.length < MIN_EXPORT_PASSWORD_LENGTH) {
    throw new KeyBackupError(
      `Export password must be at least ${MIN_EXPORT_PASSWORD_LENGTH} characters`,
      'PASSWORD_TOO_SHORT'
    );
  }

  const devices = content.includes('devices')
    ? await getDeviceKeysForIdentity(identityId)
    : [];
  const ciphers = content.includes('ciphers')
    ? await getStoredCiphersForIdentity(identityId)
    : [];

  if (devices.length === 0 && ciphers.length === 0) {
    throw new KeyBackupError(
      'Nothing to export for this identity',
      'NO_DATA'
    );
  }

  const payload: KeyBackupPayload = {
    payloadVersion: PAYLOAD_VERSION,
    identityId,
    wrappingSalt: toBase64(wrappingSalt),
    devices,
    ciphers: ciphers.length > 0 ? ciphers : undefined,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  const kdfSalt = generateArgon2Salt(ARGON2_HIGH_SECURITY.saltLength);
  const nonce = randomBytes(AES_GCM_NONCE_SIZE);

  const exportKey = await deriveExportKey(exportPassword, kdfSalt);

  let encrypted: { ciphertext: Uint8Array; nonce: Uint8Array };
  try {
    encrypted = encryptAES256GCM(exportKey, payloadBytes, nonce);
  } finally {
    clearBytes(exportKey);
    clearBytes(payloadBytes);
  }

  const header: KeyBackupHeader = {
    v: BACKUP_VERSION,
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    kdf: {
      algorithm: 'argon2id',
      timeCost: ARGON2_HIGH_SECURITY.timeCost,
      memoryCost: ARGON2_HIGH_SECURITY.memoryCost,
      parallelism: ARGON2_HIGH_SECURITY.parallelism,
      salt: toBase64(kdfSalt),
    },
    hkdf: {
      algorithm: 'hkdf-sha3-256',
      info: KDF_INFO.KEY_BACKUP,
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      nonce: toBase64(encrypted.nonce),
    },
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(header));

  // Binary layout: [4-byte header length (big-endian)] [header] [ciphertext]
  const headerLength = new Uint8Array(4);
  new DataView(headerLength.buffer).setUint32(0, headerBytes.length, false);

  const result = new Uint8Array(
    4 + headerBytes.length + encrypted.ciphertext.length
  );
  result.set(headerLength, 0);
  result.set(headerBytes, 4);
  result.set(encrypted.ciphertext, 4 + headerBytes.length);

  return result;
}

// ============================================================================
// Import
// ============================================================================

/**
 * Parses and validates the header from a backup file without decrypting.
 */
export function parseKeyBackupHeader(data: Uint8Array): KeyBackupHeader {
  if (data.length < 4) {
    throw new KeyBackupError(
      'The backup file is damaged or not a valid Adieuu key backup.',
      'CORRUPT_FILE'
    );
  }

  const headerLength = new DataView(
    data.buffer,
    data.byteOffset,
    4
  ).getUint32(0, false);

  if (headerLength === 0 || headerLength > data.length - 4) {
    throw new KeyBackupError(
      'The backup file is damaged or not a valid Adieuu key backup.',
      'CORRUPT_FILE'
    );
  }

  let header: KeyBackupHeader;
  try {
    const headerJson = new TextDecoder().decode(
      data.subarray(4, 4 + headerLength)
    );
    header = JSON.parse(headerJson) as KeyBackupHeader;
  } catch {
    throw new KeyBackupError(
      'The backup file is damaged or not a valid Adieuu key backup.',
      'CORRUPT_FILE'
    );
  }

  if (header.format !== BACKUP_FORMAT) {
    throw new KeyBackupError(
      'The backup file is damaged or not a valid Adieuu key backup.',
      'INVALID_FORMAT'
    );
  }

  if (header.v > BACKUP_VERSION) {
    throw new KeyBackupError(
      'This backup was created with a newer version of Adieuu. Please update.',
      'UNSUPPORTED_VERSION'
    );
  }

  return header;
}

/**
 * Decrypts a backup file and returns the parsed payload.
 *
 * @param data - Raw binary data from the .adieuu-keys file
 * @param exportPassword - The password used when the backup was created
 * @returns The decrypted payload containing device keys and wrapping salt
 */
export async function decryptKeyBackup(
  data: Uint8Array,
  exportPassword: string
): Promise<KeyBackupPayload> {
  const header = parseKeyBackupHeader(data);

  const headerLength = new DataView(
    data.buffer,
    data.byteOffset,
    4
  ).getUint32(0, false);

  const ciphertext = data.subarray(4 + headerLength);
  if (ciphertext.length === 0) {
    throw new KeyBackupError(
      'The backup file contains no device keys.',
      'EMPTY_PAYLOAD'
    );
  }

  const kdfSalt = fromBase64(header.kdf.salt);
  const nonce = fromBase64(header.encryption.nonce);

  const exportKey = await deriveExportKey(exportPassword, kdfSalt);

  let plaintext: Uint8Array;
  try {
    plaintext = decryptAES256GCM(exportKey, ciphertext, nonce);
  } catch {
    throw new KeyBackupError(
      'Incorrect export password. The backup could not be decrypted.',
      'WRONG_PASSWORD'
    );
  } finally {
    clearBytes(exportKey);
  }

  let payload: KeyBackupPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext)) as KeyBackupPayload;
  } catch {
    throw new KeyBackupError(
      'The backup file is damaged or not a valid Adieuu key backup.',
      'CORRUPT_PAYLOAD'
    );
  } finally {
    clearBytes(plaintext);
  }

  if (!payload.identityId || !Array.isArray(payload.devices)) {
    throw new KeyBackupError(
      'The backup file is damaged or not a valid Adieuu key backup.',
      'INVALID_PAYLOAD'
    );
  }

  const hasCiphers = Array.isArray(payload.ciphers) && payload.ciphers.length > 0;
  if (payload.devices.length === 0 && !hasCiphers) {
    throw new KeyBackupError(
      'The backup file contains no data.',
      'NO_DATA'
    );
  }

  return payload;
}

function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(arr.length);
  copy.set(arr);
  return copy.buffer as ArrayBuffer;
}

/**
 * Probes whether a backup payload's wrapped material can be decrypted with the
 * given wrapping key.
 *
 * This is used by the import flow to detect a "same wrapping salt but different
 * derived key" situation: a passphrase change keeps the per-identity wrapping
 * salt but changes the derived wrapping key, so a backup exported before the
 * change has the same salt yet is no longer decryptable with the current key.
 * Salt comparison alone would miss this and import undecryptable records.
 *
 * @returns true if at least one record decrypts, false if a record exists but
 * does not decrypt, and null if the payload has no wrapped material to test.
 */
export async function backupPayloadDecryptsWith(
  payload: KeyBackupPayload,
  wrappingKey: Uint8Array,
): Promise<boolean | null> {
  const device = payload.devices[0];
  if (device) {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(wrappingKey),
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      );
      const ct = fromBase64(device.ecdhPrivateKeyEncrypted.ciphertext);
      const iv = fromBase64(device.ecdhPrivateKeyEncrypted.nonce);
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ct),
      );
      clearBytes(new Uint8Array(plaintext));
      return true;
    } catch {
      return false;
    }
  }

  const cipher = payload.ciphers?.[0];
  if (cipher) {
    try {
      await unwrapEntropy(cipher.encryptedEntropy, wrappingKey);
      return true;
    } catch {
      return false;
    }
  }

  return null;
}

/**
 * Applies an imported backup payload to local storage.
 *
 * Import is per-device/per-cipher: for each record in the payload, if a local
 * record with the same ID exists, the merge strategy is applied.
 *
 * Keys and ciphers are stored as-is (passthrough) since the inner passphrase
 * encryption is preserved. The wrapping salt must be handled separately by
 * the caller.
 *
 * @param payload - Decrypted backup payload from decryptKeyBackup
 * @param mergeStrategy - How to handle records that already exist locally
 * @param storeDeviceRecord - Function to persist a single StoredDeviceKeys record
 * @param storeCipherRecord - Function to persist a single StoredCipher record (defaults to storePreEncryptedCipher)
 * @returns Counts of imported and skipped devices/ciphers
 */
export async function applyKeyBackupImport(
  payload: KeyBackupPayload,
  mergeStrategy: 'skip' | 'replace',
  storeDeviceRecord: (record: StoredDeviceKeys) => Promise<void>,
  storeCipherRecord: (record: StoredCipher) => Promise<void> = storePreEncryptedCipher
): Promise<KeyBackupImportResult> {
  const existingKeys = await getDeviceKeysForIdentity(payload.identityId);
  const existingDeviceIds = new Set(existingKeys.map((k) => k.deviceId));

  let imported = 0;
  let skipped = 0;

  for (const device of payload.devices) {
    const exists = existingDeviceIds.has(device.deviceId);

    if (exists && mergeStrategy === 'skip') {
      skipped++;
      continue;
    }

    await storeDeviceRecord(device);
    imported++;
  }

  // Import ciphers (if present in payload)
  let ciphersImported = 0;
  let ciphersSkipped = 0;

  if (Array.isArray(payload.ciphers) && payload.ciphers.length > 0) {
    const existingCiphers = await getStoredCiphersForIdentity(payload.identityId);
    const existingCipherIds = new Set(existingCiphers.map((c) => c.cipherId));

    for (const cipher of payload.ciphers) {
      const exists = existingCipherIds.has(cipher.cipherId);

      if (exists && mergeStrategy === 'skip') {
        ciphersSkipped++;
        continue;
      }

      // When replacing or new, generate a fresh local ID to avoid key conflicts
      const localCipher: StoredCipher = exists
        ? { ...cipher, id: existingCiphers.find((c) => c.cipherId === cipher.cipherId)!.id }
        : { ...cipher, id: `cipher-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` };

      await storeCipherRecord(localCipher);
      ciphersImported++;
    }
  }

  return { imported, skipped, ciphersImported, ciphersSkipped };
}

/**
 * Generates the default export filename with the current date.
 */
export function getExportFilename(): string {
  const date = new Date().toISOString().split('T')[0];
  return `adieuu-keys-${date}.adieuu-keys`;
}
