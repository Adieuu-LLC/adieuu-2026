/**
 * Conversation Crypto Service
 *
 * Provides E2E encryption and decryption for conversation messages
 * and group names. Supports both static device key wrapping and
 * forward secrecy via pre-keys.
 *
 * SECURITY ARCHITECTURE:
 * - Each message uses a fresh random 256-bit session key
 * - Session key is wrapped per-device for all conversation participants
 * - Forward secrecy when pre-keys are available (SPK and/or OTPK)
 * - Messages signed with Ed25519 identity key for authenticity
 * - Group names encrypted with a key derived from conversationId
 *
 * @module services/conversationCryptoService
 */

import {
  encrypt,
  decrypt,
  wrapSessionKey,
  unwrapSessionKey,
  findAndUnwrapSessionKey,
  wrapSessionKeyWithPreKeys,
  unwrapSessionKeyWithPreKeys,
  computeRoutingTag,
  verifySignedPreKey,
  sign,
  verify,
  randomBytes,
  toBase64,
  fromBase64,
  concatBytes,
  toBytes,
  deriveKey,
  type CryptoProfile,
  type IdentityPublicKeys as CryptoIdentityPublicKeys,
  type WrappedKey,
  type PreKeyWrappedKey,
  type SignedPreKeyPublic,
  type OneTimePreKeyPublic,
} from '@adieuu/crypto';
import type {
  SerializedWrappedKey,
  MessageCryptoProfile,
  PublicMessage,
  ClaimedDevicePreKeys,
  PublicDevice,
} from '@adieuu/shared';

// ============================================================================
// Constants
// ============================================================================

const GROUP_NAME_KDF_INFO = 'adieuu-conv-name-v1';
const MESSAGE_SIGN_DOMAIN = 'adieuu-msg-v1';

// ============================================================================
// Types
// ============================================================================

export interface RecipientKeys {
  identityId: string;
  signingPublicKey: string;
  preferredCryptoProfile: CryptoProfile;
  devices: PublicDevice[];
  preKeys?: ClaimedDevicePreKeys[];
}

export interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: MessageCryptoProfile;
}

export interface DecryptedMessage {
  plaintext: string;
  verified: boolean;
  sessionKey: Uint8Array;
}

export interface EncryptedGroupName {
  encryptedName: string;
  nameNonce: string;
}

// ============================================================================
// Message Encryption
// ============================================================================

/**
 * Encrypt a message for all conversation participants.
 *
 * Flow:
 * 1. Generate a fresh random session key (32 bytes)
 * 2. Encrypt plaintext with session key (ChaCha20-Poly1305 or AES-256-GCM)
 * 3. For each recipient device:
 *    a. If pre-keys available: wrap session key with pre-key exchange (forward secrecy)
 *    b. Otherwise: wrap session key with static device ECDH+KEM keys
 * 4. Sign ciphertext || nonce || serialised wrapped keys with Ed25519
 */
export function encryptMessage(
  plaintext: string,
  recipients: RecipientKeys[],
  signingPrivateKey: Uint8Array,
  senderCryptoProfile: CryptoProfile = 'default'
): EncryptedMessage {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const sessionKey = randomBytes(32);

  const { ciphertext, nonce } = encrypt(sessionKey, plaintextBytes, senderCryptoProfile);

  const wrappedKeys: SerializedWrappedKey[] = [];

  for (const recipient of recipients) {
    // Use the sender's profile for wrapping so that message.cryptoProfile
    // can be used consistently during both wrapping and unwrapping.
    // Without per-wrapped-key profile storage, a mismatch here would
    // cause silent decryption failures.
    const profile = senderCryptoProfile;

    for (const device of recipient.devices) {
      const devicePreKeys = recipient.preKeys?.find(
        (pk) => pk.deviceId === device.deviceId
      );

      if (devicePreKeys?.signedPreKey) {
        const spk: SignedPreKeyPublic = {
          keyId: devicePreKeys.signedPreKey.keyId,
          ecdhPublicKey: fromBase64(devicePreKeys.signedPreKey.ecdhPublicKey),
          kemPublicKey: fromBase64(devicePreKeys.signedPreKey.kemPublicKey),
          signature: fromBase64(devicePreKeys.signedPreKey.signature),
        };

        const sigPub = fromBase64(recipient.signingPublicKey);
        if (!verifySignedPreKey(spk, sigPub)) {
          continue;
        }

        let otpk: OneTimePreKeyPublic | undefined;
        if (devicePreKeys.oneTimePreKey) {
          otpk = {
            keyId: devicePreKeys.oneTimePreKey.keyId,
            ecdhPublicKey: fromBase64(devicePreKeys.oneTimePreKey.ecdhPublicKey),
            kemPublicKey: fromBase64(devicePreKeys.oneTimePreKey.kemPublicKey),
          };
        }

        const wrapped = wrapSessionKeyWithPreKeys(sessionKey, spk, otpk, profile);

        wrappedKeys.push({
          identityId: recipient.identityId,
          ephemeralPublicKey: toBase64(wrapped.ephemeralPublicKey),
          kemCiphertext: toBase64(wrapped.spkKemCiphertext),
          wrappedSessionKey: toBase64(wrapped.wrappedSessionKey),
          wrappingNonce: toBase64(wrapped.wrappingNonce),
          preKeyType: otpk ? 'otpk' : 'spk',
          signedPreKeyId: devicePreKeys.signedPreKey.keyId,
          oneTimePreKeyId: otpk ? devicePreKeys.oneTimePreKey!.keyId : undefined,
          spkKemCiphertext: toBase64(wrapped.spkKemCiphertext),
          otpkKemCiphertext: wrapped.otpkKemCiphertext
            ? toBase64(wrapped.otpkKemCiphertext)
            : undefined,
          routingTag: device.kemPublicKey
            ? computeRoutingTag(device.ecdhPublicKey, device.kemPublicKey)
            : undefined,
        });
      } else {
        if (!device.kemPublicKey) {
          console.warn('[Crypto] Skipping device without kemPublicKey:', device.deviceId);
          continue;
        }

        const recipientPublicKeys: CryptoIdentityPublicKeys = {
          signing: fromBase64(recipient.signingPublicKey),
          ecdh: fromBase64(device.ecdhPublicKey),
          kem: fromBase64(device.kemPublicKey),
          profile,
        };

        const wrapped = wrapSessionKey(sessionKey, recipientPublicKeys, recipient.identityId);

        wrappedKeys.push({
          identityId: recipient.identityId,
          ephemeralPublicKey: toBase64(wrapped.ephemeralPublicKey),
          kemCiphertext: toBase64(wrapped.kemCiphertext),
          wrappedSessionKey: toBase64(wrapped.wrappedSessionKey),
          wrappingNonce: toBase64(wrapped.wrappingNonce),
          preKeyType: 'static',
          routingTag: computeRoutingTag(device.ecdhPublicKey, device.kemPublicKey),
        });
      }
    }
  }

  // Sign: domain || ciphertext || nonce || JSON(wrappedKeys)
  const dataToSign = concatBytes(
    toBytes(MESSAGE_SIGN_DOMAIN),
    ciphertext,
    nonce,
    toBytes(JSON.stringify(wrappedKeys))
  );
  const signature = sign(signingPrivateKey, dataToSign);

  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    wrappedKeys,
    signature: toBase64(signature),
    cryptoProfile: senderCryptoProfile,
  };
}

// ============================================================================
// Message Decryption
// ============================================================================

/**
 * Decrypt a message received from a conversation participant.
 *
 * @param message - The public message from the server
 * @param myIdentityId - Current user's identity ID
 * @param ecdhPrivateKey - Current device's X25519 private key
 * @param kemPrivateKey - Current device's ML-KEM private key
 * @param senderSigningPublicKey - Sender's Ed25519 public key (base64)
 * @param preKeyPrivateKeys - SPK/OTPK private keys if the message used pre-keys
 */
export function decryptMessage(
  message: PublicMessage,
  myIdentityId: string,
  ecdhPrivateKey: Uint8Array,
  kemPrivateKey: Uint8Array,
  senderSigningPublicKey: string,
  preKeyPrivateKeys?: {
    spkEcdhPrivate?: Uint8Array;
    spkKemPrivate?: Uint8Array;
    otpkEcdhPrivate?: Uint8Array;
    otpkKemPrivate?: Uint8Array;
  },
  resolvedWrappedKey?: SerializedWrappedKey,
  cachedSessionKey?: Uint8Array
): DecryptedMessage {
  if (message.deleted || !message.ciphertext || !message.nonce || !message.wrappedKeys) {
    throw new Error('Cannot decrypt a deleted message');
  }

  const ciphertext = fromBase64(message.ciphertext);
  const nonce = fromBase64(message.nonce);
  const profile = message.cryptoProfile as CryptoProfile;

  let sessionKey: Uint8Array;

  if (cachedSessionKey) {
    sessionKey = cachedSessionKey;
  } else {
    const myWrappedKey = resolvedWrappedKey ?? message.wrappedKeys!.find(
      (wk: SerializedWrappedKey) => wk.identityId === myIdentityId
    );

    if (!myWrappedKey) {
      throw new Error('No wrapped key found for this identity');
    }

    if (myWrappedKey.preKeyType === 'spk' || myWrappedKey.preKeyType === 'otpk') {
      if (
        !preKeyPrivateKeys?.spkEcdhPrivate ||
        !preKeyPrivateKeys?.spkKemPrivate
      ) {
        throw new Error('Pre-key private keys required to decrypt this message');
      }

      const wrapped: PreKeyWrappedKey = {
        ephemeralPublicKey: fromBase64(myWrappedKey.ephemeralPublicKey),
        spkKemCiphertext: fromBase64(myWrappedKey.spkKemCiphertext || myWrappedKey.kemCiphertext),
        otpkKemCiphertext: myWrappedKey.otpkKemCiphertext
          ? fromBase64(myWrappedKey.otpkKemCiphertext)
          : undefined,
        wrappedSessionKey: fromBase64(myWrappedKey.wrappedSessionKey),
        wrappingNonce: fromBase64(myWrappedKey.wrappingNonce),
      };

      sessionKey = unwrapSessionKeyWithPreKeys(
        wrapped,
        preKeyPrivateKeys.spkEcdhPrivate,
        preKeyPrivateKeys.spkKemPrivate,
        preKeyPrivateKeys.otpkEcdhPrivate,
        preKeyPrivateKeys.otpkKemPrivate,
        profile
      );
    } else {
      const wrappedKeyObj: WrappedKey = {
        identityId: myWrappedKey.identityId,
        ephemeralPublicKey: fromBase64(myWrappedKey.ephemeralPublicKey),
        kemCiphertext: fromBase64(myWrappedKey.kemCiphertext),
        wrappedSessionKey: fromBase64(myWrappedKey.wrappedSessionKey),
        wrappingNonce: fromBase64(myWrappedKey.wrappingNonce),
      };

      sessionKey = unwrapSessionKey(
        wrappedKeyObj,
        ecdhPrivateKey,
        kemPrivateKey,
        profile
      );
    }
  }

  const plaintext = decrypt(sessionKey, ciphertext, nonce, profile);
  const plaintextStr = new TextDecoder().decode(plaintext);

  const sigPub = fromBase64(senderSigningPublicKey);
  const dataToVerify = concatBytes(
    toBytes(MESSAGE_SIGN_DOMAIN),
    ciphertext,
    nonce,
    toBytes(JSON.stringify(message.wrappedKeys))
  );

  let verified = false;
  try {
    verified = verify(sigPub, dataToVerify, fromBase64(message.signature!));
  } catch {
    verified = false;
  }

  return { plaintext: plaintextStr, verified, sessionKey };
}

// ============================================================================
// Group Name Encryption
// ============================================================================

/**
 * Derive a symmetric key for encrypting/decrypting a group conversation name.
 * The key is derived from the conversationId via HKDF, providing lightweight
 * obfuscation (all participants can derive the same key from the shared ID).
 */
function deriveGroupNameKey(
  conversationId: string,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const ikm = toBytes(conversationId);
  return deriveKey({ ikm, info: GROUP_NAME_KDF_INFO, length: 32 }, profile);
}

/**
 * Encrypt a group name for server storage.
 */
export function encryptGroupName(
  name: string,
  conversationId: string,
  profile: CryptoProfile = 'default'
): EncryptedGroupName {
  const key = deriveGroupNameKey(conversationId, profile);
  const plaintext = new TextEncoder().encode(name);
  const { ciphertext, nonce } = encrypt(key, plaintext, profile);

  return {
    encryptedName: toBase64(ciphertext),
    nameNonce: toBase64(nonce),
  };
}

/**
 * Decrypt a group name retrieved from the server.
 */
export function decryptGroupName(
  encryptedName: string,
  nameNonce: string,
  conversationId: string,
  profile: CryptoProfile = 'default'
): string {
  const key = deriveGroupNameKey(conversationId, profile);
  const ciphertext = fromBase64(encryptedName);
  const nonce = fromBase64(nameNonce);
  const plaintext = decrypt(key, ciphertext, nonce, profile);
  return new TextDecoder().decode(plaintext);
}
