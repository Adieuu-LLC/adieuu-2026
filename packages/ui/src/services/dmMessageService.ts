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
  wrapSessionKey,
  wrapSessionKeyWithPreKeys,
  unwrapSessionKeyWithPreKeys,
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
  SESSION_KEY_SIZE,
  type CryptoProfile,
  type WrappedKey,
  type IdentityPublicKeys as CryptoIdentityPublicKeys,
  type SignedPreKeyPublic,
  type OneTimePreKeyPublic,
  type PreKeyWrappedKey,
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
 *
 * Version history:
 *   v1: text-only messages
 *   v2: adds optional attachmentIds for referencing dm_attachments records
 */
export interface DecryptedMessageContent {
  /**
   * Plaintext body. May be `""` only when `attachmentIds` is a non-empty array
   * (attachment-only message). Without attachments, must be non-empty after trim.
   */
  text: string;
  /** Sender's identity ID (verified via signature) */
  fromIdentityId: string;
  /** Sender's device ID (if included in message) */
  fromDeviceId?: string;
  /**
   * References to dm_attachments records (v2+).
   * Actual attachment content/metadata lives in a separate encrypted collection
   * so the server can answer "which messages have attachments?" without
   * knowing their types or contents.
   */
  attachmentIds?: string[];
  /** Message version for forward compatibility */
  version: number;
}

/**
 * Pre-key data for a recipient device when using forward secrecy wrapping.
 * When present, the session key is wrapped using pre-key exchange instead of
 * static device keys.
 */
export interface PreKeyRecipientData {
  signedPreKey: SignedPreKeyPublic;
  signedPreKeyId: string;
  oneTimePreKey?: OneTimePreKeyPublic;
  oneTimePreKeyId?: string;
}

/**
 * Input for encrypting a DM message.
 */
export interface EncryptMessageInput {
  /**
   * Plaintext body. May be empty only when `attachmentIds` is non-empty
   * (attachment-only message).
   */
  text: string;
  /** Sender's identity ID */
  fromIdentityId: string;
  /** Sender's device ID */
  fromDeviceId?: string;
  /**
   * All recipient devices' public keys (including sender's own devices).
   * When `preKeyData` is provided, that device uses pre-key wrapping (FS);
   * otherwise static device key wrapping is used.
   */
  recipientKeys: Array<{
    identityId: string;
    deviceId: string;
    publicKeys: RecipientPublicKeys;
    preKeyData?: PreKeyRecipientData;
  }>;
  /** Sender's signing private key (Ed25519) */
  signingPrivateKey: Uint8Array;
  /** Crypto profile to use */
  cryptoProfile?: CryptoProfile;
  /**
   * v2: references to dm_attachments. When non-empty, `text` may be empty (attachment-only).
   */
  attachmentIds?: string[];
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
 * Pre-key private keys for decrypting FS messages (preKeyType !== 'static').
 */
export interface PreKeyPrivateKeys {
  spkEcdhPrivateKey: Uint8Array;
  spkKemPrivateKey: Uint8Array;
  otpkEcdhPrivateKey?: Uint8Array;
  otpkKemPrivateKey?: Uint8Array;
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
  /** Recipient's static ECDH private key (used for static wrapping) */
  ecdhPrivateKey: Uint8Array;
  /** Recipient's static KEM private key (used for static wrapping) */
  kemPrivateKey: Uint8Array;
  /** Sender's signing public key for verification (base64) */
  senderSigningPublicKey: string;
  /** Crypto profile used */
  cryptoProfile?: CryptoProfile;
  /** Pre-key private keys for FS-encrypted messages. Required when the target wrapped key has preKeyType !== 'static'. */
  preKeyPrivateKeys?: PreKeyPrivateKeys;
}

/**
 * Serializes a static WrappedKey to the format stored in the database.
 */
function serializeStaticWrappedKey(
  wk: WrappedKey,
  deviceId: string,
): SerializedWrappedKey {
  return {
    identityId: wk.identityId,
    deviceId,
    ephemeralPublicKey: toBase64(wk.ephemeralPublicKey),
    kemCiphertext: toBase64(wk.kemCiphertext),
    wrappedSessionKey: toBase64(wk.wrappedSessionKey),
    wrappingNonce: toBase64(wk.wrappingNonce),
    preKeyType: 'static',
  };
}

/**
 * Serializes a PreKeyWrappedKey to the format stored in the database.
 * Maps spkKemCiphertext -> kemCiphertext and otpkKemCiphertext -> oneTimeKemCiphertext.
 */
function serializePreKeyWrappedKey(
  wk: PreKeyWrappedKey,
  identityId: string,
  deviceId: string,
  preKeyData: PreKeyRecipientData,
): SerializedWrappedKey {
  const preKeyType: PreKeyType = preKeyData.oneTimePreKey ? 'otpk' : 'spk';
  return {
    identityId,
    deviceId,
    ephemeralPublicKey: toBase64(wk.ephemeralPublicKey),
    kemCiphertext: toBase64(wk.spkKemCiphertext),
    wrappedSessionKey: toBase64(wk.wrappedSessionKey),
    wrappingNonce: toBase64(wk.wrappingNonce),
    preKeyType,
    oneTimePreKeyId: preKeyData.oneTimePreKeyId,
    signedPreKeyId: preKeyData.signedPreKeyId,
    oneTimeKemCiphertext: wk.otpkKemCiphertext ? toBase64(wk.otpkKemCiphertext) : undefined,
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

  const attachmentIds = input.attachmentIds;
  const hasAttachments =
    Array.isArray(attachmentIds) &&
    attachmentIds.length > 0 &&
    attachmentIds.every((id) => typeof id === 'string' && id.trim().length > 0);

  if (attachmentIds !== undefined && !Array.isArray(attachmentIds)) {
    throw new Error('attachmentIds must be an array when provided');
  }
  if (!hasAttachments && input.text.trim() === '') {
    throw new Error('Cannot encrypt empty message without attachments');
  }

  // 1. Create message content (v2: supports attachmentIds)
  const content: DecryptedMessageContent = {
    text: input.text,
    fromIdentityId: input.fromIdentityId,
    fromDeviceId: input.fromDeviceId,
    version: 2,
    ...(hasAttachments ? { attachmentIds } : {}),
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

  // 4. Wrap session key for each recipient device.
  // Each device may use either pre-key wrapping (FS) or static device key wrapping,
  // depending on whether preKeyData is provided.
  const wrappedKeys: SerializedWrappedKey[] = input.recipientKeys.map((r) => {
    if (r.preKeyData) {
      const wrapped = wrapSessionKeyWithPreKeys(
        sessionKey,
        r.preKeyData.signedPreKey,
        r.preKeyData.oneTimePreKey,
        profile
      );
      return serializePreKeyWrappedKey(wrapped, r.identityId, r.deviceId, r.preKeyData);
    }
    const wrapped = wrapSessionKey(
      sessionKey,
      r.publicKeys as CryptoIdentityPublicKeys,
      r.identityId
    );
    return serializeStaticWrappedKey(wrapped, r.deviceId);
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

  const signatureBytes = sign(input.signingPrivateKey, signatureData);

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

  const isValid = verify(signingPublicKey, signatureData, signatureBytes);

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

  // 3. Unwrap session key -- branch on pre-key type
  let sessionKey: Uint8Array | null;

  if (wrappedKey.preKeyType && wrappedKey.preKeyType !== 'static') {
    if (!input.preKeyPrivateKeys) {
      throw new Error(
        `Pre-key private keys required to decrypt FS message (preKeyType: ${wrappedKey.preKeyType})`
      );
    }

    const preKeyWrapped: PreKeyWrappedKey = {
      ephemeralPublicKey: fromBase64(wrappedKey.ephemeralPublicKey),
      spkKemCiphertext: fromBase64(wrappedKey.kemCiphertext),
      otpkKemCiphertext: wrappedKey.oneTimeKemCiphertext
        ? fromBase64(wrappedKey.oneTimeKemCiphertext)
        : undefined,
      wrappedSessionKey: fromBase64(wrappedKey.wrappedSessionKey),
      wrappingNonce: fromBase64(wrappedKey.wrappingNonce),
    };

    try {
      sessionKey = unwrapSessionKeyWithPreKeys(
        preKeyWrapped,
        input.preKeyPrivateKeys.spkEcdhPrivateKey,
        input.preKeyPrivateKeys.spkKemPrivateKey,
        input.preKeyPrivateKeys.otpkEcdhPrivateKey,
        input.preKeyPrivateKeys.otpkKemPrivateKey,
        profile
      );
    } catch {
      throw new Error('Failed to unwrap session key with pre-keys (key may have been rotated/deleted)');
    }
  } else {
    const wrappedKeyBinary = deserializeWrappedKey(wrappedKey);
    const wrappedKeysArray = [wrappedKeyBinary];
    sessionKey = findAndUnwrapSessionKey(
      wrappedKeysArray,
      input.recipientIdentityId,
      input.ecdhPrivateKey,
      input.kemPrivateKey,
      profile
    );
  }

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

  // Validate required fields (compatible with v1 and v2 payloads)
  if (content.attachmentIds !== undefined && !Array.isArray(content.attachmentIds)) {
    throw new Error('Invalid message content: attachmentIds must be an array');
  }
  if (Array.isArray(content.attachmentIds)) {
    for (const id of content.attachmentIds) {
      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new Error('Invalid message content: attachmentIds must be non-empty strings');
      }
    }
  }

  const hasAttachments =
    Array.isArray(content.attachmentIds) && content.attachmentIds.length > 0;

  if (content.text === undefined) {
    if (!hasAttachments) {
      throw new Error('Invalid message content: missing text');
    }
    content.text = '';
  } else if (typeof content.text !== 'string') {
    throw new Error('Invalid message content: text must be a string');
  }

  if (!hasAttachments && content.text.trim() === '') {
    throw new Error('Invalid message content: text cannot be empty without attachments');
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
