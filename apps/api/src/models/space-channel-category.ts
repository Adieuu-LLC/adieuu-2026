/**
 * Space channel category model
 * Sidebar grouping for channels within a Space, with optional role ACL.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { PublicSpaceChannelCategory } from '@adieuu/shared';

export interface SpaceChannelCategoryDocument extends BaseDocument {
  spaceId: ObjectId;
  /** Plaintext name; empty when the Space is e2ee. */
  name: string;
  /** Ordering among categories in the Space sidebar (ascending). */
  position: number;
  /**
   * Roles allowed to see this category. Missing/empty on legacy docs is treated
   * as open to all members (Everyone). New categories always store at least one.
   */
  allowedRoleIds?: ObjectId[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
}

export interface CreateSpaceChannelCategoryInput {
  spaceId: ObjectId;
  name: string;
  position: number;
  allowedRoleIds: ObjectId[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
}

export interface UpdateSpaceChannelCategoryFields {
  name?: string;
  allowedRoleIds?: ObjectId[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  position?: number;
}

export function toPublicSpaceChannelCategory(
  doc: SpaceChannelCategoryDocument,
): PublicSpaceChannelCategory {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    name: doc.name,
    position: doc.position,
    allowedRoleIds: (doc.allowedRoleIds ?? []).map((id) => id.toHexString()),
    ...(doc.encryptedName
      ? {
          encryptedName: doc.encryptedName,
          nameNonce: doc.nameNonce,
          cipherId: doc.cipherId,
        }
      : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
