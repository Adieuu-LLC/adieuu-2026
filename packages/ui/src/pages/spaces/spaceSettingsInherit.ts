/**
 * Client helpers for Space channel/category inherit + force settings.
 */

import type {
  CipherCheck,
  PublicSpace,
  PublicSpaceChannelCategory,
  PublicSpaceRole,
} from '@adieuu/shared';
import { findEveryoneRole } from './channelRoleHierarchy';

export interface AncestorForceInfo {
  forceAcl: boolean;
  forceCipher: boolean;
  forceAclBy: PublicSpaceChannelCategory | null;
  forceCipherBy: PublicSpaceChannelCategory | null;
}

export function ancestorForceFlags(
  startCategoryId: string | null | undefined,
  categoriesById: Map<string, PublicSpaceChannelCategory>,
): AncestorForceInfo {
  let forceAcl = false;
  let forceCipher = false;
  let forceAclBy: PublicSpaceChannelCategory | null = null;
  let forceCipherBy: PublicSpaceChannelCategory | null = null;

  let walk = startCategoryId ?? null;
  const seen = new Set<string>();
  while (walk && !seen.has(walk)) {
    seen.add(walk);
    const cat = categoriesById.get(walk);
    if (!cat) break;
    if (!forceAcl && cat.forceChildrenAcl) {
      forceAcl = true;
      forceAclBy = cat;
    }
    if (!forceCipher && cat.forceChildrenCipher) {
      forceCipher = true;
      forceCipherBy = cat;
    }
    if (forceAcl && forceCipher) break;
    walk = cat.parentCategoryId;
  }

  return { forceAcl, forceCipher, forceAclBy, forceCipherBy };
}

export function resolveParentRoleIds(
  parentCategory: PublicSpaceChannelCategory | null | undefined,
  roles: readonly PublicSpaceRole[],
): string[] {
  if (parentCategory?.allowedRoleIds?.length) {
    return [...parentCategory.allowedRoleIds];
  }
  const everyone = findEveryoneRole(roles);
  return everyone ? [everyone.id] : [];
}

export function resolveParentCipherCheck(
  space: Pick<PublicSpace, 'e2ee' | 'cipherCheck'>,
  parentCategory: PublicSpaceChannelCategory | null | undefined,
): CipherCheck | null {
  if (parentCategory) {
    return parentCategory.cipherCheck ?? null;
  }
  if (space.e2ee && space.cipherCheck) {
    return space.cipherCheck;
  }
  return null;
}
