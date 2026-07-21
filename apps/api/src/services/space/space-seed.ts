/**
 * Seeds default roles, creator membership, category, and `#general` after
 * a Space document is created.
 *
 * @module services/space/space-seed
 */

import { ObjectId } from 'mongodb';
import type { CipherCheck, CreateSpaceEncryptedSeed } from '@adieuu/shared';
import {
  DEFAULT_ADMIN_ROLE_NAME,
  DEFAULT_MEMBER_ROLE_NAME,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
  DEFAULT_ADMIN_ROLE_COLOR,
  DEFAULT_MEMBER_ROLE_COLOR,
  DEFAULT_SPACE_CATEGORY_NAME,
  DEFAULT_SPACE_CHANNEL_NAME,
} from '../../constants/spaces';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceChannelCategoryRepository } from '../../repositories/space-channel-category.repository';

export interface SeedNewSpaceParams {
  spaceId: ObjectId;
  creatorIdentityId: ObjectId;
  e2ee: boolean;
  cipherCheck?: CipherCheck;
  encryptedSeed?: CreateSpaceEncryptedSeed;
}

/** Create Admin/Member roles, creator membership, Text Channels, and #general. */
export async function seedNewSpace(params: SeedNewSpaceParams): Promise<void> {
  const { spaceId, creatorIdentityId, e2ee, cipherCheck, encryptedSeed: seed } = params;
  const roleRepo = getSpaceRoleRepository();
  const adminSeed = seed?.roles.find((r) => r.system === 'admin');
  const memberSeed = seed?.roles.find((r) => r.system === 'member');

  const adminRole = await roleRepo.createRole({
    spaceId,
    name: e2ee ? '' : DEFAULT_ADMIN_ROLE_NAME,
    permissions: [...DEFAULT_ADMIN_PERMISSIONS],
    color: DEFAULT_ADMIN_ROLE_COLOR,
    displaySeparately: true,
    mentionable: false,
    position: 0,
    isSystem: true,
    systemKey: 'admin',
    ...(adminSeed
      ? {
          encryptedName: adminSeed.encryptedName,
          nameNonce: adminSeed.nameNonce,
          cipherId: adminSeed.cipherId,
        }
      : {}),
  });
  const memberRole = await roleRepo.createRole({
    spaceId,
    name: e2ee ? '' : DEFAULT_MEMBER_ROLE_NAME,
    permissions: [...DEFAULT_MEMBER_PERMISSIONS],
    color: DEFAULT_MEMBER_ROLE_COLOR,
    displaySeparately: false,
    mentionable: false,
    position: 1000,
    isDefaultMember: true,
    isSystem: true,
    systemKey: 'member',
    ...(memberSeed
      ? {
          encryptedName: memberSeed.encryptedName,
          nameNonce: memberSeed.nameNonce,
          cipherId: memberSeed.cipherId,
        }
      : {}),
  });

  await getSpaceMemberRepository().createMember({
    spaceId,
    identityId: creatorIdentityId,
    roleIds: [adminRole._id],
  });

  const category = await getSpaceChannelCategoryRepository().createCategory({
    spaceId,
    name: e2ee ? '' : DEFAULT_SPACE_CATEGORY_NAME,
    position: 0,
    allowedRoleIds: [memberRole._id],
    ...(seed?.category
      ? {
          encryptedName: seed.category.encryptedName,
          nameNonce: seed.category.nameNonce,
          cipherId: seed.category.cipherId,
        }
      : {}),
    // Default category inherits the Space Cipher when the Space is e2ee.
    ...(e2ee && cipherCheck ? { cipherCheck } : {}),
  });

  await getSpaceChannelRepository().createChannel({
    spaceId,
    type: 'text',
    name: e2ee ? '' : DEFAULT_SPACE_CHANNEL_NAME,
    position: 0,
    categoryId: category._id,
    allowedRoleIds: [memberRole._id],
    inheritAllowedRoleIds: true,
    inheritCipherCheck: true,
    ...(seed?.channel
      ? {
          encryptedName: seed.channel.encryptedName,
          nameNonce: seed.channel.nameNonce,
          cipherId: seed.channel.cipherId,
        }
      : {}),
    // Default channel inherits the Space Cipher when the Space is e2ee.
    ...(e2ee && cipherCheck ? { cipherCheck } : {}),
  });
}
