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
  name: string;
  /** Ordering within the Space channel list (ascending). */
  position: number;
  /**
   * Blind-relay cipher verification challenge for per-channel E2EE. Schema-only
   * in the first pass (per-channel encrypted messaging is deferred).
   */
  cipherCheck?: CipherCheck;
}

export interface CreateSpaceChannelInput {
  spaceId: ObjectId;
  type: SpaceChannelType;
  name: string;
  position: number;
  cipherCheck?: CipherCheck;
}

export function toPublicSpaceChannel(doc: SpaceChannelDocument): PublicSpaceChannel {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    type: doc.type,
    name: doc.name,
    position: doc.position,
    ...(doc.cipherCheck ? { cipherCheck: toPublicCipherCheck(doc.cipherCheck) } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
