/**
 * Space message model
 * A message posted in a Space channel.
 *
 * Non-E2EE channels store plaintext in `content`. E2EE (Cipher-protected)
 * channels store `ciphertext`, `nonce`, and `cipherId` — the server acts as a
 * blind relay and never performs crypto.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { PublicSpaceMessage, SpaceMessageRevision } from '@adieuu/shared';

export interface SpaceMessageRevisionDoc {
  replacedAt: Date;
  content?: string;
  ciphertext?: string;
  nonce?: string;
  cipherId?: string;
}

export interface SpaceMessageDocument extends BaseDocument {
  spaceId: ObjectId;
  channelId: ObjectId;
  fromIdentityId: ObjectId;
  /** Plaintext content when the channel/space is non-E2EE. */
  content?: string;
  /** Base64-encoded ciphertext for E2EE messages. */
  ciphertext?: string;
  /** Base64-encoded nonce for E2EE messages. */
  nonce?: string;
  /** Public cipher fingerprint for E2EE messages. */
  cipherId?: string;
  /** Client-generated dedup id (unique per channel). */
  clientMessageId: string;
  deleted: boolean;
  revisionCount: number;
  lastEditedAt?: Date;
  revisionHistory?: SpaceMessageRevisionDoc[];
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
  cipherId?: string;
  clientMessageId: string;
  deleted?: boolean;
  revisionCount?: number;
  replyToMessageId?: ObjectId;
  mentionedIdentityIds?: ObjectId[];
  expiresAt?: Date;
}

function serializeRevision(r: SpaceMessageRevisionDoc): SpaceMessageRevision {
  return {
    replacedAt: r.replacedAt.toISOString(),
    ...(r.content !== undefined ? { content: r.content } : {}),
    ...(r.ciphertext ? { ciphertext: r.ciphertext, nonce: r.nonce, cipherId: r.cipherId } : {}),
  };
}

export function toPublicSpaceMessage(
  doc: SpaceMessageDocument,
  opts?: { hasReactions?: boolean },
): PublicSpaceMessage {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    channelId: doc.channelId.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    ...(doc.content !== undefined ? { content: doc.content } : {}),
    ...(doc.ciphertext ? { ciphertext: doc.ciphertext, nonce: doc.nonce, cipherId: doc.cipherId } : {}),
    clientMessageId: doc.clientMessageId,
    deleted: doc.deleted ?? false,
    revisionCount: doc.revisionCount ?? 0,
    ...(doc.lastEditedAt ? { lastEditedAt: doc.lastEditedAt.toISOString() } : {}),
    ...(!doc.deleted && doc.revisionHistory?.length
      ? { revisionHistory: doc.revisionHistory.map(serializeRevision) }
      : {}),
    ...(doc.replyToMessageId ? { replyToMessageId: doc.replyToMessageId.toHexString() } : {}),
    ...(doc.mentionedIdentityIds?.length
      ? { mentionedIdentityIds: doc.mentionedIdentityIds.map((id) => id.toHexString()) }
      : {}),
    ...(doc.expiresAt ? { expiresAt: doc.expiresAt.toISOString() } : {}),
    createdAt: doc.createdAt.toISOString(),
    ...(opts?.hasReactions ? { hasReactions: true } : {}),
  };
}
