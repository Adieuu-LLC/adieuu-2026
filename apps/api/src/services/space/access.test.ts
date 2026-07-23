/**
 * Unit tests for Space read-access resolution, focused on visibility rules and
 * the banned-member read revocation (a ban keeps the membership row with
 * status 'banned' — it must not grant read access).
 *
 * @module services/space/access.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const memberRepo = {
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space-member.repository', () => ({
  getSpaceMemberRepository: () => memberRepo,
}));

import { canReadSpace } from './access';
import type { SpaceDocument } from '../../models/space';

const OWNER = new ObjectId();
const CIPHER_CHECK = { knownValue: 'kv', encryptedKnownValue: 'ct', nonce: 'n' };

function makeSpace(overrides: Record<string, unknown> = {}): SpaceDocument {
  const now = new Date();
  return {
    _id: new ObjectId(),
    slug: 'a-space',
    name: 'A Space',
    visibility: 'public',
    e2ee: false,
    encryptIdentity: false,
    cipherRequired: false,
    createdBy: OWNER,
    ownerIdentityId: OWNER,
    allowFreeMembers: false,
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SpaceDocument;
}

function seedMember(status: 'active' | 'banned') {
  memberRepo.findMember.mockResolvedValue({
    _id: new ObjectId(),
    spaceId: new ObjectId(),
    identityId: new ObjectId(),
    roleIds: [],
    status,
    joinedAt: new Date(),
  });
}

describe('canReadSpace', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    memberRepo.findMember.mockClear();
    memberRepo.findMember.mockResolvedValue(null);
  });

  test('public spaces are readable by anyone', async () => {
    const r = await canReadSpace(makeSpace({ visibility: 'public' }), new ObjectId());
    expect(r.ok).toBe(true);
  });

  test('listed non-E2EE spaces are browsable without membership', async () => {
    const r = await canReadSpace(makeSpace({ visibility: 'listed' }), new ObjectId());
    expect(r.ok).toBe(true);
  });

  test('listed E2EE spaces require an active membership', async () => {
    const space = makeSpace({ visibility: 'listed', e2ee: true, cipherCheck: CIPHER_CHECK });
    const r = await canReadSpace(space, new ObjectId());
    expect(r).toMatchObject({ ok: false, errorCode: 'NOT_MEMBER' });
  });

  test('hidden spaces are not revealed to non-members', async () => {
    const r = await canReadSpace(makeSpace({ visibility: 'hidden' }), new ObjectId());
    expect(r).toMatchObject({ ok: false, errorCode: 'SPACE_NOT_FOUND' });
  });

  test('active members can read hidden spaces', async () => {
    seedMember('active');
    const r = await canReadSpace(makeSpace({ visibility: 'hidden' }), new ObjectId());
    expect(r.ok).toBe(true);
  });

  test('banned members lose read access to hidden spaces (not revealed)', async () => {
    seedMember('banned');
    const r = await canReadSpace(makeSpace({ visibility: 'hidden' }), new ObjectId());
    expect(r).toMatchObject({ ok: false, errorCode: 'SPACE_NOT_FOUND' });
  });

  test('banned members lose read access to listed E2EE spaces', async () => {
    seedMember('banned');
    const space = makeSpace({ visibility: 'listed', e2ee: true, cipherCheck: CIPHER_CHECK });
    const r = await canReadSpace(space, new ObjectId());
    expect(r).toMatchObject({ ok: false, errorCode: 'NOT_MEMBER' });
  });
});
