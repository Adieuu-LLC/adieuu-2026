/**
 * Space channel model
 * A channel within a Space. Only text channels ship in the first pass; voice
 * and other channel types come later.
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
  /** Ordering within the Space channel list (ascending). */
  position: number;
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
}

export interface CreateSpaceChannelInput {
  spaceId: ObjectId;
  type: SpaceChannelType;
  name: string;
  position: number;
  allowedRoleIds: ObjectId[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  cipherCheck?: CipherCheck;
}

export interface UpdateSpaceChannelFields {
  name?: string;
  allowedRoleIds?: ObjectId[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  cipherCheck?: CipherCheck;
  /** When true, remove `cipherCheck` from the document. */
  clearCipherCheck?: boolean;
}

export function toPublicSpaceChannel(doc: SpaceChannelDocument): PublicSpaceChannel {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    type: doc.type,
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
    ...(doc.cipherCheck ? { cipherCheck: toPublicCipherCheck(doc.cipherCheck) } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
