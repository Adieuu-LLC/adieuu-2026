/**
 * @module services/identity-keys-access.service.test
 */

import { afterAll, describe, expect, mock, beforeEach, test } from 'bun:test';
import { ObjectId } from 'mongodb';
const areFriendsMock = mock(() => Promise.resolve(false));
const findAnyWithBothParticipantsMock = mock(() => Promise.resolve(null));
const isBlockedByEitherMock = mock(() => Promise.resolve(false));

mock.module('../repositories/friendship.repository', () => ({
  getFriendshipRepository: () => ({
    areFriends: areFriendsMock,
  }),
}));

mock.module('../repositories/conversation.repository', () => ({
  getConversationRepository: () => ({
    findAnyWithBothParticipants: findAnyWithBothParticipantsMock,
  }),
}));

// Must expose every runtime export of `./block.service`; a partial mock poisons the
// module for later test files (Bun `mock.module` + `mock.restore()` lifecycle).
mock.module('./block.service', () => ({
  blockIdentity: mock(() => Promise.resolve({ success: true })),
  unblockIdentity: mock(() => Promise.resolve({ success: true })),
  checkIfBlocked: mock(() => Promise.resolve({ blocked: false })),
  getBlockedIdentities: mock(() => Promise.resolve({ blocks: [], cursor: null })),
  getBlockedIdentityIds: mock(() => Promise.resolve([])),
  isBlockedByEither: isBlockedByEitherMock,
}));

describe('identity-keys-access', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    areFriendsMock.mockReset();
    findAnyWithBothParticipantsMock.mockReset();
    isBlockedByEitherMock.mockReset();
    isBlockedByEitherMock.mockResolvedValue(false);
  });

  test('self can access', async () => {
    const id = new ObjectId();
    const { canViewerAccessTargetIdentityKeys } = await import('./identity-keys-access.service');
    const ok = await canViewerAccessTargetIdentityKeys(id, id);
    expect(ok).toBe(true);
    expect(areFriendsMock).not.toHaveBeenCalled();
  });

  test('blocked is denied', async () => {
    const a = new ObjectId();
    const b = new ObjectId();
    isBlockedByEitherMock.mockResolvedValue(true);
    const { canViewerAccessTargetIdentityKeys } = await import('./identity-keys-access.service');
    const ok = await canViewerAccessTargetIdentityKeys(a, b);
    expect(ok).toBe(false);
  });

  test('friends allowed without shared conversation', async () => {
    const a = new ObjectId();
    const b = new ObjectId();
    areFriendsMock.mockResolvedValue(true);
    const { canViewerAccessTargetIdentityKeys } = await import('./identity-keys-access.service');
    const ok = await canViewerAccessTargetIdentityKeys(a, b);
    expect(ok).toBe(true);
    expect(findAnyWithBothParticipantsMock).not.toHaveBeenCalled();
  });

  test('non-friends allowed when shared conversation exists', async () => {
    const a = new ObjectId();
    const b = new ObjectId();
    areFriendsMock.mockResolvedValue(false);
    findAnyWithBothParticipantsMock.mockResolvedValue({ _id: new ObjectId() } as never);
    const { canViewerAccessTargetIdentityKeys } = await import('./identity-keys-access.service');
    const ok = await canViewerAccessTargetIdentityKeys(a, b);
    expect(ok).toBe(true);
  });

  test('strangers denied', async () => {
    const a = new ObjectId();
    const b = new ObjectId();
    areFriendsMock.mockResolvedValue(false);
    findAnyWithBothParticipantsMock.mockResolvedValue(null);
    const { canViewerAccessTargetIdentityKeys } = await import('./identity-keys-access.service');
    const ok = await canViewerAccessTargetIdentityKeys(a, b);
    expect(ok).toBe(false);
  });
});
