/**
 * Space message model
 * A message posted in a Space channel.
 *
 * First pass: plaintext `content` for non-E2EE channels. The optional
 * `ciphertext`/`nonce` fields reserve the shape for the deferred cipher-encrypted
 * messaging path (the server remains a blind relay and stores no keys).
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { PublicSpaceMessage } from '@adieuu/shared';

export interface SpaceMessageDocument extends BaseDocument {
  spaceId: ObjectId;
  channelId: ObjectId;
  fromIdentityId: ObjectId;
  /** Plaintext content when the channel/space is non-E2EE. */
  content?: string;
  /** Reserved for the deferred E2EE path (Cipher-encrypted payload). */
  ciphertext?: string;
  nonce?: string;
  /** Client-generated dedup id (unique per channel). */
  clientMessageId: string;
}

export interface CreateSpaceMessageInput {
  spaceId: ObjectId;
  channelId: ObjectId;
  fromIdentityId: ObjectId;
  content?: string;
  ciphertext?: string;
  nonce?: string;
  clientMessageId: string;
}

export function toPublicSpaceMessage(doc: SpaceMessageDocument): PublicSpaceMessage {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    channelId: doc.channelId.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    ...(doc.content !== undefined ? { content: doc.content } : {}),
    clientMessageId: doc.clientMessageId,
    createdAt: doc.createdAt.toISOString(),
  };
}
