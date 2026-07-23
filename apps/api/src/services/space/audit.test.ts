/**
 * Unit tests for Space audit logging (list gate + fire-and-forget record).
 *
 * @module services/space/audit.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const spaceRepo = {
  findById: mock(async (_id: ObjectId) => null as any) as AnyMock,
};

const memberRepo = {
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
};

const roleRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
};

const auditRepo = {
  create: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  listBySpace: mock(async (_s: ObjectId, _l?: number, _c?: ObjectId) => [] as any[]) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space.repository', () => ({
  getSpaceRepository: () => spaceRepo,
}));
mock.module('../../repositories/space-member.repository', () => ({
  getSpaceMemberRepository: () => memberRepo,
}));
mock.module('../../repositories/space-role.repository', () => ({
  getSpaceRoleRepository: () => roleRepo,
}));
mock.module('../../repositories/space-audit.repository', () => ({
  getSpaceAuditLogRepository: () => auditRepo,
}));

import { listSpaceAuditLog, recordSpaceAudit } from './audit';

const OWNER = new ObjectId();

function makeSpace(overrides: Record<string, unknown> = {}) {
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
  };
}

function stubPermissions(spaceId: ObjectId, identityId: ObjectId, permissions: string[]) {
  const roleId = new ObjectId();
  memberRepo.findMember.mockResolvedValue({
    _id: new ObjectId(),
    spaceId,
    identityId,
    roleIds: [roleId],
    status: 'active',
    joinedAt: new Date(),
  });
  roleRepo.findBySpace.mockResolvedValue([
    { _id: roleId, spaceId, permissions, position: 10 },
  ]);
}

describe('space/audit', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    for (const repo of [spaceRepo, memberRepo, roleRepo, auditRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findById.mockResolvedValue(null);
    memberRepo.findMember.mockResolvedValue(null);
    roleRepo.findBySpace.mockResolvedValue([]);
    auditRepo.create.mockResolvedValue({
      _id: new ObjectId(),
      spaceId: new ObjectId(),
      actorIdentityId: new ObjectId(),
      action: 'member_kick',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    auditRepo.listBySpace.mockResolvedValue([]);
  });

  describe('listSpaceAuditLog', () => {
    test('rejects invalid ids', async () => {
      const r = await listSpaceAuditLog('not-an-id', 'also-bad');
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ID' });
    });

    test('rejects when Space is missing', async () => {
      const r = await listSpaceAuditLog(new ObjectId(), new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });

    test('rejects non-members', async () => {
      const space = makeSpace();
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await listSpaceAuditLog(space._id, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('rejects members without viewAuditLog', async () => {
      const space = makeSpace();
      spaceRepo.findById.mockResolvedValue(space);
      const requester = new ObjectId();
      stubPermissions(space._id, requester, ['viewChannels', 'kickMembers']);
      const r = await listSpaceAuditLog(space._id, requester);
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
      expect(auditRepo.listBySpace).not.toHaveBeenCalled();
    });

    test('returns entries when viewAuditLog is held', async () => {
      const space = makeSpace();
      spaceRepo.findById.mockResolvedValue(space);
      const requester = new ObjectId();
      stubPermissions(space._id, requester, ['viewAuditLog']);
      const entryId = new ObjectId();
      const actorId = new ObjectId();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      auditRepo.listBySpace.mockResolvedValue([
        {
          _id: entryId,
          spaceId: space._id,
          actorIdentityId: actorId,
          action: 'member_kick',
          targetIdentityId: new ObjectId(),
          createdAt,
          updatedAt: createdAt,
        },
      ]);

      const r = await listSpaceAuditLog(space._id, requester, 50);
      expect(r.success).toBe(true);
      expect(r.entries).toHaveLength(1);
      expect(r.entries?.[0]).toMatchObject({
        id: entryId.toHexString(),
        spaceId: space._id.toHexString(),
        actorIdentityId: actorId.toHexString(),
        action: 'member_kick',
        createdAt: createdAt.toISOString(),
      });
      expect(r.cursor).toBeNull();
    });
  });

  describe('recordSpaceAudit', () => {
    test('does not throw when the repository fails', async () => {
      auditRepo.create.mockRejectedValueOnce(new Error('mongo down'));
      await expect(
        recordSpaceAudit({
          spaceId: new ObjectId(),
          actorIdentityId: new ObjectId(),
          action: 'member_kick',
          targetIdentityId: new ObjectId(),
        }),
      ).resolves.toBeUndefined();
    });

    test('writes when create succeeds', async () => {
      const spaceId = new ObjectId();
      const actorIdentityId = new ObjectId();
      const targetIdentityId = new ObjectId();
      await recordSpaceAudit({
        spaceId,
        actorIdentityId,
        action: 'member_ban',
        targetIdentityId,
        metadata: { duration: '1d', reason: 'spam' },
      });
      expect(auditRepo.create).toHaveBeenCalledWith({
        spaceId,
        actorIdentityId,
        action: 'member_ban',
        targetIdentityId,
        metadata: { duration: '1d', reason: 'spam' },
      });
    });
  });
});
