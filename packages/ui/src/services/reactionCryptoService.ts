/**
 * Reaction Crypto Service
 *
 * Provides E2E encryption and decryption for emoji reactions.
 * Follows the same session-key + hybrid-wrap pattern as messages
 * but with a distinct signing domain for domain separation.
 *
 * SECURITY ARCHITECTURE:
 * - Each reaction uses a fresh random 256-bit session key
 * - Session key is wrapped per-device for all conversation participants
 * - Reactions signed with Ed25519 identity key for authenticity
 * - Server never sees which emoji was used or who reacted
 *
 * @module services/reactionCryptoService
 */

import {
  encrypt,
  decrypt,
  wrapSessionKey,
  unwrapSessionKey,
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
  type CryptoProfile,
  type IdentityPublicKeys as CryptoIdentityPublicKeys,
  type WrappedKey,
  type PreKeyWrappedKey,
  type SignedPreKeyPublic,
  type OneTimePreKeyPublic,
} from '@adieuu/crypto';
import type {
  SerializedWrappedKey,
  PublicReaction,
  MessageCryptoProfile,
  PublicReaction,
  PublicDevice,
  ClaimedDevicePreKeys,
} from '@adieuu/shared';
import type { RecipientKeys, EncryptedMessage } from './conversationCryptoService';

// ============================================================================
// Constants
// ============================================================================

const REACTION_SIGN_DOMAIN = 'adieuu-reaction-v1';

// ============================================================================
// Types
// ============================================================================

export interface DecryptedReactionContent {
  emoji: string;
  customEmoji?: {
    id: string;
    key: string;
    name: string;
    animated: boolean;
  };
  fromIdentityId: string;
  version: 1;
}

export interface DecryptedReaction {
  id: string;
  messageId: string;
  conversationId: string;
  fromIdentityId: string;
  emoji: string;
  verified: boolean;
  createdAt: string;
}

// ============================================================================
// Encryption
// ============================================================================

/**
 * Encrypt a reaction for all conversation participants.
 */
export function encryptReaction(
  emoji: string,
  fromIdentityId: string,
  recipients: RecipientKeys[],
  signingPrivateKey: Uint8Array,
  senderCryptoProfile: CryptoProfile = 'default'
): EncryptedMessage {
  const content: DecryptedReactionContent = {
    emoji,
    fromIdentityId,
    version: 1,
  };

  const plaintextBytes = new TextEncoder().encode(JSON.stringify(content));
  const sessionKey = randomBytes(32);

  const { ciphertext, nonce } = encrypt(sessionKey, plaintextBytes, senderCryptoProfile);

  const wrappedKeys: SerializedWrappedKey[] = [];

  for (const recipient of recipients) {
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

  const dataToSign = concatBytes(
    toBytes(REACTION_SIGN_DOMAIN),
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
// Decryption
// ============================================================================

/**
 * Decrypt a reaction received from a conversation participant.
 */
export function decryptReaction(
  reaction: PublicReaction,
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
  resolvedWrappedKey?: SerializedWrappedKey
): DecryptedReaction {
  const ciphertext = fromBase64(reaction.ciphertext);
  const nonce = fromBase64(reaction.nonce);
  const profile = reaction.cryptoProfile as CryptoProfile;

  const myWrappedKey = resolvedWrappedKey ?? reaction.wrappedKeys.find(
    (wk: SerializedWrappedKey) => wk.identityId === myIdentityId
  );

  if (!myWrappedKey) {
    throw new Error('No wrapped key found for this identity');
  }

  let sessionKey: Uint8Array;

  if (myWrappedKey.preKeyType === 'spk' || myWrappedKey.preKeyType === 'otpk') {
    if (
      !preKeyPrivateKeys?.spkEcdhPrivate ||
      !preKeyPrivateKeys?.spkKemPrivate
    ) {
      throw new Error('Pre-key private keys required to decrypt this reaction');
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

  const plaintext = decrypt(sessionKey, ciphertext, nonce, profile);
  const content = JSON.parse(new TextDecoder().decode(plaintext)) as DecryptedReactionContent;

  const identityMismatch = content.fromIdentityId !== reaction.fromIdentityId;

  let verified = false;
  if (!identityMismatch) {
    const sigPub = fromBase64(senderSigningPublicKey);
    const dataToVerify = concatBytes(
      toBytes(REACTION_SIGN_DOMAIN),
      ciphertext,
      nonce,
      toBytes(JSON.stringify(reaction.wrappedKeys))
    );

    try {
      verified = verify(sigPub, dataToVerify, fromBase64(reaction.signature));
    } catch {
      verified = false;
    }
  }

  return {
    id: reaction.id,
    messageId: reaction.messageId,
    conversationId: reaction.conversationId,
    fromIdentityId: reaction.fromIdentityId,
    emoji: content.emoji,
    verified,
    createdAt: reaction.createdAt,
  };
}
