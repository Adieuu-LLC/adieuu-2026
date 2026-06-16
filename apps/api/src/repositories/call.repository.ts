/**
 * Call repository
 * Data access layer for live call operations with MongoDB persistence.
 *
 * The unique partial index on { conversationId } where { status != 'ended' }
 * enforces at most one active/ringing call per conversation at the DB level.
 *
 * @module repositories/call
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  CallDocument,
  CreateCallInput,
  CallParticipant,
  CallStatus,
  CallMediaOptions,
} from '../models/call';

export interface ICallRepository {
  findActiveForConversation(conversationId: ObjectId): Promise<CallDocument | null>;
  findAllActive(): Promise<CallDocument[]>;
  addParticipant(callId: ObjectId, participant: CallParticipant): Promise<CallDocument | null>;
  updateParticipantLeft(callId: ObjectId, identityId: ObjectId): Promise<CallDocument | null>;
  updateParticipantMediaState(
    callId: ObjectId,
    identityId: ObjectId,
    mediaState: CallMediaOptions
  ): Promise<CallDocument | null>;
  updateStatus(callId: ObjectId, status: CallStatus, extra?: Record<string, unknown>): Promise<CallDocument | null>;
  createCall(input: CreateCallInput): Promise<CallDocument>;
}

export class CallRepository
  extends BaseRepository<CallDocument>
  implements ICallRepository
{
  constructor() {
    super(Collections.CALLS);
  }

  /**
   * Find the active (ringing or active) call for a conversation.
   * At most one can exist due to the unique partial index.
   */
  async findActiveForConversation(conversationId: ObjectId): Promise<CallDocument | null> {
    return this.collection.findOne({
      conversationId,
      status: { $ne: 'ended' },
    }) as Promise<CallDocument | null>;
  }

  async findAllActive(): Promise<CallDocument[]> {
    return this.collection
      .find({ status: { $ne: 'ended' } } as Parameters<typeof this.collection.find>[0])
      .toArray() as Promise<CallDocument[]>;
  }

  /**
   * Create a new call. Will throw a duplicate key error if a non-ended call
   * already exists for the same conversation (unique partial index).
   */
  async createCall(input: CreateCallInput): Promise<CallDocument> {
    const doc: Omit<CallDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      conversationId: input.conversationId,
      initiatorIdentityId: input.initiatorIdentityId,
      status: 'ringing',
      allowedMedia: input.allowedMedia,
      participants: [],
      roomName: input.roomName,
    } as Omit<CallDocument, '_id' | 'createdAt' | 'updatedAt'>;

    if (input.wrappedE2EEKeys && input.wrappedE2EEKeys.length > 0) {
      (doc as CallDocument).wrappedE2EEKeys = input.wrappedE2EEKeys;
    }

    return this.create(doc);
  }

  /**
   * Add a participant to the call and transition to 'active' if still ringing.
   */
  async addParticipant(
    callId: ObjectId,
    participant: CallParticipant
  ): Promise<CallDocument | null> {
    const update: Record<string, unknown> = {
      $push: { participants: participant },
      $set: { updatedAt: new Date() },
    };

    const call = await this.findById(callId);
    if (call?.status === 'ringing') {
      (update.$set as Record<string, unknown>).status = 'active';
      (update.$set as Record<string, unknown>).startedAt = new Date();
    }

    const result = await this.collection.findOneAndUpdate(
      {
        _id: callId,
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
      update,
      { returnDocument: 'after' }
    );
    return result as CallDocument | null;
  }

  /**
   * Mark a participant as having left the call.
   */
  async updateParticipantLeft(
    callId: ObjectId,
    identityId: ObjectId
  ): Promise<CallDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: callId,
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
      { returnDocument: 'after' }
    );
    return result as CallDocument | null;
  }

  /**
   * Update a participant's media state (mute/unmute/screenshare toggle).
   */
  async updateParticipantMediaState(
    callId: ObjectId,
    identityId: ObjectId,
    mediaState: CallMediaOptions
  ): Promise<CallDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: callId,
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
      { returnDocument: 'after' }
    );
    return result as CallDocument | null;
  }

  /**
   * Transition call status. Used for ending calls.
   */
  async updateStatus(
    callId: ObjectId,
    status: CallStatus,
    extra?: Record<string, unknown>
  ): Promise<CallDocument | null> {
    const $set: Record<string, unknown> = { status, updatedAt: new Date(), ...extra };

    const result = await this.collection.findOneAndUpdate(
      { _id: callId },
      { $set },
      { returnDocument: 'after' }
    );
    return result as CallDocument | null;
  }
}

let callRepository: CallRepository | null = null;

export function getCallRepository(): CallRepository {
  if (!callRepository) {
    callRepository = new CallRepository();
  }
  return callRepository;
}
