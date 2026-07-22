/**
 * Space voice session repository
 *
 * @module repositories/space-voice-session
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  CreateSpaceVoiceSessionInput,
  SpaceVoiceMediaState,
  SpaceVoiceParticipant,
  SpaceVoiceSessionDocument,
  SpaceVoiceSessionStatus,
} from '../models/space-voice-session';

export class SpaceVoiceSessionRepository extends BaseRepository<SpaceVoiceSessionDocument> {
  constructor() {
    super(Collections.SPACE_VOICE_SESSIONS);
  }

  async findActiveForChannel(channelId: ObjectId): Promise<SpaceVoiceSessionDocument | null> {
    return this.collection.findOne({
      channelId,
      status: { $ne: 'ended' },
    }) as Promise<SpaceVoiceSessionDocument | null>;
  }

  async findActiveByRoomName(roomName: string): Promise<SpaceVoiceSessionDocument | null> {
    return this.collection.findOne({
      roomName,
      status: { $ne: 'ended' },
    }) as Promise<SpaceVoiceSessionDocument | null>;
  }

  async findAllNonEnded(): Promise<SpaceVoiceSessionDocument[]> {
    return this.collection
      .find({ status: { $ne: 'ended' } } as Parameters<typeof this.collection.find>[0])
      .toArray() as Promise<SpaceVoiceSessionDocument[]>;
  }

  async findActiveForSpace(spaceId: ObjectId): Promise<SpaceVoiceSessionDocument[]> {
    return this.collection
      .find({
        spaceId,
        status: { $ne: 'ended' },
      } as Parameters<typeof this.collection.find>[0])
      .toArray() as Promise<SpaceVoiceSessionDocument[]>;
  }

  async createSession(input: CreateSpaceVoiceSessionInput): Promise<SpaceVoiceSessionDocument> {
    const doc: Omit<SpaceVoiceSessionDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      spaceId: input.spaceId,
      channelId: input.channelId,
      status: input.status ?? 'waiting',
      participants: input.participants ?? [],
    };
    return this.create(doc);
  }

  async addParticipant(
    sessionId: ObjectId,
    participant: SpaceVoiceParticipant,
  ): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: sessionId,
        status: { $ne: 'ended' },
        participants: {
          $not: {
            $elemMatch: {
              identityId: participant.identityId,
              leftAt: { $exists: false },
            },
          },
        },
      },
      {
        $push: { participants: participant },
        $set: { updatedAt: new Date() },
        $unset: { emptyAt: '' },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }

  /** Rejoin after a previous leave on the same session document. */
  async rejoinParticipant(
    sessionId: ObjectId,
    identityId: ObjectId,
    mediaState: SpaceVoiceMediaState,
  ): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: sessionId,
        status: { $ne: 'ended' },
        participants: {
          $elemMatch: {
            identityId,
            leftAt: { $exists: true },
          },
        },
      },
      {
        $set: {
          'participants.$.joinedAt': new Date(),
          'participants.$.mediaState': mediaState,
          updatedAt: new Date(),
        },
        $unset: {
          'participants.$.leftAt': '',
          emptyAt: '',
        },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }

  async updateParticipantLeft(
    sessionId: ObjectId,
    identityId: ObjectId,
  ): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: sessionId,
        status: { $ne: 'ended' },
        participants: {
          $elemMatch: {
            identityId,
            leftAt: { $exists: false },
          },
        },
      },
      {
        $set: {
          'participants.$.leftAt': new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }

  async updateParticipantMediaState(
    sessionId: ObjectId,
    identityId: ObjectId,
    mediaState: SpaceVoiceMediaState,
  ): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: sessionId,
        status: { $ne: 'ended' },
        participants: {
          $elemMatch: {
            identityId,
            leftAt: { $exists: false },
          },
        },
      },
      {
        $set: {
          'participants.$.mediaState': mediaState,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }

  async activateWithRoom(
    sessionId: ObjectId,
    roomName: string,
  ): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: sessionId,
        status: { $ne: 'ended' },
        roomName: { $exists: false },
      },
      {
        $set: {
          status: 'active' satisfies SpaceVoiceSessionStatus,
          roomName,
          startedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { emptyAt: '' },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }

  async markEmpty(
    sessionId: ObjectId,
    emptyAt: Date,
  ): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: sessionId,
        status: { $ne: 'ended' },
        roomName: { $exists: true },
      },
      {
        $set: { emptyAt, updatedAt: new Date() },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }

  async clearEmpty(sessionId: ObjectId): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: sessionId, status: { $ne: 'ended' } },
      {
        $unset: { emptyAt: '' },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }

  async clearRoomAndEnd(sessionId: ObjectId): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: sessionId, status: { $ne: 'ended' } },
      {
        $set: {
          status: 'ended' satisfies SpaceVoiceSessionStatus,
          endedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { roomName: '', emptyAt: '' },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }

  async endWaitingSession(sessionId: ObjectId): Promise<SpaceVoiceSessionDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: sessionId,
        status: 'waiting',
        roomName: { $exists: false },
      },
      {
        $set: {
          status: 'ended' satisfies SpaceVoiceSessionStatus,
          endedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    return result as SpaceVoiceSessionDocument | null;
  }
}

let spaceVoiceSessionRepository: SpaceVoiceSessionRepository | null = null;

export function getSpaceVoiceSessionRepository(): SpaceVoiceSessionRepository {
  if (!spaceVoiceSessionRepository) {
    spaceVoiceSessionRepository = new SpaceVoiceSessionRepository();
  }
  return spaceVoiceSessionRepository;
}
