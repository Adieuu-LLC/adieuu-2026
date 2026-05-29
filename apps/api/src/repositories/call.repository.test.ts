import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockCollection = {
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  findOneAndUpdate: mock(() => Promise.resolve(null)) as AnyMock,
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
};

mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: {
    CALLS: 'calls',
  },
}));

import { CallRepository } from './call.repository';

describe('CallRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.findOne.mockReset();
    mockCollection.findOneAndUpdate.mockReset();
    mockCollection.insertOne.mockReset();
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.findOneAndUpdate.mockResolvedValue(null);
    mockCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
  });

  const callId = new ObjectId('507f1f77bcf86cd799439012');
  const convId = new ObjectId('507f1f77bcf86cd799439011');
  const identityA = new ObjectId('64a1b2c3d4e5f60718293a4b');
  const participant = {
    identityId: identityA,
    joinedAt: new Date('2026-05-29T12:00:00.000Z'),
    mediaState: { audio: true, video: false, screenshare: false },
  };

  test('findActiveForConversation excludes ended calls', async () => {
    const repo = new CallRepository();
    await repo.findActiveForConversation(convId);

    expect(mockCollection.findOne).toHaveBeenCalledWith({
      conversationId: convId,
      status: { $ne: 'ended' },
    });
  });

  test('addParticipant guards against duplicate active participants', async () => {
    mockCollection.findOne.mockResolvedValue({
      _id: callId,
      status: 'active',
      participants: [],
    });

    const repo = new CallRepository();
    await repo.addParticipant(callId, participant);

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
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
      expect.objectContaining({
        $push: { participants: participant },
      }),
      { returnDocument: 'after' },
    );
  });

  test('addParticipant transitions ringing call to active', async () => {
    mockCollection.findOne.mockResolvedValue({
      _id: callId,
      status: 'ringing',
      participants: [],
    });

    const repo = new CallRepository();
    await repo.addParticipant(callId, participant);

    const [, update] = mockCollection.findOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    expect(update.$set.status).toBe('active');
    expect(update.$set.startedAt).toBeInstanceOf(Date);
  });

  test('updateParticipantLeft uses elemMatch on active participant', async () => {
    const repo = new CallRepository();
    await repo.updateParticipantLeft(callId, identityA);

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: callId,
        status: { $ne: 'ended' },
        participants: {
          $elemMatch: {
            identityId: identityA,
            leftAt: { $exists: false },
          },
        },
      },
      {
        $set: {
          'participants.$.leftAt': expect.any(Date),
          updatedAt: expect.any(Date),
        },
      },
      { returnDocument: 'after' },
    );
  });

  test('updateParticipantMediaState uses elemMatch on active participant', async () => {
    const mediaState = { audio: false, video: true, screenshare: false };
    const repo = new CallRepository();
    await repo.updateParticipantMediaState(callId, identityA, mediaState);

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: callId,
        status: { $ne: 'ended' },
        participants: {
          $elemMatch: {
            identityId: identityA,
            leftAt: { $exists: false },
          },
        },
      },
      {
        $set: {
          'participants.$.mediaState': mediaState,
          updatedAt: expect.any(Date),
        },
      },
      { returnDocument: 'after' },
    );
  });

  test('updateStatus sets status and merges extra fields', async () => {
    const repo = new CallRepository();
    const endedAt = new Date('2026-05-29T12:05:00.000Z');
    await repo.updateStatus(callId, 'ended', { endedAt });

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: callId },
      {
        $set: {
          status: 'ended',
          updatedAt: expect.any(Date),
          endedAt,
        },
      },
      { returnDocument: 'after' },
    );
  });
});
