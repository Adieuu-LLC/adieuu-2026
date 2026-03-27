import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { FriendRequestDocument, FriendRequestStatus } from '../models/friend-request';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockRequestRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
  findPending: mock(() => Promise.resolve(null)) as AnyMock,
  findPendingBetween: mock(() => Promise.resolve(null)) as AnyMock,
  findIncoming: mock(() => Promise.resolve([])) as AnyMock,
  findOutgoing: mock(() => Promise.resolve([])) as AnyMock,
  create: mock(() => Promise.resolve(null)) as AnyMock,
  updateStatus: mock(() => Promise.resolve(null)) as AnyMock,
  countIncoming: mock(() => Promise.resolve(0)) as AnyMock,
  deleteById: mock(() => Promise.resolve(true)) as AnyMock,
  deleteByPair: mock(() => Promise.resolve(0)) as AnyMock,
};

const mockFriendshipRepo = {
  areFriends: mock(() => Promise.resolve(false)) as AnyMock,
  create: mock(() => Promise.resolve()) as AnyMock,
  remove: mock(() => Promise.resolve(false)) as AnyMock,
  getFriends: mock(() => Promise.resolve([])) as AnyMock,
  searchFriends: mock(() => Promise.resolve([])) as AnyMock,
  countFriends: mock(() => Promise.resolve(0)) as AnyMock,
};

const mockBlockRepo = {
  isBlockedByEither: mock(() => Promise.resolve(false)) as AnyMock,
};

const mockIdentityRepo = {
  findByIdentityId: mock(() => Promise.resolve(null)) as AnyMock,
  search: mock(() => Promise.resolve([])) as AnyMock,
};

const createNotificationMock = mock(() => Promise.resolve()) as AnyMock;
const publishMock = mock(() => Promise.resolve()) as AnyMock;

mock.module('../repositories/friend-request.repository', () => ({
  getFriendRequestRepository: () => mockRequestRepo,
}));

mock.module('../repositories/friendship.repository', () => ({
  getFriendshipRepository: () => mockFriendshipRepo,
}));

mock.module('../repositories/block.repository', () => ({
  getBlockRepository: () => mockBlockRepo,
}));

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => mockIdentityRepo,
}));

mock.module('../models/friend-request', () => ({
  toPublicFriendRequest: (doc: FriendRequestDocument) => ({
    id: doc._id.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    toIdentityId: doc.toIdentityId.toHexString(),
    status: doc.status,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
  }),
}));

mock.module('../models/identity', () => ({
  toPublicIdentity: (identity: { _id: ObjectId; username?: string; displayName?: string }) => ({
    id: identity._id.toHexString(),
    username: identity.username ?? 'user',
    displayName: identity.displayName,
  }),
}));

mock.module('./notification.service', () => ({
  createNotification: createNotificationMock,
}));

mock.module('../db', () => ({
  getRedis: () => ({ publish: publishMock }),
  isRedisConnected: () => true,
  RedisKeys: {
    identityChannel: (id: string) => `identity:${id}`,
  },
}));

mock.module('../utils/adieuuLogger', () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import {
  sendFriendRequest,
  acceptFriendRequest,
  ignoreFriendRequest,
  cancelFriendRequest,
  removeFriend,
  getFriends,
  searchFriends,
  getIncomingRequests,
  getOutgoingRequests,
  getIncomingRequestCount,
  getFriendshipStatus,
  cleanupFriendData,
} from './friend.service';

describe('friend.service', () => {
  afterAll(() => {
    mock.restore();
  });

  const identityA = new ObjectId();
  const identityB = new ObjectId();

  function makeFriendRequestDoc(overrides: Partial<FriendRequestDocument> = {}): FriendRequestDocument {
    return {
      _id: new ObjectId(),
      fromIdentityId: identityA,
      toIdentityId: identityB,
      status: 'pending' as FriendRequestStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockRequestRepo.findById.mockReset();
    mockRequestRepo.findPending.mockReset();
    mockRequestRepo.findPendingBetween.mockReset();
    mockRequestRepo.findIncoming.mockReset();
    mockRequestRepo.findOutgoing.mockReset();
    mockRequestRepo.create.mockReset();
    mockRequestRepo.updateStatus.mockReset();
    mockRequestRepo.countIncoming.mockReset();
    mockRequestRepo.deleteById.mockReset();
    mockRequestRepo.deleteByPair.mockReset();

    mockFriendshipRepo.areFriends.mockReset();
    mockFriendshipRepo.create.mockReset();
    mockFriendshipRepo.remove.mockReset();
    mockFriendshipRepo.getFriends.mockReset();
    mockFriendshipRepo.searchFriends.mockReset();
    mockFriendshipRepo.countFriends.mockReset();

    mockBlockRepo.isBlockedByEither.mockReset();

    mockIdentityRepo.findByIdentityId.mockReset();
    mockIdentityRepo.search.mockReset();

    createNotificationMock.mockReset();
    publishMock.mockReset();

    // Default states
    mockRequestRepo.findById.mockResolvedValue(null);
    mockRequestRepo.findPending.mockResolvedValue(null);
    mockRequestRepo.findPendingBetween.mockResolvedValue(null);
    mockRequestRepo.findIncoming.mockResolvedValue([]);
    mockRequestRepo.findOutgoing.mockResolvedValue([]);
    mockRequestRepo.create.mockImplementation(async (input: { fromIdentityId: ObjectId; toIdentityId: ObjectId }) =>
      makeFriendRequestDoc({ fromIdentityId: input.fromIdentityId, toIdentityId: input.toIdentityId })
    );
    mockRequestRepo.updateStatus.mockResolvedValue(null);
    mockRequestRepo.countIncoming.mockResolvedValue(0);
    mockRequestRepo.deleteById.mockResolvedValue(true);
    mockRequestRepo.deleteByPair.mockResolvedValue(0);

    mockFriendshipRepo.areFriends.mockResolvedValue(false);
    mockFriendshipRepo.create.mockResolvedValue(undefined);
    mockFriendshipRepo.remove.mockResolvedValue(false);
    mockFriendshipRepo.getFriends.mockResolvedValue([]);
    mockFriendshipRepo.searchFriends.mockResolvedValue([]);
    mockFriendshipRepo.countFriends.mockResolvedValue(0);

    mockBlockRepo.isBlockedByEither.mockResolvedValue(false);

    mockIdentityRepo.findByIdentityId.mockResolvedValue(null);
    mockIdentityRepo.search.mockResolvedValue([]);

    createNotificationMock.mockResolvedValue(undefined);
    publishMock.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // sendFriendRequest
  // ---------------------------------------------------------------------------

  test('sendFriendRequest rejects self-requests', async () => {
    const result = await sendFriendRequest(identityA, identityA);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CANNOT_FRIEND_SELF');
    expect(mockRequestRepo.create).not.toHaveBeenCalled();
  });

  test('sendFriendRequest returns IDENTITY_NOT_FOUND for missing target', async () => {
    mockIdentityRepo.findByIdentityId.mockResolvedValue(null);

    const result = await sendFriendRequest(identityA, identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('IDENTITY_NOT_FOUND');
  });

  test('sendFriendRequest silently succeeds when blocked (privacy)', async () => {
    mockIdentityRepo.findByIdentityId.mockResolvedValue({ _id: identityB, username: 'bob' });
    mockBlockRepo.isBlockedByEither.mockResolvedValue(true);

    const result = await sendFriendRequest(identityA, identityB);
    expect(result.success).toBe(true);
    expect(result.request).toBeUndefined();
    expect(mockRequestRepo.create).not.toHaveBeenCalled();
  });

  test('sendFriendRequest returns ALREADY_FRIENDS if already friends', async () => {
    mockIdentityRepo.findByIdentityId.mockResolvedValue({ _id: identityB, username: 'bob' });
    mockFriendshipRepo.areFriends.mockResolvedValue(true);

    const result = await sendFriendRequest(identityA, identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ALREADY_FRIENDS');
  });

  test('sendFriendRequest returns REQUEST_EXISTS if pending request exists', async () => {
    mockIdentityRepo.findByIdentityId.mockResolvedValue({ _id: identityB, username: 'bob' });
    mockRequestRepo.findPendingBetween.mockResolvedValue(makeFriendRequestDoc());

    const result = await sendFriendRequest(identityA, identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REQUEST_EXISTS');
  });

  test('sendFriendRequest creates request, notification, and Redis event on success', async () => {
    mockIdentityRepo.findByIdentityId.mockImplementation(async (id: ObjectId) => {
      if (id.toHexString() === identityA.toHexString()) {
        return { _id: identityA, username: 'alice' };
      }
      if (id.toHexString() === identityB.toHexString()) {
        return { _id: identityB, username: 'bob' };
      }
      return null;
    });

    const result = await sendFriendRequest(identityA, identityB);
    expect(result.success).toBe(true);
    expect(result.request).toBeDefined();
    expect(mockRequestRepo.create).toHaveBeenCalledTimes(1);
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // acceptFriendRequest
  // ---------------------------------------------------------------------------

  test('acceptFriendRequest returns REQUEST_NOT_FOUND for missing request', async () => {
    const result = await acceptFriendRequest(new ObjectId(), identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REQUEST_NOT_FOUND');
  });

  test('acceptFriendRequest returns REQUEST_NOT_FOUND for non-pending request', async () => {
    mockRequestRepo.findById.mockResolvedValue(makeFriendRequestDoc({ status: 'accepted' }));

    const result = await acceptFriendRequest(new ObjectId(), identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REQUEST_NOT_FOUND');
  });

  test('acceptFriendRequest returns NOT_AUTHORIZED if caller is not the recipient', async () => {
    const request = makeFriendRequestDoc();
    mockRequestRepo.findById.mockResolvedValue(request);
    const unauthorizedId = new ObjectId();

    const result = await acceptFriendRequest(request._id, unauthorizedId);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_AUTHORIZED');
  });

  test('acceptFriendRequest creates friendship and notifies sender', async () => {
    const request = makeFriendRequestDoc();
    mockRequestRepo.findById.mockResolvedValue(request);
    mockIdentityRepo.findByIdentityId.mockResolvedValue({
      _id: request.toIdentityId,
      username: 'bob',
    });

    const result = await acceptFriendRequest(request._id, request.toIdentityId);
    expect(result.success).toBe(true);
    expect(mockRequestRepo.updateStatus).toHaveBeenCalledWith(request._id, 'accepted');
    expect(mockFriendshipRepo.create).toHaveBeenCalledWith(request.fromIdentityId, request.toIdentityId);
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // ignoreFriendRequest
  // ---------------------------------------------------------------------------

  test('ignoreFriendRequest returns REQUEST_NOT_FOUND for missing request', async () => {
    const result = await ignoreFriendRequest(new ObjectId(), identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REQUEST_NOT_FOUND');
  });

  test('ignoreFriendRequest returns NOT_AUTHORIZED if caller is not recipient', async () => {
    const request = makeFriendRequestDoc();
    mockRequestRepo.findById.mockResolvedValue(request);

    const result = await ignoreFriendRequest(request._id, new ObjectId());
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_AUTHORIZED');
  });

  test('ignoreFriendRequest silently updates status without notification', async () => {
    const request = makeFriendRequestDoc();
    mockRequestRepo.findById.mockResolvedValue(request);

    const result = await ignoreFriendRequest(request._id, request.toIdentityId);
    expect(result.success).toBe(true);
    expect(mockRequestRepo.updateStatus).toHaveBeenCalledWith(request._id, 'ignored');
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // cancelFriendRequest
  // ---------------------------------------------------------------------------

  test('cancelFriendRequest returns REQUEST_NOT_FOUND for missing request', async () => {
    const result = await cancelFriendRequest(new ObjectId(), identityA);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REQUEST_NOT_FOUND');
  });

  test('cancelFriendRequest returns NOT_AUTHORIZED if caller is not sender', async () => {
    const request = makeFriendRequestDoc();
    mockRequestRepo.findById.mockResolvedValue(request);

    const result = await cancelFriendRequest(request._id, request.toIdentityId);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_AUTHORIZED');
  });

  test('cancelFriendRequest deletes the request on success', async () => {
    const request = makeFriendRequestDoc();
    mockRequestRepo.findById.mockResolvedValue(request);

    const result = await cancelFriendRequest(request._id, request.fromIdentityId);
    expect(result.success).toBe(true);
    expect(mockRequestRepo.deleteById).toHaveBeenCalledWith(request._id);
  });

  // ---------------------------------------------------------------------------
  // removeFriend
  // ---------------------------------------------------------------------------

  test('removeFriend returns NOT_FRIENDS when not friends', async () => {
    mockFriendshipRepo.remove.mockResolvedValue(false);

    const result = await removeFriend(identityA, identityB);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_FRIENDS');
  });

  test('removeFriend removes friendship and publishes event', async () => {
    mockFriendshipRepo.remove.mockResolvedValue(true);

    const result = await removeFriend(identityA, identityB);
    expect(result.success).toBe(true);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // getFriends
  // ---------------------------------------------------------------------------

  test('getFriends returns friend info with pagination cursor', async () => {
    const friendId = new ObjectId();
    const friendshipId = new ObjectId();
    const friendsSince = new Date('2026-02-15T00:00:00.000Z');

    mockFriendshipRepo.getFriends.mockResolvedValue([
      { _id: friendshipId, identityId: identityA, friendIdentityId: friendId, createdAt: friendsSince, updatedAt: friendsSince },
    ]);
    mockIdentityRepo.findByIdentityId.mockResolvedValue({ _id: friendId, username: 'charlie' });

    const result = await getFriends(identityA, 50);
    expect(result.friends.length).toBe(1);
    expect(result.friends[0]!.identity.id).toBe(friendId.toHexString());
    expect(result.friends[0]!.friendsSince).toBe(friendsSince.toISOString());
    expect(result.cursor).toBeNull();
  });

  test('getFriends sets cursor when more results exist', async () => {
    const docs = Array.from({ length: 3 }, (_, i) => ({
      _id: new ObjectId(),
      identityId: identityA,
      friendIdentityId: new ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockFriendshipRepo.getFriends.mockResolvedValue(docs);
    mockIdentityRepo.findByIdentityId.mockImplementation(async (id: ObjectId) => ({
      _id: id,
      username: `user-${id.toHexString().slice(0, 4)}`,
    }));

    const result = await getFriends(identityA, 2);
    expect(result.friends.length).toBe(2);
    expect(result.cursor).toBe(docs[1]!._id.toHexString());
  });

  test('getFriends skips unresolvable identities', async () => {
    mockFriendshipRepo.getFriends.mockResolvedValue([
      { _id: new ObjectId(), identityId: identityA, friendIdentityId: new ObjectId(), createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockIdentityRepo.findByIdentityId.mockResolvedValue(null);

    const result = await getFriends(identityA, 50);
    expect(result.friends.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // searchFriends
  // ---------------------------------------------------------------------------

  test('searchFriends returns empty array when no identities match query', async () => {
    mockIdentityRepo.search.mockResolvedValue([]);

    const result = await searchFriends(identityA, 'nobody');
    expect(result).toEqual([]);
    expect(mockFriendshipRepo.searchFriends).not.toHaveBeenCalled();
  });

  test('searchFriends filters matching identities to only friends', async () => {
    const friendId = new ObjectId();
    const nonFriendId = new ObjectId();

    mockIdentityRepo.search.mockResolvedValue([
      { _id: friendId, username: 'pal' },
      { _id: nonFriendId, username: 'stranger' },
    ]);
    mockFriendshipRepo.searchFriends.mockResolvedValue([
      { _id: new ObjectId(), identityId: identityA, friendIdentityId: friendId, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const result = await searchFriends(identityA, 'p');
    expect(result.length).toBe(1);
    expect(result[0]!.identity.id).toBe(friendId.toHexString());
  });

  // ---------------------------------------------------------------------------
  // getIncomingRequests
  // ---------------------------------------------------------------------------

  test('getIncomingRequests returns requests with sender identity info', async () => {
    const request = makeFriendRequestDoc();
    mockRequestRepo.findIncoming.mockResolvedValue([request]);
    mockRequestRepo.countIncoming.mockResolvedValue(1);
    mockIdentityRepo.findByIdentityId.mockResolvedValue({
      _id: request.fromIdentityId,
      username: 'alice',
    });

    const result = await getIncomingRequests(identityB, 50);
    expect(result.requests.length).toBe(1);
    expect(result.count).toBe(1);
    expect(result.cursor).toBeNull();
  });

  test('getIncomingRequests skips requests with unresolvable sender', async () => {
    const request = makeFriendRequestDoc();
    mockRequestRepo.findIncoming.mockResolvedValue([request]);
    mockRequestRepo.countIncoming.mockResolvedValue(1);
    mockIdentityRepo.findByIdentityId.mockResolvedValue(null);

    const result = await getIncomingRequests(identityB, 50);
    expect(result.requests.length).toBe(0);
    expect(result.count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // getOutgoingRequests
  // ---------------------------------------------------------------------------

  test('getOutgoingRequests returns paginated public requests', async () => {
    const requests = [makeFriendRequestDoc(), makeFriendRequestDoc()];
    mockRequestRepo.findOutgoing.mockResolvedValue(requests);

    const result = await getOutgoingRequests(identityA, 50);
    expect(result.requests.length).toBe(2);
    expect(result.cursor).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // getIncomingRequestCount
  // ---------------------------------------------------------------------------

  test('getIncomingRequestCount delegates to repository', async () => {
    mockRequestRepo.countIncoming.mockResolvedValue(5);

    const count = await getIncomingRequestCount(identityA);
    expect(count).toBe(5);
    expect(mockRequestRepo.countIncoming).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // getFriendshipStatus
  // ---------------------------------------------------------------------------

  test('getFriendshipStatus returns friends when already friends', async () => {
    mockFriendshipRepo.areFriends.mockResolvedValue(true);

    const status = await getFriendshipStatus(identityA, identityB);
    expect(status).toBe('friends');
  });

  test('getFriendshipStatus returns pending_outgoing when request sent', async () => {
    mockFriendshipRepo.areFriends.mockResolvedValue(false);
    mockRequestRepo.findPendingBetween.mockResolvedValue(
      makeFriendRequestDoc({ fromIdentityId: identityA, toIdentityId: identityB })
    );

    const status = await getFriendshipStatus(identityA, identityB);
    expect(status).toBe('pending_outgoing');
  });

  test('getFriendshipStatus returns pending_incoming when request received', async () => {
    mockFriendshipRepo.areFriends.mockResolvedValue(false);
    mockRequestRepo.findPendingBetween.mockResolvedValue(
      makeFriendRequestDoc({ fromIdentityId: identityB, toIdentityId: identityA })
    );

    const status = await getFriendshipStatus(identityA, identityB);
    expect(status).toBe('pending_incoming');
  });

  test('getFriendshipStatus returns none when no relationship exists', async () => {
    mockFriendshipRepo.areFriends.mockResolvedValue(false);
    mockRequestRepo.findPendingBetween.mockResolvedValue(null);

    const status = await getFriendshipStatus(identityA, identityB);
    expect(status).toBe('none');
  });

  // ---------------------------------------------------------------------------
  // cleanupFriendData
  // ---------------------------------------------------------------------------

  test('cleanupFriendData removes friendship and requests between identities', async () => {
    await cleanupFriendData(identityA, identityB);
    expect(mockFriendshipRepo.remove).toHaveBeenCalledTimes(1);
    expect(mockRequestRepo.deleteByPair).toHaveBeenCalledTimes(1);
  });
});
