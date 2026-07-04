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
  MessageSignatureContext,
} from '@adieuu/shared';
import {
  MESSAGE_SIGN_DOMAIN_V1,
  buildMessageSignaturePreimageV2,
} from '@adieuu/shared';

// ============================================================================
// Constants
// ============================================================================

const GROUP_NAME_KDF_INFO = 'adieuu-conv-name-v1';
const MEMBER_SETTINGS_KDF_INFO = 'adieuu-conv-member-settings-v1';

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
  /**
   * Devices that were wrapped with static keys even though forward secrecy
   * was requested (pre-keys unavailable or SPK signature invalid).
   * Always empty when forward secrecy was not requested.
   */
  fsDowngradedDeviceIds: string[];
  /**
   * Devices whose signed pre-key failed signature verification against the
   * recipient's identity key. These fall back to static wrapping rather than
   * being silently skipped. Subset of {@link fsDowngradedDeviceIds}.
   */
  spkVerificationFailedDeviceIds: string[];
}

export interface DecryptedMessage {
  plaintext: string;
  verified: boolean;
  /** Which signature preimage version verified (undefined when verification failed). */
  signatureVersion?: 1 | 2;
  sessionKey: Uint8Array;
}

export interface EncryptMessageOptions {
  /**
   * Whether the sender requested forward secrecy for this message. Used only
   * for downgrade reporting: when true, devices that end up statically
   * wrapped are recorded in `fsDowngradedDeviceIds`.
   */
  forwardSecrecyRequested?: boolean;
}

export interface EncryptedGroupName {
  encryptedName: string;
  nameNonce: string;
}

export interface MemberCustomisation {
  nickname?: string;
  color?: string;
}

export type MemberSettingsMap = Record<string, MemberCustomisation>;

export interface EncryptedMemberSettings {
  encryptedMemberSettings: string;
  memberSettingsNonce: string;
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
 * 4. Sign the v2 preimage (domain, conversation, sender, clientMessageId,
 *    ciphertext, nonce, canonical wrapped keys) with Ed25519
 *
 * Devices whose signed pre-key fails signature verification fall back to
 * static wrapping (never silently skipped) and are reported via
 * `spkVerificationFailedDeviceIds` / `fsDowngradedDeviceIds`.
 *
 * @param context - Message context bound into the signature (conversationId,
 *   fromIdentityId, clientMessageId). For edits, pass the original message's
 *   clientMessageId (stable across revisions).
 */
export function encryptMessage(
  plaintext: string,
  recipients: RecipientKeys[],
  signingPrivateKey: Uint8Array,
  context: MessageSignatureContext,
  senderCryptoProfile: CryptoProfile = 'default',
  options?: EncryptMessageOptions
): EncryptedMessage {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const sessionKey = randomBytes(32);

  const { ciphertext, nonce } = encrypt(sessionKey, plaintextBytes, senderCryptoProfile);

  const wrappedKeys: SerializedWrappedKey[] = [];
  const fsRequested = options?.forwardSecrecyRequested === true;
  const fsDowngradedDeviceIds: string[] = [];
  const spkVerificationFailedDeviceIds: string[] = [];

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

      let spkVerified = false;
      let spk: SignedPreKeyPublic | undefined;

      if (devicePreKeys?.signedPreKey) {
        spk = {
          keyId: devicePreKeys.signedPreKey.keyId,
          ecdhPublicKey: fromBase64(devicePreKeys.signedPreKey.ecdhPublicKey),
          kemPublicKey: fromBase64(devicePreKeys.signedPreKey.kemPublicKey),
          signature: fromBase64(devicePreKeys.signedPreKey.signature),
        };

        const sigPub = fromBase64(recipient.signingPublicKey);
        spkVerified = verifySignedPreKey(spk, sigPub);
        if (!spkVerified) {
          // Never encrypt to an unverified SPK: it may be a substituted key.
          // Fall back to the device's static keys instead of skipping the
          // device, and surface the downgrade to the caller.
          spkVerificationFailedDeviceIds.push(device.deviceId);
        }
      }

      if (spk && spkVerified) {
        let otpk: OneTimePreKeyPublic | undefined;
        if (devicePreKeys!.oneTimePreKey) {
          otpk = {
            keyId: devicePreKeys!.oneTimePreKey.keyId,
            ecdhPublicKey: fromBase64(devicePreKeys!.oneTimePreKey.ecdhPublicKey),
            kemPublicKey: fromBase64(devicePreKeys!.oneTimePreKey.kemPublicKey),
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
          signedPreKeyId: devicePreKeys!.signedPreKey!.keyId,
          oneTimePreKeyId: otpk ? devicePreKeys!.oneTimePreKey!.keyId : undefined,
          spkKemCiphertext: toBase64(wrapped.spkKemCiphertext),
          otpkKemCiphertext: wrapped.otpkKemCiphertext
            ? toBase64(wrapped.otpkKemCiphertext)
            : undefined,
          routingTag: device.kemPublicKey
            ? computeRoutingTag(device.ecdhPublicKey, device.kemPublicKey)
            : undefined,
          wrapVersion: wrapped.wrapVersion,
        });
      } else {
        if (!device.kemPublicKey) {
          console.warn('[Crypto] Skipping device without kemPublicKey:', device.deviceId);
          continue;
        }

        if (fsRequested) {
          fsDowngradedDeviceIds.push(device.deviceId);
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
          wrapVersion: wrapped.wrapVersion,
        });
      }
    }
  }

  const ciphertextB64 = toBase64(ciphertext);
  const nonceB64 = toBase64(nonce);

  // v2 signature: binds conversation, sender, and clientMessageId so a
  // malicious server cannot replay this message in another context.
  const preimage = buildMessageSignaturePreimageV2(
    context,
    ciphertextB64,
    nonceB64,
    wrappedKeys
  );
  const signature = sign(signingPrivateKey, toBytes(preimage));

  return {
    ciphertext: ciphertextB64,
    nonce: nonceB64,
    wrappedKeys,
    signature: toBase64(signature),
    cryptoProfile: senderCryptoProfile,
    fsDowngradedDeviceIds,
    spkVerificationFailedDeviceIds,
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
        signedPreKeyId: myWrappedKey.signedPreKeyId,
        oneTimePreKeyId: myWrappedKey.oneTimePreKeyId,
        wrapVersion: myWrappedKey.wrapVersion,
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
        wrapVersion: myWrappedKey.wrapVersion,
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
  const signatureBytes = safeFromBase64(message.signature);

  let verified = false;
  let signatureVersion: 1 | 2 | undefined;

  if (signatureBytes) {
    // Try v2 first (context-bound). The domain string inside the preimage
    // prevents a v2 signature from verifying as v1 and vice versa.
    const preimageV2 = buildMessageSignaturePreimageV2(
      {
        conversationId: message.conversationId,
        fromIdentityId: message.fromIdentityId,
        clientMessageId: message.clientMessageId,
      },
      message.ciphertext!,
      message.nonce!,
      message.wrappedKeys!
    );
    try {
      if (verify(sigPub, toBytes(preimageV2), signatureBytes)) {
        verified = true;
        signatureVersion = 2;
      }
    } catch {
      // fall through to v1
    }

    if (!verified) {
      // Legacy v1: domain || ciphertext || nonce || JSON(wrappedKeys).
      // Accepted only for messages signed before context binding existed.
      const dataToVerifyV1 = concatBytes(
        toBytes(MESSAGE_SIGN_DOMAIN_V1),
        ciphertext,
        nonce,
        toBytes(JSON.stringify(message.wrappedKeys))
      );
      try {
        if (verify(sigPub, dataToVerifyV1, signatureBytes)) {
          verified = true;
          signatureVersion = 1;
        }
      } catch {
        verified = false;
      }
    }
  }

  return { plaintext: plaintextStr, verified, signatureVersion, sessionKey };
}

function safeFromBase64(value: string | undefined): Uint8Array | null {
  if (!value) return null;
  try {
    return fromBase64(value);
  } catch {
    return null;
  }
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

// ============================================================================
// Member Settings Encryption
// ============================================================================

function deriveMemberSettingsKey(
  conversationId: string,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const ikm = toBytes(conversationId);
  return deriveKey({ ikm, info: MEMBER_SETTINGS_KDF_INFO, length: 32 }, profile);
}

/**
 * Encrypt per-member customisations (nicknames/colours) for server storage.
 */
export function encryptMemberSettings(
  settings: MemberSettingsMap,
  conversationId: string,
  profile: CryptoProfile = 'default'
): EncryptedMemberSettings {
  const key = deriveMemberSettingsKey(conversationId, profile);
  const plaintext = new TextEncoder().encode(JSON.stringify(settings));
  const { ciphertext, nonce } = encrypt(key, plaintext, profile);

  return {
    encryptedMemberSettings: toBase64(ciphertext),
    memberSettingsNonce: toBase64(nonce),
  };
}

/**
 * Decrypt per-member customisations retrieved from the server.
 */
export function decryptMemberSettings(
  encryptedSettings: string,
  nonce: string,
  conversationId: string,
  profile: CryptoProfile = 'default'
): MemberSettingsMap {
  const key = deriveMemberSettingsKey(conversationId, profile);
  const ciphertext = fromBase64(encryptedSettings);
  const nonceBytes = fromBase64(nonce);
  const plaintext = decrypt(key, ciphertext, nonceBytes, profile);
  return JSON.parse(new TextDecoder().decode(plaintext)) as MemberSettingsMap;
}
