/**
 * Space channel model
 * A channel within a Space. Text channels are chat-only; voice channels are
 * chat plus optional A/V presence.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CipherCheck, PublicSpaceChannel, SpaceChannelType } from '@adieuu/shared';
import { toPublicCipherCheck } from './cipher-check';

export interface SpaceChannelDocument extends BaseDocument {
  spaceId: ObjectId;
  type: SpaceChannelType;
  /** Plaintext name; empty when the Space is e2ee. */
  name: string;
  /** Ordering within the channel's category (or uncategorized bucket). */
  position: number;
  /** Parent category; missing/null means uncategorized. */
  categoryId?: ObjectId | null;
  /**
   * Roles allowed to see this channel. Missing/empty on legacy docs is treated
   * as open to all members (Everyone). New channels always store at least one.
   */
  allowedRoleIds?: ObjectId[];
  /** Cipher-encrypted name when the Space is e2ee. */
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  /** Blind-relay cipher verification challenge for channel content E2EE. */
  cipherCheck?: CipherCheck;
  /** Keep ACL in sync with parent; missing on legacy docs = false. */
  inheritAllowedRoleIds?: boolean;
  /** Keep cipherCheck in sync with parent; missing on legacy docs = false. */
  inheritCipherCheck?: boolean;
}

export interface CreateSpaceChannelInput {
  spaceId: ObjectId;
  type: SpaceChannelType;
  name: string;
  position: number;
  allowedRoleIds: ObjectId[];
  categoryId?: ObjectId | null;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  cipherCheck?: CipherCheck;
  inheritAllowedRoleIds?: boolean;
  inheritCipherCheck?: boolean;
}

export interface UpdateSpaceChannelFields {
  name?: string;
  allowedRoleIds?: ObjectId[];
  categoryId?: ObjectId | null;
  /** When true, remove `categoryId` from the document (uncategorize). */
  clearCategoryId?: boolean;
  position?: number;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  cipherCheck?: CipherCheck;
  /** When true, remove `cipherCheck` from the document. */
  clearCipherCheck?: boolean;
  inheritAllowedRoleIds?: boolean;
  inheritCipherCheck?: boolean;
}

export function toPublicSpaceChannel(doc: SpaceChannelDocument): PublicSpaceChannel {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    type: doc.type,
    name: doc.name,
    position: doc.position,
    categoryId: doc.categoryId ? doc.categoryId.toHexString() : null,
    allowedRoleIds: (doc.allowedRoleIds ?? []).map((id) => id.toHexString()),
    ...(doc.encryptedName
      ? {
          encryptedName: doc.encryptedName,
          nameNonce: doc.nameNonce,
          cipherId: doc.cipherId,
        }
      : {}),
    ...(doc.cipherCheck ? { cipherCheck: toPublicCipherCheck(doc.cipherCheck) } : {}),
    inheritAllowedRoleIds: !!doc.inheritAllowedRoleIds,
    inheritCipherCheck: !!doc.inheritCipherCheck,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
