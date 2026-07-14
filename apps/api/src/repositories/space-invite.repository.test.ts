import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

let lastFindFilter: any = null;
const findResult = {
  sort: mock(() => findResult),
  limit: mock(() => findResult),
  toArray: mock(() => Promise.resolve([] as any[])),
};

const mockCollection = {
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  findOneAndUpdate: mock(() => Promise.resolve(null)) as AnyMock,
  countDocuments: mock(() => Promise.resolve(0)) as AnyMock,
  find: mock((filter: any) => {
    lastFindFilter = filter;
    return findResult;
  }) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: { SPACE_INVITES: 'space_invites' },
}));

import { SpaceInviteRepository } from './space-invite.repository';

describe('SpaceInviteRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.insertOne.mockClear();
    mockCollection.findOne.mockClear();
    mockCollection.findOneAndUpdate.mockClear();
    mockCollection.countDocuments.mockClear();
    mockCollection.find.mockClear();
    findResult.sort.mockClear();
    findResult.limit.mockClear();
    findResult.toArray.mockClear();
    findResult.toArray.mockResolvedValue([]);
    lastFindFilter = null;
  });

  test('createInvite defaults status to pending', async () => {
    const repo = new SpaceInviteRepository();
    const invite = await repo.createInvite({
      spaceId: new ObjectId(),
      invitedIdentityId: new ObjectId(),
      invitedByIdentityId: new ObjectId(),
      memberCount: 3,
    });
    expect(invite.status).toBe('pending');
    const [doc] = mockCollection.insertOne.mock.calls[0]!;
    expect(doc.status).toBe('pending');
  });

  test('findPendingForIdentity filters to pending invites for the inbox', async () => {
    const repo = new SpaceInviteRepository();
    const identityId = new ObjectId();
    await repo.findPendingForIdentity(identityId);
    expect(lastFindFilter.invitedIdentityId).toBe(identityId);
    expect(lastFindFilter.status).toBe('pending');
    expect(findResult.sort).toHaveBeenCalledWith({ _id: -1 });
  });

  test('findPendingForSpace prevents duplicate invites', async () => {
    const repo = new SpaceInviteRepository();
    const spaceId = new ObjectId();
    const identityId = new ObjectId();
    await repo.findPendingForSpace(spaceId, identityId);
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      spaceId,
      invitedIdentityId: identityId,
      status: 'pending',
    });
  });

  test('updateStatus writes the new status via findOneAndUpdate', async () => {
    const repo = new SpaceInviteRepository();
    const inviteId = new ObjectId();
    await repo.updateStatus(inviteId, 'accepted');
    const [filter, update] = mockCollection.findOneAndUpdate.mock.calls[0]!;
    expect(filter).toEqual({ _id: inviteId });
    expect(update.$set.status).toBe('accepted');
  });

  test('countPendingForIdentity counts only pending invites', async () => {
    const repo = new SpaceInviteRepository();
    const identityId = new ObjectId();
    await repo.countPendingForIdentity(identityId);
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({
      invitedIdentityId: identityId,
      status: 'pending',
    });
  });
});
