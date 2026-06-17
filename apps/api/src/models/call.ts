/**
 * Call model
 * Represents a live audio/video/screenshare call within a conversation.
 *
 * PRIVACY NOTES:
 * - Call metadata (participants, timestamps) is stored in plaintext for routing
 * - Media frames are E2E encrypted via LiveKit Insertable Streams; server never decrypts
 * - No media is recorded or stored server-side
 * - Call records are eligible for TTL-based auto-deletion after endedAt
 *
 * CONSTRAINT: Only one non-ended call per conversation (enforced via unique partial index).
 *
 * @module models/call
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export type CallStatus = 'ringing' | 'active' | 'ended';

export interface CallMediaOptions {
  audio: boolean;
  video: boolean;
  screenshare: boolean;
}

export interface CallParticipant {
  identityId: ObjectId;
  joinedAt: Date;
  leftAt?: Date;
  mediaState: CallMediaOptions;
}

/**
 * Call document stored in MongoDB.
 *
 * The unique partial index `{ conversationId: 1 } WHERE { status: { $in: ['ringing', 'active'] } }`
 * enforces at most one active/ringing call per conversation.
 */
export interface CallDocument extends BaseDocument {
  /** Conversation this call belongs to */
  conversationId: ObjectId;

  /** Identity that initiated the call */
  initiatorIdentityId: ObjectId;

  /** Current call lifecycle status */
  status: CallStatus;

  /** Which media types the initiator requested (admin settings permitting) */
  allowedMedia: CallMediaOptions;

  /** Participants who have joined (or previously joined) this call */
  participants: CallParticipant[];

  /** Opaque, cryptographically random LiveKit room identifier */
  roomName: string;

  /** Reference to the E2EE key distribution for this call */
  e2eeKeyId?: string;

  /**
   * Wrapped call E2EE keys -- one per conversation participant.
   * Each entry contains the call symmetric key hybrid-encrypted for a single
   * recipient using X25519 + ML-KEM. The server stores only opaque ciphertext;
   * it never sees the plaintext call key.
   */
  wrappedE2EEKeys?: SerializedWrappedCallKey[];

  /** When the first participant connected (status transitioned to 'active') */
  startedAt?: Date;

  /** When the call ended (status transitioned to 'ended') */
  endedAt?: Date;
}

/**
 * Serialized wrapped call E2EE key for API transport and DB storage.
 * Binary fields are base64-encoded strings.
 */
export interface SerializedWrappedCallKey {
  recipientIdentityId: string;
  ephemeralPublicKey: string;
  kemCiphertext: string;
  wrappedKey: string;
  wrappingNonce: string;
}

export interface CreateCallInput {
  conversationId: ObjectId;
  initiatorIdentityId: ObjectId;
  allowedMedia: CallMediaOptions;
  roomName: string;
  wrappedE2EEKeys?: SerializedWrappedCallKey[];
}

/**
 * Public call representation (safe to send to client).
 */
export interface PublicCall {
  id: string;
  conversationId: string;
  initiatorIdentityId: string;
  status: CallStatus;
  allowedMedia: CallMediaOptions;
  participants: Array<{
    identityId: string;
    joinedAt: string;
    leftAt?: string;
    mediaState: CallMediaOptions;
  }>;
  roomName: string;
  e2eeKeyId?: string;
  wrappedE2EEKeys?: SerializedWrappedCallKey[];
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a CallDocument to PublicCall (safe for client).
 */
export function toPublicCall(doc: CallDocument): PublicCall {
  return {
    id: doc._id.toHexString(),
    conversationId: doc.conversationId.toHexString(),
    initiatorIdentityId: doc.initiatorIdentityId.toHexString(),
    status: doc.status,
    allowedMedia: doc.allowedMedia,
    participants: doc.participants.map((p) => ({
      identityId: p.identityId.toHexString(),
      joinedAt: p.joinedAt.toISOString(),
      leftAt: p.leftAt?.toISOString(),
      mediaState: p.mediaState,
    })),
    roomName: doc.roomName,
    e2eeKeyId: doc.e2eeKeyId,
    wrappedE2EEKeys: doc.wrappedE2EEKeys,
    startedAt: doc.startedAt?.toISOString(),
    endedAt: doc.endedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
