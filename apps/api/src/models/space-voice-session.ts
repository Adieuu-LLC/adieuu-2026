/**
 * Space voice session model
 *
 * Tracks who is present in a voice channel and the optional LiveKit room
 * attached once two or more members are present. E2EE keys are Cipher-derived
 * on clients — the server never stores wrapped call keys.
 *
 * @module models/space-voice-session
 */

import type { ObjectId } from 'mongodb';
import type {
  PublicSpaceVoiceSession,
  SpaceVoiceMediaState,
  SpaceVoiceSessionStatus,
} from '@adieuu/shared';
import type { BaseDocument } from './base';

export type { SpaceVoiceMediaState, SpaceVoiceSessionStatus };

export interface SpaceVoiceParticipant {
  identityId: ObjectId;
  joinedAt: Date;
  leftAt?: Date;
  mediaState: SpaceVoiceMediaState;
}

export interface SpaceVoiceSessionDocument extends BaseDocument {
  spaceId: ObjectId;
  channelId: ObjectId;
  status: SpaceVoiceSessionStatus;
  /** Opaque LiveKit room id; set when the call becomes active. */
  roomName?: string;
  participants: SpaceVoiceParticipant[];
  /** When the LiveKit room was first created for this session. */
  startedAt?: Date;
  /** When presence hit zero while a room existed (60s grace before teardown). */
  emptyAt?: Date;
  endedAt?: Date;
}

export interface CreateSpaceVoiceSessionInput {
  spaceId: ObjectId;
  channelId: ObjectId;
  status?: SpaceVoiceSessionStatus;
  participants?: SpaceVoiceParticipant[];
}

export function toPublicSpaceVoiceSession(doc: SpaceVoiceSessionDocument): PublicSpaceVoiceSession {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    channelId: doc.channelId.toHexString(),
    status: doc.status,
    roomName: doc.roomName ?? null,
    participants: doc.participants.map((p) => ({
      identityId: p.identityId.toHexString(),
      joinedAt: p.joinedAt.toISOString(),
      leftAt: p.leftAt?.toISOString(),
      mediaState: p.mediaState,
    })),
    startedAt: doc.startedAt?.toISOString(),
    emptyAt: doc.emptyAt?.toISOString(),
    endedAt: doc.endedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function activeVoiceParticipants(
  doc: SpaceVoiceSessionDocument,
): SpaceVoiceParticipant[] {
  return doc.participants.filter((p) => !p.leftAt);
}
