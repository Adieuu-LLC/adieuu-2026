import { describe, expect, test } from 'bun:test';
import type { PublicSpaceChannelCategory } from '@adieuu/shared';
import {
  ancestorForceFlags,
  resolveParentCipherCheck,
  resolveParentRoleIds,
} from './spaceSettingsInherit';

function cat(
  overrides: Partial<PublicSpaceChannelCategory> & Pick<PublicSpaceChannelCategory, 'id' | 'name'>,
): PublicSpaceChannelCategory {
  return {
    spaceId: 'space-1',
    position: 0,
    parentCategoryId: null,
    allowedRoleIds: [],
    inheritAllowedRoleIds: false,
    inheritCipherCheck: false,
    forceChildrenAcl: false,
    forceChildrenCipher: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('spaceSettingsInherit', () => {
  test('resolveParentRoleIds falls back to Everyone', () => {
    const roles = [
      {
        id: 'everyone',
        spaceId: 's',
        name: 'Everyone',
        permissions: [],
        color: '#fff',
        displaySeparately: false,
        mentionable: false,
        position: 100,
        isDefaultMember: true,
        isSystem: true,
        createdAt: '',
        updatedAt: '',
      },
    ];
    expect(resolveParentRoleIds(null, roles)).toEqual(['everyone']);
  });

  test('resolveParentCipherCheck uses Space only at root', () => {
    const space = {
      e2ee: true,
      cipherCheck: { knownValue: 'k', encryptedKnownValue: 'e', nonce: 'n' },
    };
    expect(resolveParentCipherCheck(space, null)).toEqual(space.cipherCheck);
    expect(
      resolveParentCipherCheck(space, cat({ id: 'c1', name: 'C', cipherCheck: undefined })),
    ).toBeNull();
  });

  test('ancestorForceFlags reports forcing category', () => {
    const root = cat({ id: 'root', name: 'Root', forceChildrenAcl: true });
    const child = cat({ id: 'child', name: 'Child', parentCategoryId: 'root' });
    const map = new Map([
      [root.id, root],
      [child.id, child],
    ]);
    const r = ancestorForceFlags('child', map);
    expect(r.forceAcl).toBe(true);
    expect(r.forceAclBy?.id).toBe('root');
    expect(r.forceCipher).toBe(false);
  });
});
