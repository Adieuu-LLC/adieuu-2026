/**
 * Unit tests for the visibility-scoped `space_channel_layout_updated`
 * broadcast: restricted channel/category metadata must only reach members who
 * can view those entries.
 *
 * @module services/space/layout-broadcast.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const roleRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
};

const memberRepo = {
  listByAnyRole: mock(async (_s: ObjectId, _r: ObjectId[]) => [] as any[]) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space-role.repository', () => ({
  getSpaceRoleRepository: () => roleRepo,
}));
mock.module('../../repositories/space-member.repository', () => ({
  getSpaceMemberRepository: () => memberRepo,
}));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({
  publishSpaceEvent,
  publishSpaceEventToIdentity: mock(async () => {}),
}));

import { publishLayoutUpdated } from './layout-broadcast';
import type { SpaceChannelDocument } from '../../models/space-channel';
import type { SpaceChannelCategoryDocument } from '../../models/space-channel-category';

const SPACE = new ObjectId();
const ADMIN_ROLE = new ObjectId();
const MOD_ROLE = new ObjectId();
const EVERYONE_ROLE = new ObjectId();

function seedRoles() {
  roleRepo.findBySpace.mockResolvedValue([
    {
      _id: ADMIN_ROLE,
      spaceId: SPACE,
      permissions: [],
      position: 0,
      isDefaultMember: false,
      isSystem: true,
      systemKey: 'admin',
    },
    {
      _id: MOD_ROLE,
      spaceId: SPACE,
      permissions: ['viewChannels'],
      position: 100,
      isDefaultMember: false,
      isSystem: false,
    },
    {
      _id: EVERYONE_ROLE,
      spaceId: SPACE,
      permissions: ['viewChannels'],
      position: 1000,
      isDefaultMember: true,
      isSystem: true,
      systemKey: 'everyone',
    },
  ]);
}

function makeChannel(
  name: string,
  position: number,
  allowedRoleIds: ObjectId[],
): SpaceChannelDocument {
  const now = new Date();
  return {
    _id: new ObjectId(),
    spaceId: SPACE,
    type: 'text',
    name,
    position,
    allowedRoleIds,
    createdAt: now,
    updatedAt: now,
  } as SpaceChannelDocument;
}

function makeCategory(
  name: string,
  position: number,
  allowedRoleIds: ObjectId[],
): SpaceChannelCategoryDocument {
  const now = new Date();
  return {
    _id: new ObjectId(),
    spaceId: SPACE,
    name,
    position,
    allowedRoleIds,
    createdAt: now,
    updatedAt: now,
  } as SpaceChannelCategoryDocument;
}

describe('publishLayoutUpdated', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    roleRepo.findBySpace.mockClear();
    memberRepo.listByAnyRole.mockClear();
    memberRepo.listByAnyRole.mockResolvedValue([]);
    publishSpaceEvent.mockClear();
    seedRoles();
  });

  test('broadcasts the full layout when every entry is everyone-open', async () => {
    const channels = [makeChannel('general', 0, [EVERYONE_ROLE])];
    const categories = [makeCategory('Main', 0, [EVERYONE_ROLE])];

    await publishLayoutUpdated(SPACE, categories, channels);

    expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
    const [spaceId, event, options] = publishSpaceEvent.mock.calls[0]!;
    expect(spaceId).toBe(SPACE.toHexString());
    expect(event.type).toBe('space_channel_layout_updated');
    expect(event.data.channels).toHaveLength(1);
    expect(options).toBeUndefined();
  });

  test('excludes restricted entries from the baseline broadcast and sends privileged views separately', async () => {
    const modIdentity = new ObjectId();
    const open = makeChannel('general', 0, [EVERYONE_ROLE]);
    const restricted = makeChannel('mods-only', 1, [MOD_ROLE]);

    memberRepo.listByAnyRole.mockResolvedValue([
      {
        _id: new ObjectId(),
        spaceId: SPACE,
        identityId: modIdentity,
        roleIds: [MOD_ROLE],
        status: 'active',
      },
    ]);

    await publishLayoutUpdated(SPACE, [], [open, restricted]);

    expect(publishSpaceEvent).toHaveBeenCalledTimes(2);

    // Baseline broadcast: open channels only, excluding privileged members.
    const [, baselineEvent, baselineOpts] = publishSpaceEvent.mock.calls[0]!;
    expect(baselineEvent.data.channels.map((c: { name: string }) => c.name)).toEqual(['general']);
    expect(baselineOpts.excludeIdentityIds).toEqual([modIdentity.toHexString()]);

    // Privileged group: full view, audience-scoped.
    const [, privEvent, privOpts] = publishSpaceEvent.mock.calls[1]!;
    expect(privEvent.data.channels.map((c: { name: string }) => c.name)).toEqual([
      'general',
      'mods-only',
    ]);
    expect(privOpts.audienceIdentityIds).toEqual([modIdentity.toHexString()]);
  });

  test('groups privileged members by their visible-entry signature', async () => {
    const modIdentity = new ObjectId();
    const adminIdentity = new ObjectId();
    const open = makeChannel('general', 0, [EVERYONE_ROLE]);
    const modsOnly = makeChannel('mods-only', 1, [MOD_ROLE]);
    const adminsOnly = makeChannel('admins-only', 2, [ADMIN_ROLE]);

    memberRepo.listByAnyRole.mockResolvedValue([
      { _id: new ObjectId(), spaceId: SPACE, identityId: modIdentity, roleIds: [MOD_ROLE], status: 'active' },
      { _id: new ObjectId(), spaceId: SPACE, identityId: adminIdentity, roleIds: [ADMIN_ROLE], status: 'active' },
    ]);

    await publishLayoutUpdated(SPACE, [], [open, modsOnly, adminsOnly]);

    // Baseline + one event per distinct visibility group (mod, admin).
    expect(publishSpaceEvent).toHaveBeenCalledTimes(3);

    const groupCalls = publishSpaceEvent.mock.calls.slice(1);
    const byAudience = new Map(
      groupCalls.map((c: unknown[]) => [
        ((c[2] as { audienceIdentityIds: string[] }).audienceIdentityIds ?? []).join(','),
        (c[1] as { data: { channels: { name: string }[] } }).data.channels.map((ch) => ch.name),
      ]),
    );

    // Mods see general + mods-only; admins (manageChannels bypass) see all.
    expect(byAudience.get(modIdentity.toHexString())).toEqual(['general', 'mods-only']);
    expect(byAudience.get(adminIdentity.toHexString())).toEqual([
      'general',
      'mods-only',
      'admins-only',
    ]);
  });

  test('restricted categories are also scoped', async () => {
    const modIdentity = new ObjectId();
    const openCat = makeCategory('Public', 0, [EVERYONE_ROLE]);
    const secretCat = makeCategory('Staff', 1, [MOD_ROLE]);

    memberRepo.listByAnyRole.mockResolvedValue([
      { _id: new ObjectId(), spaceId: SPACE, identityId: modIdentity, roleIds: [MOD_ROLE], status: 'active' },
    ]);

    await publishLayoutUpdated(SPACE, [openCat, secretCat], []);

    const [, baselineEvent] = publishSpaceEvent.mock.calls[0]!;
    expect(baselineEvent.data.categories.map((c: { name: string }) => c.name)).toEqual(['Public']);
    const [, privEvent] = publishSpaceEvent.mock.calls[1]!;
    expect(privEvent.data.categories.map((c: { name: string }) => c.name)).toEqual([
      'Public',
      'Staff',
    ]);
  });
});
