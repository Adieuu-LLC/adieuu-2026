/**
 * E2E message/reaction signature preimage construction (v2).
 *
 * v1 signatures covered only `domain || ciphertext || nonce || JSON(wrappedKeys)`,
 * which left messages unbound to their conversation, sender, and client message
 * identity. A malicious server could replay a validly signed message into a
 * different conversation between the same participants.
 *
 * v2 binds the full message context into the signed preimage:
 *   - conversationId (24-hex)
 *   - fromIdentityId (24-hex)
 *   - clientMessageId / clientReactionId (UUID)
 *   - messageId for reactions (24-hex)
 *
 * The preimage is a single UTF-8 string with `\n` separators. None of the
 * bound fields can contain a newline (hex IDs, UUIDs, base64), and the
 * wrapped-keys JSON is the final component, so the encoding is unambiguous.
 *
 * Wrapped keys are serialized with an explicit canonical key order so that
 * client-side signing and server-side verification produce byte-identical
 * JSON regardless of intermediate parsing (e.g. zod re-ordering object keys).
 *
 * SECURITY: both signer and verifier MUST build the preimage through these
 * helpers. Any drift between the two sides silently breaks verification.
 *
 * @module messaging/signatureBinding
 */

import type { SerializedWrappedKey } from '../api/conversations-types';

/** Signing domain for v1 message signatures (legacy, context-unbound). */
export const MESSAGE_SIGN_DOMAIN_V1 = 'adieuu-msg-v1';

/** Signing domain for v2 message signatures (context-bound). */
export const MESSAGE_SIGN_DOMAIN_V2 = 'adieuu-msg-v2';

/** Signing domain for v1 reaction signatures (legacy, context-unbound). */
export const REACTION_SIGN_DOMAIN_V1 = 'adieuu-reaction-v1';

/** Signing domain for v2 reaction signatures (context-bound). */
export const REACTION_SIGN_DOMAIN_V2 = 'adieuu-reaction-v2';

/** Context bound into a v2 message signature. */
export interface MessageSignatureContext {
  /** Conversation the message belongs to (24-hex ObjectId) */
  conversationId: string;
  /** Sender identity (24-hex ObjectId) */
  fromIdentityId: string;
  /**
   * Client-generated message UUID. Stable across edits: an edit signs with
   * the original message's clientMessageId, not the clientEditId.
   */
  clientMessageId: string;
}

/** Context bound into a v2 reaction signature. */
export interface ReactionSignatureContext {
  /** Conversation the reaction belongs to (24-hex ObjectId) */
  conversationId: string;
  /** Message being reacted to (24-hex ObjectId) */
  messageId: string;
  /** Reactor identity (24-hex ObjectId) */
  fromIdentityId: string;
  /** Client-generated reaction UUID */
  clientReactionId: string;
}

/**
 * Canonical wrapped-key serialization for signature preimages.
 *
 * Emits keys in a fixed order and omits absent optional fields, matching
 * what `JSON.stringify` produces for the objects built at encrypt time.
 * This guards against key re-ordering by intermediate parsers (zod strips
 * and re-orders object keys on the server).
 */
export function serializeWrappedKeysForSignature(
  wrappedKeys: readonly SerializedWrappedKey[]
): string {
  const canonical = wrappedKeys.map((wk) => {
    const out: Record<string, string | number> = {
      identityId: wk.identityId,
      ephemeralPublicKey: wk.ephemeralPublicKey,
      kemCiphertext: wk.kemCiphertext,
      wrappedSessionKey: wk.wrappedSessionKey,
      wrappingNonce: wk.wrappingNonce,
      preKeyType: wk.preKeyType,
    };
    if (wk.signedPreKeyId != null) out.signedPreKeyId = wk.signedPreKeyId;
    if (wk.oneTimePreKeyId != null) out.oneTimePreKeyId = wk.oneTimePreKeyId;
    if (wk.spkKemCiphertext != null) out.spkKemCiphertext = wk.spkKemCiphertext;
    if (wk.otpkKemCiphertext != null) out.otpkKemCiphertext = wk.otpkKemCiphertext;
    if (wk.routingTag != null) out.routingTag = wk.routingTag;
    if (wk.wrapVersion != null) out.wrapVersion = wk.wrapVersion;
    return out;
  });
  return JSON.stringify(canonical);
}

/**
 * Builds the v2 message signature preimage string.
 *
 * Layout: `domain \n conversationId \n fromIdentityId \n clientMessageId \n
 * ciphertextB64 \n nonceB64 \n canonicalWrappedKeysJson`
 */
export function buildMessageSignaturePreimageV2(
  context: MessageSignatureContext,
  ciphertextB64: string,
  nonceB64: string,
  wrappedKeys: readonly SerializedWrappedKey[]
): string {
  return [
    MESSAGE_SIGN_DOMAIN_V2,
    context.conversationId,
    context.fromIdentityId,
    context.clientMessageId,
    ciphertextB64,
    nonceB64,
    serializeWrappedKeysForSignature(wrappedKeys),
  ].join('\n');
}

/**
 * Builds the v2 reaction signature preimage string.
 *
 * Layout: `domain \n conversationId \n messageId \n fromIdentityId \n
 * clientReactionId \n ciphertextB64 \n nonceB64 \n canonicalWrappedKeysJson`
 */
export function buildReactionSignaturePreimageV2(
  context: ReactionSignatureContext,
  ciphertextB64: string,
  nonceB64: string,
  wrappedKeys: readonly SerializedWrappedKey[]
): string {
  return [
    REACTION_SIGN_DOMAIN_V2,
    context.conversationId,
    context.messageId,
    context.fromIdentityId,
    context.clientReactionId,
    ciphertextB64,
    nonceB64,
    serializeWrappedKeysForSignature(wrappedKeys),
  ].join('\n');
}
