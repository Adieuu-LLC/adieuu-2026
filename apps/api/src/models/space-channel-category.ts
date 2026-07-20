/**
 * Space channel category model
 * Sidebar grouping for channels within a Space, with optional role ACL.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CipherCheck, PublicSpaceChannelCategory } from '@adieuu/shared';
import { toPublicCipherCheck } from './cipher-check';

export interface SpaceChannelCategoryDocument extends BaseDocument {
  spaceId: ObjectId;
  /** Plaintext name; empty when the Space is e2ee. */
  name: string;
  /**
   * Order among interleaved siblings under `parentCategoryId` (or root).
   * Missing `parentCategoryId` on legacy docs means root.
   */
  position: number;
  /** Parent category; missing/null = Space root. */
  parentCategoryId?: ObjectId | null;
  /**
   * Roles allowed to see this category. Missing/empty on legacy docs is treated
   * as open to all members (Everyone). New categories always store at least one.
   */
  allowedRoleIds?: ObjectId[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  /** Default content Cipher for channels created in this category. */
  cipherCheck?: CipherCheck;
}

export interface CreateSpaceChannelCategoryInput {
  spaceId: ObjectId;
  name: string;
  position: number;
  allowedRoleIds: ObjectId[];
  parentCategoryId?: ObjectId | null;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  cipherCheck?: CipherCheck;
}

export interface UpdateSpaceChannelCategoryFields {
  name?: string;
  allowedRoleIds?: ObjectId[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  position?: number;
  parentCategoryId?: ObjectId | null;
  clearParentCategoryId?: boolean;
  cipherCheck?: CipherCheck;
  clearCipherCheck?: boolean;
}

export function toPublicSpaceChannelCategory(
  doc: SpaceChannelCategoryDocument,
): PublicSpaceChannelCategory {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    name: doc.name,
    position: doc.position,
    parentCategoryId: doc.parentCategoryId ? doc.parentCategoryId.toHexString() : null,
    allowedRoleIds: (doc.allowedRoleIds ?? []).map((id) => id.toHexString()),
    ...(doc.encryptedName
      ? {
          encryptedName: doc.encryptedName,
          nameNonce: doc.nameNonce,
          cipherId: doc.cipherId,
        }
      : {}),
    ...(doc.cipherCheck ? { cipherCheck: toPublicCipherCheck(doc.cipherCheck) } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
