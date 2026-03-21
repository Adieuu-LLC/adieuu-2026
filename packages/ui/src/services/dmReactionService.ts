/**
 * DM Reaction Service
 *
 * Handles encryption and decryption of DM reactions using the same hybrid
 * encryption scheme as messages (X25519 + ML-KEM). Reactions are encrypted
 * mini-messages containing the emoji and reactor identity.
 *
 * SECURITY ARCHITECTURE:
 * - Reactions are encrypted with a random session key (ChaCha20-Poly1305 or AES-256-GCM)
 * - Session key is wrapped for each recipient device using hybrid encryption
 * - Reactions are signed with the reactor's Ed25519 signing key
 * - Signature covers: ciphertext || nonce || serialized wrapped keys
 * - The server never sees the emoji or who reacted
 *
 * @module services/dmReactionService
 */

import {
  randomBytes,
  encrypt,
  decrypt,
  sign,
  verify,
  wrapSessionKey,
  wrapSessionKeyWithPreKeys,
  findAndUnwrapSessionKey,
  unwrapSessionKeyWithPreKeys,
  toBase64,
  fromBase64,
  toBytes,
  fromBytes,
  concatBytes,
  clearBytes,
  SESSION_KEY_SIZE,
  type CryptoProfile,
  type WrappedKey,
  type IdentityPublicKeys as CryptoIdentityPublicKeys,
  type PreKeyWrappedKey,
} from '@adieuu/crypto';
import type { SerializedWrappedKey } from '@adieuu/shared';
import type {
  RecipientPublicKeys,
  PreKeyRecipientData,
  PreKeyPrivateKeys,
} from './dmMessageService';

/**
 * Decrypted reaction content structure.
 *
 * Version history:
 *   v1: emoji reactions (Unicode and future custom emoji)
 */
export interface DecryptedReactionContent {
  /** Unicode emoji (standard reactions) */
  emoji?: string;
  /** Custom emoji reference (future: mutually exclusive with emoji) */
  customEmoji?: {
    id: string;
    key: string;
    name: string;
    animated: boolean;
  };
  /** Reactor's identity ID (verified via signature) */
  fromIdentityId: string;
  /** Reaction content version for forward compatibility */
  version: number;
}

/**
 * Input for encrypting a reaction.
 */
export interface EncryptReactionInput {
  /** The emoji to react with */
  emoji: string;
  /** Reactor's identity ID */
  fromIdentityId: string;
  /** All recipient devices' public keys (both participants' devices) */
  recipientKeys: Array<{
    identityId: string;
    deviceId: string;
    publicKeys: RecipientPublicKeys;
    preKeyData?: PreKeyRecipientData;
  }>;
  /** Reactor's signing private key (Ed25519) */
  signingPrivateKey: Uint8Array;
  /** Crypto profile to use */
  cryptoProfile?: CryptoProfile;
}

/**
 * Result of reaction encryption.
 */
export interface EncryptedReaction {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
}

/**
 * Input for decrypting a reaction.
 */
export interface DecryptReactionInput {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  recipientIdentityId: string;
  recipientDeviceId?: string;
  ecdhPrivateKey: Uint8Array;
  kemPrivateKey: Uint8Array;
  senderSigningPublicKey: string;
  cryptoProfile?: CryptoProfile;
  preKeyPrivateKeys?: PreKeyPrivateKeys;
}

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

function serializePreKeyWrappedKey(
  wk: PreKeyWrappedKey,
  identityId: string,
  deviceId: string,
  preKeyData: PreKeyRecipientData,
): SerializedWrappedKey {
  const preKeyType = preKeyData.oneTimePreKey ? 'otpk' as const : 'spk' as const;
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
 * Encrypts a reaction for the specified recipients.
 * Uses the same session-key + hybrid-wrap pattern as message encryption.
 */
export function encryptReaction(input: EncryptReactionInput): EncryptedReaction {
  const profile = input.cryptoProfile ?? 'default';

  const content: DecryptedReactionContent = {
    emoji: input.emoji,
    fromIdentityId: input.fromIdentityId,
    version: 1,
  };
  const plaintext = toBytes(JSON.stringify(content));

  const sessionKey = randomBytes(SESSION_KEY_SIZE);

  const { ciphertext: ciphertextBytes, nonce: nonceBytes } = encrypt(
    sessionKey,
    plaintext,
    profile
  );

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

  clearBytes(sessionKey);

  const ciphertextB64 = toBase64(ciphertextBytes);
  const nonceB64 = toBase64(nonceBytes);
  const wrappedKeysJson = JSON.stringify(wrappedKeys);
  const wrappedKeysBytes = toBytes(wrappedKeysJson);
  const signatureData = concatBytes(ciphertextBytes, nonceBytes, wrappedKeysBytes);

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
 * Decrypts a reaction.
 * Uses the same verify-unwrap-decrypt pattern as message decryption.
 */
export function decryptReaction(input: DecryptReactionInput): DecryptedReactionContent {
  const profile = input.cryptoProfile ?? 'default';

  const ciphertextBytes = fromBase64(input.ciphertext);
  const nonceBytes = fromBase64(input.nonce);
  const signatureBytes = fromBase64(input.signature);
  const signingPublicKey = fromBase64(input.senderSigningPublicKey);

  const wrappedKeysJson = JSON.stringify(input.wrappedKeys);
  const wrappedKeysBytes = toBytes(wrappedKeysJson);
  const signatureData = concatBytes(ciphertextBytes, nonceBytes, wrappedKeysBytes);

  const isValid = verify(signingPublicKey, signatureData, signatureBytes);
  if (!isValid) {
    throw new Error('Reaction signature verification failed');
  }

  let wrappedKey: SerializedWrappedKey | undefined;
  if (input.recipientDeviceId) {
    wrappedKey = input.wrappedKeys.find(
      (wk) => wk.identityId === input.recipientIdentityId && wk.deviceId === input.recipientDeviceId
    );
  }
  if (!wrappedKey) {
    wrappedKey = input.wrappedKeys.find(
      (wk) => wk.identityId === input.recipientIdentityId
    );
  }
  if (!wrappedKey) {
    throw new Error('Reaction not encrypted for this identity/device');
  }

  let sessionKey: Uint8Array | null;

  if (wrappedKey.preKeyType && wrappedKey.preKeyType !== 'static') {
    if (!input.preKeyPrivateKeys) {
      throw new Error(
        `Pre-key private keys required to decrypt FS reaction (preKeyType: ${wrappedKey.preKeyType})`
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
      throw new Error('Failed to unwrap reaction session key with pre-keys');
    }
  } else {
    const wrappedKeyBinary = deserializeWrappedKey(wrappedKey);
    sessionKey = findAndUnwrapSessionKey(
      [wrappedKeyBinary],
      input.recipientIdentityId,
      input.ecdhPrivateKey,
      input.kemPrivateKey,
      profile
    );
  }

  if (!sessionKey) {
    throw new Error('Failed to unwrap reaction session key');
  }

  let plaintext: Uint8Array;
  try {
    plaintext = decrypt(sessionKey, ciphertextBytes, nonceBytes, profile);
  } finally {
    clearBytes(sessionKey);
  }

  const contentJson = fromBytes(plaintext);
  let content: DecryptedReactionContent;
  try {
    content = JSON.parse(contentJson) as DecryptedReactionContent;
  } catch {
    throw new Error('Failed to parse decrypted reaction content');
  }

  if (!content.emoji && !content.customEmoji) {
    throw new Error('Invalid reaction content: missing emoji');
  }
  if (!content.fromIdentityId || typeof content.fromIdentityId !== 'string') {
    throw new Error('Invalid reaction content: missing fromIdentityId');
  }

  return content;
}

/**
 * Generates a unique client reaction ID for deduplication.
 */
export function generateClientReactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8);
  return `r-${timestamp}-${toBase64(random).replace(/[+/=]/g, '')}`;
}
