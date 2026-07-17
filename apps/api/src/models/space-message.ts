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
  deleted: boolean;
  revisionCount: number;
  lastEditedAt?: Date;
  revisionHistory?: { content: string; replacedAt: Date }[];
  replyToMessageId?: ObjectId;
  mentionedIdentityIds?: ObjectId[];
  expiresAt?: Date;
}

export interface CreateSpaceMessageInput {
  spaceId: ObjectId;
  channelId: ObjectId;
  fromIdentityId: ObjectId;
  content?: string;
  ciphertext?: string;
  nonce?: string;
  clientMessageId: string;
  deleted?: boolean;
  revisionCount?: number;
  replyToMessageId?: ObjectId;
  mentionedIdentityIds?: ObjectId[];
  expiresAt?: Date;
}

export function toPublicSpaceMessage(doc: SpaceMessageDocument): PublicSpaceMessage {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    channelId: doc.channelId.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    ...(doc.content !== undefined ? { content: doc.content } : {}),
    clientMessageId: doc.clientMessageId,
    deleted: doc.deleted ?? false,
    revisionCount: doc.revisionCount ?? 0,
    ...(doc.lastEditedAt ? { lastEditedAt: doc.lastEditedAt.toISOString() } : {}),
    ...(!doc.deleted && doc.revisionHistory?.length
      ? { revisionHistory: doc.revisionHistory.map((r) => ({ content: r.content, replacedAt: r.replacedAt.toISOString() })) }
      : {}),
    ...(doc.replyToMessageId ? { replyToMessageId: doc.replyToMessageId.toHexString() } : {}),
    ...(doc.mentionedIdentityIds?.length
      ? { mentionedIdentityIds: doc.mentionedIdentityIds.map((id) => id.toHexString()) }
      : {}),
    ...(doc.expiresAt ? { expiresAt: doc.expiresAt.toISOString() } : {}),
    createdAt: doc.createdAt.toISOString(),
  };
}
