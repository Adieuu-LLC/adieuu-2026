/**
 * DM Message Service
 *
 * Handles encryption and decryption of DM messages using the hybrid
 * encryption scheme (X25519 + ML-KEM). This service composes the
 * cryptographic operations needed for end-to-end encrypted messaging.
 *
 * SECURITY ARCHITECTURE:
 * - Messages are encrypted with a random session key (ChaCha20-Poly1305 or AES-256-GCM)
 * - Session key is wrapped for each recipient device using hybrid encryption
 * - Messages are signed with the sender's Ed25519 signing key
 * - Signature covers: ciphertext || nonce || serialized wrapped keys
 *
 * @module services/dmMessageService
 */

import {
  randomBytes,
  encrypt,
  decrypt,
  sign,
  verify,
  wrapSessionKeyForRecipients,
  findAndUnwrapSessionKey,
  toBase64,
  fromBase64,
  toBytes,
  fromBytes,
  concatBytes,
  clearBytes,
  deriveConversationId,
  deriveSenderHintKey,
  deriveSenderHintNonce,
  getSigningPublicKey,
  SESSION_KEY_SIZE,
  type CryptoProfile,
  type WrappedKey,
  type IdentityPublicKeys as CryptoIdentityPublicKeys,
} from '@adieuu/crypto';
import type { SerializedWrappedKey, PreKeyType } from '@adieuu/shared';

/**
 * Public keys needed for message encryption (subset of full IdentityPublicKeys).
 * Signing key is not needed for encryption - only for signature verification.
 */
export interface RecipientPublicKeys {
  /** X25519 public key (32 bytes) */
  ecdh: Uint8Array;
  /** ML-KEM public key */
  kem: Uint8Array;
  /** Which crypto profile these keys use */
  profile: CryptoProfile;
}

/**
 * Decrypted message content structure.
 * This is what the user sees after decryption.
 */
export interface DecryptedMessageContent {
  /** The plaintext message */
  text: string;
  /** Sender's identity ID (verified via signature) */
  fromIdentityId: string;
  /** Sender's device ID (if included in message) */
  fromDeviceId?: string;
  /** Message version for forward compatibility */
  version: number;
}

/**
 * Input for encrypting a DM message.
 */
export interface EncryptMessageInput {
  /** The plaintext message to encrypt */
  text: string;
  /** Sender's identity ID */
  fromIdentityId: string;
  /** Sender's device ID */
  fromDeviceId?: string;
  /** All recipient devices' public keys (including sender's own devices) */
  recipientKeys: Array<{
    identityId: string;
    deviceId: string;
    publicKeys: RecipientPublicKeys;
  }>;
  /** Sender's signing private key (Ed25519) */
  signingPrivateKey: Uint8Array;
  /** Crypto profile to use */
  cryptoProfile?: CryptoProfile;
}

/**
 * Result of message encryption.
 */
export interface EncryptedMessage {
  /** Encrypted message content (base64) */
  ciphertext: string;
  /** Encryption nonce (base64) */
  nonce: string;
  /** Session key wrapped for each recipient device (serialized) */
  wrappedKeys: SerializedWrappedKey[];
  /** Ed25519 signature over the message (base64) */
  signature: string;
  /** Crypto profile used */
  cryptoProfile: CryptoProfile;
}

/**
 * Input for decrypting a DM message.
 */
export interface DecryptMessageInput {
  /** Encrypted message content (base64) */
  ciphertext: string;
  /** Encryption nonce (base64) */
  nonce: string;
  /** Wrapped keys from the message */
  wrappedKeys: SerializedWrappedKey[];
  /** Ed25519 signature (base64) */
  signature: string;
  /** Recipient's identity ID */
  recipientIdentityId: string;
  /** Recipient's device ID (if deviceId was used in wrapping) */
  recipientDeviceId?: string;
  /** Recipient's ECDH private key */
  ecdhPrivateKey: Uint8Array;
  /** Recipient's KEM private key */
  kemPrivateKey: Uint8Array;
  /** Sender's signing public key for verification (base64) */
  senderSigningPublicKey: string;
  /** Crypto profile used */
  cryptoProfile?: CryptoProfile;
}

/**
 * Serializes a WrappedKey to the format stored in the database.
 */
function serializeWrappedKey(
  wk: WrappedKey,
  deviceId: string,
  preKeyType: PreKeyType = 'static',
  preKeyIds?: { oneTimePreKeyId?: string; signedPreKeyId?: string; oneTimeKemCiphertext?: string }
): SerializedWrappedKey {
  return {
    identityId: wk.identityId,
    deviceId,
    ephemeralPublicKey: toBase64(wk.ephemeralPublicKey),
    kemCiphertext: toBase64(wk.kemCiphertext),
    wrappedSessionKey: toBase64(wk.wrappedSessionKey),
    wrappingNonce: toBase64(wk.wrappingNonce),
    preKeyType,
    ...preKeyIds,
  };
}

/**
 * Deserializes a stored WrappedKey back to binary format.
 */
function deserializeWrappedKey(swk: SerializedWrappedKey): WrappedKey {
  return {
    identityId: swk.identityId,
    ephemeralPublicKey: fromBase64(swk.ephemeralPublicKey),
    kemCiphertext: fromBase64(swk.kemCiphertext),
    wrappedSessionKey: fromBase64(swk.wrappedSessionKey),
    wrappingNonce: fromBase64(swk.wrappingNonce),
  };
}


/**
 * Encrypts a DM message for the specified recipients.
 *
 * Flow:
 * 1. Create message content JSON with sender info
 * 2. Generate random session key
 * 3. Encrypt content with session key
 * 4. Wrap session key for each recipient device
 * 5. Sign: ciphertext || nonce || serialized wrapped keys
 *
 * @param input - Encryption parameters
 * @returns Encrypted message ready to send to the API
 */
export function encryptDmMessage(input: EncryptMessageInput): EncryptedMessage {
  const profile = input.cryptoProfile ?? 'default';

  // 1. Create message content
  const content: DecryptedMessageContent = {
    text: input.text,
    fromIdentityId: input.fromIdentityId,
    fromDeviceId: input.fromDeviceId,
    version: 1,
  };
  const plaintext = toBytes(JSON.stringify(content));

  // 2. Generate session key
  const sessionKey = randomBytes(SESSION_KEY_SIZE);

  // 3. Encrypt content
  const { ciphertext: ciphertextBytes, nonce: nonceBytes } = encrypt(
    sessionKey,
    plaintext,
    profile
  );

  // 4. Wrap session key for each recipient
  // Note: wrapSessionKeyForRecipients expects CryptoIdentityPublicKeys which includes signing,
  // but the function only uses ecdh/kem/profile. We cast here since signing isn't needed.
  const recipientsForCrypto = input.recipientKeys.map((r) => ({
    identityId: r.identityId,
    publicKeys: r.publicKeys as CryptoIdentityPublicKeys,
  }));
  const wrappedKeysRaw = wrapSessionKeyForRecipients(sessionKey, recipientsForCrypto);

  // Serialize wrapped keys with deviceId association
  const wrappedKeys: SerializedWrappedKey[] = wrappedKeysRaw.map((wk, idx) => {
    return serializeWrappedKey(wk, input.recipientKeys[idx]!.deviceId);
  });

  // Clear session key from memory
  clearBytes(sessionKey);

  // 5. Create signature data and sign
  const ciphertextB64 = toBase64(ciphertextBytes);
  const nonceB64 = toBase64(nonceBytes);
  const wrappedKeysJson = JSON.stringify(wrappedKeys);
  const wrappedKeysBytes = toBytes(wrappedKeysJson);
  const signatureData = concatBytes(
    ciphertextBytes,
    nonceBytes,
    wrappedKeysBytes
  );

  // Debug logging for signature creation
  console.log('[DM Encrypt] Creating signature...');
  console.log('[DM Encrypt] wrappedKeysJson length:', wrappedKeysJson.length);
  console.log('[DM Encrypt] wrappedKeysJson first 100 chars:', wrappedKeysJson.slice(0, 100));
  console.log('[DM Encrypt] wrappedKeysJson last 100 chars:', wrappedKeysJson.slice(-100));
  console.log('[DM Encrypt] wrappedKeysBytes checksum:', Array.from(wrappedKeysBytes.slice(0, 8)).join(','), '...', Array.from(wrappedKeysBytes.slice(-8)).join(','));
  console.log('[DM Encrypt] ciphertext length:', ciphertextBytes.length);
  console.log('[DM Encrypt] nonce length:', nonceBytes.length);
  console.log('[DM Encrypt] signatureData length:', signatureData.length);

  // Derive public key from private key to verify consistency
  const derivedPublicKey = getSigningPublicKey(input.signingPrivateKey);
  console.log('[DM Encrypt] Derived signing public key (base64):', toBase64(derivedPublicKey));

  const signatureBytes = sign(input.signingPrivateKey, signatureData);
  console.log('[DM Encrypt] signature (base64):', toBase64(signatureBytes));

  return {
    ciphertext: ciphertextB64,
    nonce: nonceB64,
    wrappedKeys,
    signature: toBase64(signatureBytes),
    cryptoProfile: profile,
  };
}

/**
 * Decrypts a DM message.
 *
 * Flow:
 * 1. Verify signature
 * 2. Find wrapped key for our identity/device
 * 3. Unwrap session key
 * 4. Decrypt content
 * 5. Parse and validate message content
 *
 * @param input - Decryption parameters
 * @returns Decrypted message content
 * @throws Error if signature verification fails or decryption fails
 */
export function decryptDmMessage(input: DecryptMessageInput): DecryptedMessageContent {
  const profile = input.cryptoProfile ?? 'default';

  const ciphertextBytes = fromBase64(input.ciphertext);
  const nonceBytes = fromBase64(input.nonce);
  const signatureBytes = fromBase64(input.signature);
  const signingPublicKey = fromBase64(input.senderSigningPublicKey);

  // 1. Verify signature
  const wrappedKeysJson = JSON.stringify(input.wrappedKeys);
  const wrappedKeysBytes = toBytes(wrappedKeysJson);
  const signatureData = concatBytes(
    ciphertextBytes,
    nonceBytes,
    wrappedKeysBytes
  );

  // Debug logging for signature verification
  console.log('[DM Decrypt] Verifying signature...');
  console.log('[DM Decrypt] wrappedKeysJson length:', wrappedKeysJson.length);
  console.log('[DM Decrypt] wrappedKeysJson first 100 chars:', wrappedKeysJson.slice(0, 100));
  console.log('[DM Decrypt] wrappedKeysJson last 100 chars:', wrappedKeysJson.slice(-100));
  console.log('[DM Decrypt] wrappedKeysBytes checksum:', Array.from(wrappedKeysBytes.slice(0, 8)).join(','), '...', Array.from(wrappedKeysBytes.slice(-8)).join(','));
  console.log('[DM Decrypt] signingPublicKey (base64):', input.senderSigningPublicKey);
  console.log('[DM Decrypt] signature (base64):', input.signature);
  console.log('[DM Decrypt] ciphertext length:', ciphertextBytes.length);
  console.log('[DM Decrypt] nonce length:', nonceBytes.length);
  console.log('[DM Decrypt] signatureData length:', signatureData.length);

  const isValid = verify(signingPublicKey, signatureData, signatureBytes);
  console.log('[DM Decrypt] Signature valid:', isValid);

  if (!isValid) {
    throw new Error('Message signature verification failed');
  }

  // 2. Find wrapped key for our identity
  // First try to find by deviceId if provided
  let wrappedKey: SerializedWrappedKey | undefined;
  if (input.recipientDeviceId) {
    wrappedKey = input.wrappedKeys.find(
      (wk) => wk.identityId === input.recipientIdentityId && wk.deviceId === input.recipientDeviceId
    );
  }
  // Fall back to identity-only match
  if (!wrappedKey) {
    wrappedKey = input.wrappedKeys.find(
      (wk) => wk.identityId === input.recipientIdentityId
    );
  }

  if (!wrappedKey) {
    throw new Error('Message not encrypted for this identity/device');
  }

  // 3. Unwrap session key
  const wrappedKeyBinary = deserializeWrappedKey(wrappedKey);
  const wrappedKeysArray = [wrappedKeyBinary];
  const sessionKey = findAndUnwrapSessionKey(
    wrappedKeysArray,
    input.recipientIdentityId,
    input.ecdhPrivateKey,
    input.kemPrivateKey,
    profile
  );

  if (!sessionKey) {
    throw new Error('Failed to unwrap session key');
  }

  // 4. Decrypt content
  let plaintext: Uint8Array;
  try {
    plaintext = decrypt(sessionKey, ciphertextBytes, nonceBytes, profile);
  } finally {
    clearBytes(sessionKey);
  }

  // 5. Parse and validate content
  const contentJson = fromBytes(plaintext);
  let content: DecryptedMessageContent;
  try {
    content = JSON.parse(contentJson) as DecryptedMessageContent;
  } catch {
    throw new Error('Failed to parse decrypted message content');
  }

  // Validate required fields
  if (!content.text || typeof content.text !== 'string') {
    throw new Error('Invalid message content: missing text');
  }
  if (!content.fromIdentityId || typeof content.fromIdentityId !== 'string') {
    throw new Error('Invalid message content: missing fromIdentityId');
  }

  return content;
}

/**
 * Derives the blinded conversation ID for a DM between two identities.
 * This is a convenience re-export of the crypto library function.
 */
export { deriveConversationId };

/**
 * Generates a unique client message ID for deduplication.
 */
export function generateClientMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8);
  return `${timestamp}-${toBase64(random).replace(/[+/=]/g, '')}`;
}

/**
 * Encrypts the sender's identity ID for pre-verification discovery.
 *
 * The encrypted sender hint allows recipients to identify the sender
 * and fetch their signing key before decrypting potentially untrusted
 * message payloads. The server cannot decrypt this since it doesn't
 * know the participant IDs that compose the conversationId.
 *
 * @param conversationId - The blinded conversation ID (64-char hex)
 * @param senderId - The sender's identity ID to encrypt
 * @param clientMessageId - Client-generated message ID (used for nonce derivation)
 * @param profile - Crypto profile (default: 'default')
 * @returns Base64-encoded encrypted sender ID
 */
export function encryptSenderId(
  conversationId: string,
  senderId: string,
  clientMessageId: string,
  profile: CryptoProfile = 'default'
): string {
  const key = deriveSenderHintKey(conversationId, profile);
  const nonce = deriveSenderHintNonce(clientMessageId);
  const plaintext = toBytes(senderId);

  const { ciphertext } = encrypt(key, plaintext, profile, nonce);

  clearBytes(key);

  return toBase64(ciphertext);
}

/**
 * Decrypts the sender hint to discover the sender's identity.
 *
 * Used by recipients to identify the sender before signature verification.
 * This allows fetching the sender's signing key without decrypting the
 * full message payload first.
 *
 * @param conversationId - The blinded conversation ID (64-char hex)
 * @param encryptedSenderId - Base64-encoded encrypted sender ID
 * @param clientMessageId - Client-generated message ID (used for nonce derivation)
 * @param profile - Crypto profile (default: 'default')
 * @returns The sender's identity ID
 * @throws Error if decryption fails
 */
export function decryptSenderHint(
  conversationId: string,
  encryptedSenderId: string,
  clientMessageId: string,
  profile: CryptoProfile = 'default'
): string {
  const key = deriveSenderHintKey(conversationId, profile);
  const nonce = deriveSenderHintNonce(clientMessageId);
  const ciphertext = fromBase64(encryptedSenderId);

  let plaintext: Uint8Array;
  try {
    plaintext = decrypt(key, ciphertext, nonce, profile);
  } finally {
    clearBytes(key);
  }

  return fromBytes(plaintext);
}
