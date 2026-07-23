/**
 * Unit tests for Space role CRUD and member role assignment.
 *
 * @module services/space/roles.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const spaceRepo = {
  findById: mock(async (_id: ObjectId) => null as any) as AnyMock,
};
const roleRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
  findByIdInSpace: mock(async (_s: ObjectId, _r: ObjectId) => null as any) as AnyMock,
  findBySystemKey: mock(async (_s: ObjectId, _k: string) => null as any) as AnyMock,
  createRole: mock(async (input: any) => ({
    _id: new ObjectId(),
    ...input,
    color: input.color ?? '#5865f2',
    displaySeparately: input.displaySeparately ?? false,
    mentionable: input.mentionable ?? false,
    position: input.position ?? 0,
    isDefaultMember: input.isDefaultMember ?? false,
    isSystem: input.isSystem ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  updateRole: mock(async (_s: ObjectId, _r: ObjectId, fields: any) => ({
    _id: _r,
    spaceId: _s,
    name: 'Role',
    permissions: fields.permissions ?? [],
    color: fields.color ?? '#5865f2',
    displaySeparately: fields.displaySeparately ?? false,
    mentionable: fields.mentionable ?? false,
    position: fields.position ?? 0,
    isDefaultMember: false,
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  deleteRole: mock(async () => true) as AnyMock,
  clearDefaultMemberExcept: mock(async () => undefined) as AnyMock,
};
const memberRepo = {
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
  listBySpace: mock(async () => [] as any[]) as AnyMock,
  listByRole: mock(async () => [] as any[]) as AnyMock,
  removeRole: mock(async () => true) as AnyMock,
  setRoles: mock(async (_s: ObjectId, _i: ObjectId, roleIds: ObjectId[]) => ({
    _id: new ObjectId(),
    spaceId: _s,
    identityId: _i,
    roleIds,
    status: 'active',
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  countWithRole: mock(async () => 1) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space.repository', () => ({ getSpaceRepository: () => spaceRepo }));
mock.module('../../repositories/space-role.repository', () => ({ getSpaceRoleRepository: () => roleRepo }));
mock.module('../../repositories/space-member.repository', () => ({ getSpaceMemberRepository: () => memberRepo }));
mock.module('../../repositories/space-audit.repository', () => ({
  getSpaceAuditLogRepository: () => ({
    create: mock(async () => ({})),
    listBySpace: mock(async () => []),
  }),
}));

import { createSpaceRole, updateSpaceRole, deleteSpaceRole, setMemberRoles } from './roles';

const SPACE = new ObjectId();
const ACTOR = new ObjectId();
const TARGET = new ObjectId();
const ADMIN_ROLE = new ObjectId();
const MEMBER_ROLE = new ObjectId();
const CUSTOM_ROLE = new ObjectId();

function seedSpace() {
  spaceRepo.findById.mockResolvedValue({
    _id: SPACE,
    slug: 's',
    name: 'S',
    e2ee: false,
    visibility: 'public',
  });
}

function seedActorWithPerms(
  permissions: string[],
  systemKey?: 'admin' | 'everyone',
  position = 0,
) {
  const roleId = new ObjectId();
  memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
    id.equals(ACTOR)
      ? { _id: new ObjectId(), spaceId: SPACE, identityId: ACTOR, roleIds: [roleId], status: 'active' }
      : null,
  );
  roleRepo.findBySpace.mockResolvedValue([
    {
      _id: roleId,
      spaceId: SPACE,
      name: 'Actor',
      permissions,
      ...(systemKey ? { systemKey } : {}),
      isSystem: !!systemKey,
      isDefaultMember: systemKey === 'everyone',
      color: '#fff',
      displaySeparately: false,
      mentionable: false,
      position,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

describe('space/roles', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    for (const repo of [spaceRepo, roleRepo, memberRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findById.mockResolvedValue(null);
    memberRepo.findMember.mockResolvedValue(null);
    roleRepo.findBySpace.mockResolvedValue([]);
    roleRepo.findByIdInSpace.mockResolvedValue(null);
    roleRepo.findBySystemKey.mockResolvedValue(null);
    roleRepo.deleteRole.mockResolvedValue(true);
    memberRepo.countWithRole.mockResolvedValue(1);
  });

  test('createSpaceRole requires manageRoles', async () => {
    seedSpace();
    seedActorWithPerms(['sendMessages']);
    const r = await createSpaceRole(SPACE, ACTOR, { name: 'Mod', permissions: [] });
    expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
  });

  test('createSpaceRole rejects escalation', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles', 'sendMessages']);
    const r = await createSpaceRole(SPACE, ACTOR, {
      name: 'Escalated',
      permissions: ['manageRoles', 'kickMembers'],
    });
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
  });

  test('createSpaceRole succeeds for a subset of actor perms', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles', 'sendMessages', 'kickMembers']);
    const r = await createSpaceRole(SPACE, ACTOR, {
      name: 'Mod',
      permissions: ['sendMessages'],
      color: '#112233',
    });
    expect(r.success).toBe(true);
    expect(r.role?.name).toBe('Mod');
    expect(roleRepo.createRole).toHaveBeenCalled();
  });

  test('createSpaceRole blocks a non-admin creating a role at or above their own rank', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles', 'sendMessages'], undefined, 5);
    const r = await createSpaceRole(SPACE, ACTOR, {
      name: 'Sneaky',
      permissions: ['sendMessages'],
      position: 5,
    });
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    expect(roleRepo.createRole).not.toHaveBeenCalled();
  });

  test('createSpaceRole allows a non-admin creating a role below their own rank', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles', 'sendMessages'], undefined, 5);
    const r = await createSpaceRole(SPACE, ACTOR, {
      name: 'Junior',
      permissions: ['sendMessages'],
      position: 6,
    });
    expect(r.success).toBe(true);
    expect(roleRepo.createRole).toHaveBeenCalled();
  });

  test('updateSpaceRole blocks a non-admin editing a role at or above their own rank', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles'], undefined, 5);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: CUSTOM_ROLE,
      spaceId: SPACE,
      name: 'Senior',
      permissions: [],
      isSystem: false,
      isDefaultMember: false,
      color: '#000000',
      displaySeparately: false,
      mentionable: false,
      position: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await updateSpaceRole(SPACE, CUSTOM_ROLE, ACTOR, { name: 'Hijacked' });
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    expect(roleRepo.updateRole).not.toHaveBeenCalled();
  });

  test('updateSpaceRole blocks a non-admin moving a role to or above their own rank', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles'], undefined, 5);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: CUSTOM_ROLE,
      spaceId: SPACE,
      name: 'Junior',
      permissions: [],
      isSystem: false,
      isDefaultMember: false,
      color: '#000000',
      displaySeparately: false,
      mentionable: false,
      position: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await updateSpaceRole(SPACE, CUSTOM_ROLE, ACTOR, { position: 3 });
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    expect(roleRepo.updateRole).not.toHaveBeenCalled();
  });

  test('updateSpaceRole lets an Admin edit any role', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles'], 'admin', 3);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: CUSTOM_ROLE,
      spaceId: SPACE,
      name: 'Above Admin Position',
      permissions: [],
      isSystem: false,
      isDefaultMember: false,
      color: '#000000',
      displaySeparately: false,
      mentionable: false,
      position: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await updateSpaceRole(SPACE, CUSTOM_ROLE, ACTOR, { name: 'Renamed' });
    expect(r.success).toBe(true);
    expect(roleRepo.updateRole).toHaveBeenCalled();
  });

  test('updateSpaceRole lets a legacy isSystem Admin edit roles at position 0', async () => {
    seedSpace();
    // Pre-systemKey Admin: isSystem + name, no systemKey / position.
    const legacyAdminId = new ObjectId();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
      id.equals(ACTOR)
        ? {
            _id: new ObjectId(),
            spaceId: SPACE,
            identityId: ACTOR,
            roleIds: [legacyAdminId],
            status: 'active',
          }
        : null,
    );
    roleRepo.findBySpace.mockResolvedValue([
      {
        _id: legacyAdminId,
        spaceId: SPACE,
        name: 'Admin',
        permissions: ['admin', 'manageRoles'],
        isSystem: true,
        isDefaultMember: false,
        color: '#e74c3c',
        displaySeparately: true,
        mentionable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: CUSTOM_ROLE,
      spaceId: SPACE,
      name: 'Member',
      permissions: ['viewChannels'],
      isSystem: true,
      isDefaultMember: true,
      color: '#99aab5',
      displaySeparately: false,
      mentionable: false,
      // Missing position → treated as 0, same as legacy Admin.
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await updateSpaceRole(SPACE, CUSTOM_ROLE, ACTOR, {
      permissions: ['viewChannels', 'connect', 'speak'],
    });
    expect(r.success).toBe(true);
    expect(roleRepo.updateRole).toHaveBeenCalled();
  });

  test('deleteSpaceRole blocks a non-admin deleting a role at or above their own rank', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles'], undefined, 5);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: CUSTOM_ROLE,
      spaceId: SPACE,
      name: 'Senior',
      permissions: [],
      isSystem: false,
      isDefaultMember: false,
      color: '#000000',
      displaySeparately: false,
      mentionable: false,
      position: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await deleteSpaceRole(SPACE, CUSTOM_ROLE, ACTOR);
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    expect(roleRepo.deleteRole).not.toHaveBeenCalled();
  });

  test('deleteSpaceRole rejects Admin system role even with no holders', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles']);
    memberRepo.countWithRole.mockResolvedValue(0);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: ADMIN_ROLE,
      spaceId: SPACE,
      name: 'Admin',
      permissions: [],
      isSystem: true,
      systemKey: 'admin',
      color: '#e74c3c',
      displaySeparately: true,
      mentionable: false,
      position: 0,
      isDefaultMember: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await deleteSpaceRole(SPACE, ADMIN_ROLE, ACTOR);
    expect(r).toMatchObject({ success: false, errorCode: 'SYSTEM_ROLE' });
    expect(roleRepo.deleteRole).not.toHaveBeenCalled();
  });

  test('deleteSpaceRole rejects Everyone system role', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles']);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: MEMBER_ROLE,
      spaceId: SPACE,
      name: 'Everyone',
      permissions: [],
      isSystem: true,
      systemKey: 'everyone',
      color: '#99aab5',
      displaySeparately: false,
      mentionable: false,
      position: 1000,
      isDefaultMember: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await deleteSpaceRole(SPACE, MEMBER_ROLE, ACTOR);
    expect(r).toMatchObject({ success: false, errorCode: 'SYSTEM_ROLE' });
    expect(roleRepo.deleteRole).not.toHaveBeenCalled();
  });

  function adminRoleDoc(overrides: Record<string, unknown> = {}) {
    return {
      _id: ADMIN_ROLE,
      spaceId: SPACE,
      name: 'Admin',
      permissions: ['manageRoles', 'kickMembers', 'manageMetadata'],
      systemKey: 'admin' as const,
      isSystem: true,
      isDefaultMember: false,
      color: '#e74c3c',
      displaySeparately: true,
      mentionable: false,
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function memberRoleDoc() {
    return {
      _id: MEMBER_ROLE,
      spaceId: SPACE,
      name: 'Everyone',
      permissions: ['viewChannels', 'sendMessages'],
      systemKey: 'everyone' as const,
      isSystem: true,
      isDefaultMember: true,
      color: '#99aab5',
      displaySeparately: false,
      mentionable: false,
      position: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  test('setMemberRoles protects the last Admin', async () => {
    seedSpace();
    const actorRole = new ObjectId();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
      if (id.equals(ACTOR)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: ACTOR,
          roleIds: [actorRole, MEMBER_ROLE],
          status: 'active',
        };
      }
      if (id.equals(TARGET)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: TARGET,
          roleIds: [ADMIN_ROLE, MEMBER_ROLE],
          status: 'active',
        };
      }
      return null;
    });
    roleRepo.findBySpace.mockResolvedValue([
      adminRoleDoc(),
      memberRoleDoc(),
      {
        _id: actorRole,
        spaceId: SPACE,
        name: 'Role Manager',
        permissions: [
          'manageMemberRoles',
          'manageRoles',
          'kickMembers',
          'manageMetadata',
          'viewChannels',
          'sendMessages',
        ],
        isSystem: false,
        isDefaultMember: false,
        color: '#112233',
        displaySeparately: false,
        mentionable: false,
        position: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    roleRepo.findBySystemKey.mockResolvedValue(adminRoleDoc());
    memberRepo.countWithRole.mockResolvedValue(1);

    const r = await setMemberRoles(SPACE, TARGET, ACTOR, [MEMBER_ROLE.toHexString()]);
    expect(r).toMatchObject({ success: false, errorCode: 'LAST_ADMIN' });
    expect(memberRepo.setRoles).not.toHaveBeenCalled();
  });

  test('setMemberRoles requires manageMemberRoles or manageRoles', async () => {
    seedSpace();
    const actorRole = new ObjectId();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
      if (id.equals(ACTOR)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: ACTOR,
          roleIds: [actorRole, MEMBER_ROLE],
          status: 'active',
        };
      }
      if (id.equals(TARGET)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: TARGET,
          roleIds: [MEMBER_ROLE],
          status: 'active',
        };
      }
      return null;
    });
    roleRepo.findBySpace.mockResolvedValue([
      {
        _id: actorRole,
        spaceId: SPACE,
        name: 'Poster',
        permissions: ['viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#112233',
        displaySeparately: false,
        mentionable: false,
        position: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      memberRoleDoc(),
    ]);

    const r = await setMemberRoles(SPACE, TARGET, ACTOR, [MEMBER_ROLE.toHexString()]);
    expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    expect(memberRepo.setRoles).not.toHaveBeenCalled();
  });

  test('setMemberRoles allows manageRoles to assign elevated custom roles', async () => {
    seedSpace();
    const actorRole = new ObjectId();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
      if (id.equals(ACTOR)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: ACTOR,
          roleIds: [actorRole, MEMBER_ROLE],
          status: 'active',
        };
      }
      if (id.equals(TARGET)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: TARGET,
          roleIds: [MEMBER_ROLE],
          status: 'active',
        };
      }
      return null;
    });
    roleRepo.findBySpace.mockResolvedValue([
      {
        _id: actorRole,
        spaceId: SPACE,
        name: 'Role Editor',
        permissions: ['manageRoles', 'viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#112233',
        displaySeparately: false,
        mentionable: false,
        position: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: CUSTOM_ROLE,
        spaceId: SPACE,
        name: 'Moderator',
        permissions: ['kickMembers', 'banMembers', 'viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#abcdef',
        displaySeparately: false,
        mentionable: false,
        position: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      memberRoleDoc(),
    ]);

    const r = await setMemberRoles(SPACE, TARGET, ACTOR, [
      MEMBER_ROLE.toHexString(),
      CUSTOM_ROLE.toHexString(),
    ]);
    expect(r.success).toBe(true);
    expect(memberRepo.setRoles).toHaveBeenCalled();
  });

  test('setMemberRoles blocks non-admin from newly assigning Admin even with manageRoles', async () => {
    seedSpace();
    const actorRole = new ObjectId();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
      if (id.equals(ACTOR)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: ACTOR,
          roleIds: [actorRole, MEMBER_ROLE],
          status: 'active',
        };
      }
      if (id.equals(TARGET)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: TARGET,
          roleIds: [MEMBER_ROLE],
          status: 'active',
        };
      }
      return null;
    });
    roleRepo.findBySpace.mockResolvedValue([
      adminRoleDoc(),
      {
        _id: actorRole,
        spaceId: SPACE,
        name: 'Role Editor',
        permissions: ['manageRoles', 'manageMemberRoles', 'viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#112233',
        displaySeparately: false,
        mentionable: false,
        position: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      memberRoleDoc(),
    ]);

    const r = await setMemberRoles(SPACE, TARGET, ACTOR, [
      MEMBER_ROLE.toHexString(),
      ADMIN_ROLE.toHexString(),
    ]);
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    expect(memberRepo.setRoles).not.toHaveBeenCalled();
  });

  test('setMemberRoles blocks manageMemberRoles-only escalation', async () => {
    seedSpace();
    const actorRole = new ObjectId();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
      if (id.equals(ACTOR)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: ACTOR,
          roleIds: [actorRole, MEMBER_ROLE],
          status: 'active',
        };
      }
      if (id.equals(TARGET)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: TARGET,
          roleIds: [MEMBER_ROLE],
          status: 'active',
        };
      }
      return null;
    });
    roleRepo.findBySpace.mockResolvedValue([
      {
        _id: actorRole,
        spaceId: SPACE,
        name: 'Assigner',
        permissions: ['manageMemberRoles', 'viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#112233',
        displaySeparately: false,
        mentionable: false,
        position: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: CUSTOM_ROLE,
        spaceId: SPACE,
        name: 'Moderator',
        permissions: ['kickMembers', 'banMembers', 'viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#abcdef',
        displaySeparately: false,
        mentionable: false,
        position: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      memberRoleDoc(),
    ]);

    const r = await setMemberRoles(SPACE, TARGET, ACTOR, [
      MEMBER_ROLE.toHexString(),
      CUSTOM_ROLE.toHexString(),
    ]);
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    expect(memberRepo.setRoles).not.toHaveBeenCalled();
  });

  test('setMemberRoles blocks a non-admin assigning a role at or above their own rank', async () => {
    seedSpace();
    const actorRole = new ObjectId();
    const seniorRole = new ObjectId();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
      if (id.equals(ACTOR)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: ACTOR,
          roleIds: [actorRole, MEMBER_ROLE],
          status: 'active',
        };
      }
      if (id.equals(TARGET)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: TARGET,
          roleIds: [MEMBER_ROLE],
          status: 'active',
        };
      }
      return null;
    });
    roleRepo.findBySpace.mockResolvedValue([
      {
        _id: seniorRole,
        spaceId: SPACE,
        name: 'Senior',
        permissions: ['viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#aa0000',
        displaySeparately: false,
        mentionable: false,
        position: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: actorRole,
        spaceId: SPACE,
        name: 'Role Editor',
        permissions: ['manageRoles', 'viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#112233',
        displaySeparately: false,
        mentionable: false,
        position: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      memberRoleDoc(),
    ]);

    const r = await setMemberRoles(SPACE, TARGET, ACTOR, [
      MEMBER_ROLE.toHexString(),
      seniorRole.toHexString(),
    ]);
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    expect(memberRepo.setRoles).not.toHaveBeenCalled();
  });

  test('setMemberRoles blocks a non-admin stripping a role at or above their own rank', async () => {
    seedSpace();
    const actorRole = new ObjectId();
    const seniorRole = new ObjectId();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
      if (id.equals(ACTOR)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: ACTOR,
          roleIds: [actorRole, MEMBER_ROLE],
          status: 'active',
        };
      }
      if (id.equals(TARGET)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: TARGET,
          roleIds: [seniorRole, MEMBER_ROLE],
          status: 'active',
        };
      }
      return null;
    });
    roleRepo.findBySpace.mockResolvedValue([
      {
        _id: seniorRole,
        spaceId: SPACE,
        name: 'Senior',
        permissions: ['viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#aa0000',
        displaySeparately: false,
        mentionable: false,
        position: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: actorRole,
        spaceId: SPACE,
        name: 'Role Editor',
        permissions: ['manageRoles', 'viewChannels', 'sendMessages'],
        isSystem: false,
        isDefaultMember: false,
        color: '#112233',
        displaySeparately: false,
        mentionable: false,
        position: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      memberRoleDoc(),
    ]);

    const r = await setMemberRoles(SPACE, TARGET, ACTOR, [MEMBER_ROLE.toHexString()]);
    expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    expect(memberRepo.setRoles).not.toHaveBeenCalled();
  });

  test('setMemberRoles blocks sole Admin from self-demoting', async () => {
    seedSpace();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
      id.equals(ACTOR)
        ? {
            _id: new ObjectId(),
            spaceId: SPACE,
            identityId: ACTOR,
            roleIds: [ADMIN_ROLE, MEMBER_ROLE],
            status: 'active',
          }
        : null,
    );
    roleRepo.findBySpace.mockResolvedValue([
      adminRoleDoc({
        permissions: [
          'manageMemberRoles',
          'manageRoles',
          'kickMembers',
          'manageMetadata',
          'viewChannels',
          'sendMessages',
        ],
      }),
      memberRoleDoc(),
    ]);
    roleRepo.findBySystemKey.mockResolvedValue(
      adminRoleDoc({
        permissions: [
          'manageMemberRoles',
          'manageRoles',
          'kickMembers',
          'manageMetadata',
          'viewChannels',
          'sendMessages',
        ],
      }),
    );
    memberRepo.countWithRole.mockResolvedValue(1);

    const r = await setMemberRoles(SPACE, ACTOR, ACTOR, [MEMBER_ROLE.toHexString()]);
    expect(r).toMatchObject({ success: false, errorCode: 'LAST_ADMIN' });
    expect(memberRepo.setRoles).not.toHaveBeenCalled();
  });

  test('setMemberRoles allows demoting Admin when another Admin remains', async () => {
    seedSpace();
    memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
      if (id.equals(ACTOR) || id.equals(TARGET)) {
        return {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: id,
          roleIds: [ADMIN_ROLE, MEMBER_ROLE],
          status: 'active',
        };
      }
      return null;
    });
    roleRepo.findBySpace.mockResolvedValue([
      adminRoleDoc({
        permissions: [
          'manageMemberRoles',
          'manageRoles',
          'kickMembers',
          'manageMetadata',
          'viewChannels',
          'sendMessages',
        ],
      }),
      memberRoleDoc(),
    ]);
    roleRepo.findBySystemKey.mockResolvedValue(
      adminRoleDoc({
        permissions: [
          'manageMemberRoles',
          'manageRoles',
          'kickMembers',
          'manageMetadata',
          'viewChannels',
          'sendMessages',
        ],
      }),
    );
    memberRepo.countWithRole.mockResolvedValue(2);

    const r = await setMemberRoles(SPACE, ACTOR, ACTOR, [MEMBER_ROLE.toHexString()]);
    expect(r.success).toBe(true);
    expect(memberRepo.setRoles).toHaveBeenCalled();
  });

  test('updateSpaceRole rejects transferring default away from Everyone', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles']);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: CUSTOM_ROLE,
      spaceId: SPACE,
      name: 'Mod',
      permissions: [],
      isSystem: false,
      isDefaultMember: false,
      color: '#000000',
      displaySeparately: false,
      mentionable: false,
      position: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await updateSpaceRole(SPACE, CUSTOM_ROLE, ACTOR, { isDefaultMember: true });
    expect(r).toMatchObject({ success: false, errorCode: 'INVALID_CONTENT' });
    expect(roleRepo.clearDefaultMemberExcept).not.toHaveBeenCalled();
  });

  test('updateSpaceRole rejects clearing default on Everyone', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles']);
    roleRepo.findByIdInSpace.mockResolvedValue(memberRoleDoc());
    const r = await updateSpaceRole(SPACE, MEMBER_ROLE, ACTOR, { isDefaultMember: false });
    expect(r).toMatchObject({ success: false, errorCode: 'INVALID_CONTENT' });
  });

  test('updateSpaceRole patches display fields', async () => {
    seedSpace();
    seedActorWithPerms(['manageRoles']);
    roleRepo.findByIdInSpace.mockResolvedValue({
      _id: CUSTOM_ROLE,
      spaceId: SPACE,
      name: 'Old',
      permissions: [],
      isSystem: false,
      isDefaultMember: false,
      color: '#000000',
      displaySeparately: false,
      mentionable: false,
      position: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await updateSpaceRole(SPACE, CUSTOM_ROLE, ACTOR, {
      name: 'New',
      color: '#abcdef',
      displaySeparately: true,
      mentionable: true,
    });
    expect(r.success).toBe(true);
    expect(roleRepo.updateRole).toHaveBeenCalled();
  });
});
