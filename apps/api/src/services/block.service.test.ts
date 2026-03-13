import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockBlockRepo = {
  findBlock: mock(() => Promise.resolve(null)) as AnyMock,
  create: mock(() => Promise.resolve(null)) as AnyMock,
  remove: mock(() => Promise.resolve(false)) as AnyMock,
  getBlockedByIdentity: mock(() => Promise.resolve([])) as AnyMock,
  getBlockedIdentityIds: mock(() => Promise.resolve([])) as AnyMock,
  isBlockedByEither: mock(() => Promise.resolve(false)) as AnyMock,
};

const mockIdentityRepo = {
  findByIdentityId: mock(() => Promise.resolve(null)) as AnyMock,
};

const mockFriendshipRepo = {
  removeFriendship: mock(() => Promise.resolve()) as AnyMock,
};

const mockFriendRequestRepo = {
  cancelOrIgnoreBetween: mock(() => Promise.resolve()) as AnyMock,
};

mock.module('../repositories/block.repository', () => ({
  getBlockRepository: () => mockBlockRepo,
}));

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => mockIdentityRepo,
}));

mock.module('../repositories/friendship.repository', () => ({
  getFriendshipRepository: () => mockFriendshipRepo,
}));

mock.module('../repositories/friend-request.repository', () => ({
  getFriendRequestRepository: () => mockFriendRequestRepo,
}));

mock.module('../models/identity', () => ({
  toPublicIdentity: (identity: { _id: ObjectId; username?: string }) => ({
    identityId: identity._id.toHexString(),
    username: identity.username ?? 'user',
  }),
}));

mock.module('../utils/adieuuLogger', () => ({
  default: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

import {
  blockIdentity,
  unblockIdentity,
  checkIfBlocked,
  getBlockedIdentities,
  getBlockedIdentityIds,
  isBlockedByEither,
} from './block.service';

describe('block.service', () => {
  const identityA = new ObjectId();
  const identityB = new ObjectId();

  beforeEach(() => {
    mockBlockRepo.findBlock.mockReset();
    mockBlockRepo.create.mockReset();
    mockBlockRepo.remove.mockReset();
    mockBlockRepo.getBlockedByIdentity.mockReset();
    mockBlockRepo.getBlockedIdentityIds.mockReset();
    mockBlockRepo.isBlockedByEither.mockReset();

    mockIdentityRepo.findByIdentityId.mockReset();
    mockFriendshipRepo.removeFriendship.mockReset();
    mockFriendRequestRepo.cancelOrIgnoreBetween.mockReset();

    mockBlockRepo.findBlock.mockResolvedValue(null);
    mockBlockRepo.create.mockResolvedValue(null);
    mockBlockRepo.remove.mockResolvedValue(false);
    mockBlockRepo.getBlockedByIdentity.mockResolvedValue([]);
    mockBlockRepo.getBlockedIdentityIds.mockResolvedValue([]);
    mockBlockRepo.isBlockedByEither.mockResolvedValue(false);

    mockIdentityRepo.findByIdentityId.mockResolvedValue(null);
    mockFriendshipRepo.removeFriendship.mockResolvedValue(undefined);
    mockFriendRequestRepo.cancelOrIgnoreBetween.mockResolvedValue(undefined);
  });

  test('blockIdentity rejects self-block attempts', async () => {
    const result = await blockIdentity(identityA, identityA);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CANNOT_BLOCK_SELF');
    expect(mockBlockRepo.create).not.toHaveBeenCalled();
  });

  test('blockIdentity returns not found when target identity is missing', async () => {
    mockIdentityRepo.findByIdentityId.mockResolvedValue(null);
    const result = await blockIdentity(identityA, identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('IDENTITY_NOT_FOUND');
    expect(mockBlockRepo.create).not.toHaveBeenCalled();
  });

  test('blockIdentity creates block and triggers friendship/request cleanup', async () => {
    mockIdentityRepo.findByIdentityId.mockResolvedValue({
      _id: identityB,
      username: 'bob',
    });

    const result = await blockIdentity(identityA, identityB);
    expect(result.success).toBe(true);
    expect(mockBlockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockFriendshipRepo.removeFriendship).toHaveBeenCalledWith(identityA, identityB);
    expect(mockFriendRequestRepo.cancelOrIgnoreBetween).toHaveBeenCalledWith(identityA, identityB);
  });

  test('unblockIdentity returns BLOCK_NOT_FOUND when no block exists', async () => {
    mockBlockRepo.remove.mockResolvedValue(false);
    const result = await unblockIdentity(identityA, identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('BLOCK_NOT_FOUND');
  });

  test('checkIfBlocked reports blocked status and timestamp', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    mockBlockRepo.findBlock.mockResolvedValue({ createdAt });

    const result = await checkIfBlocked(identityA, identityB);
    expect(result).toEqual({
      blocked: true,
      blockedAt: createdAt.toISOString(),
    });
  });

  test('getBlockedIdentities returns only identities still resolvable', async () => {
    const block1Id = new ObjectId();
    const block2Id = new ObjectId();
    const blockedIdentity1 = new ObjectId();
    const blockedIdentity2 = new ObjectId();

    mockBlockRepo.getBlockedByIdentity.mockResolvedValue([
      { _id: block1Id, blockedIdentityId: blockedIdentity1, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      { _id: block2Id, blockedIdentityId: blockedIdentity2, createdAt: new Date('2026-01-02T00:00:00.000Z') },
    ]);

    mockIdentityRepo.findByIdentityId.mockImplementation(async (id: ObjectId) => {
      if (id.toHexString() === blockedIdentity1.toHexString()) {
        return { _id: blockedIdentity1, username: 'alice' };
      }
      return null;
    });

    const result = await getBlockedIdentities(identityA, 10);
    expect(result.blocks.length).toBe(1);
    expect(result.blocks[0]?.identity.identityId).toBe(blockedIdentity1.toHexString());
    expect(result.cursor).toBeNull();
  });

  test('getBlockedIdentityIds and isBlockedByEither delegate to repository', async () => {
    const blockedIds = [new ObjectId(), new ObjectId()];
    mockBlockRepo.getBlockedIdentityIds.mockResolvedValue(blockedIds);
    mockBlockRepo.isBlockedByEither.mockResolvedValue(true);

    const idsResult = await getBlockedIdentityIds(identityA);
    const eitherResult = await isBlockedByEither(identityA, identityB);

    expect(idsResult).toEqual(blockedIds);
    expect(eitherResult).toBe(true);
    expect(mockBlockRepo.getBlockedIdentityIds).toHaveBeenCalledWith(identityA);
    expect(mockBlockRepo.isBlockedByEither).toHaveBeenCalledWith(identityA, identityB);
  });
});

