/**
 * Space message model
 * A message posted in a Space channel.
 *
 * Non-E2EE channels store plaintext in `content` and optional cleartext
 * `attachmentMediaIds` (`space_media`). E2EE (Cipher-protected) channels store
 * `ciphertext`, `nonce`, `cipherId`, and optional `e2eMediaIds` — the server
 * acts as a blind relay and never performs crypto.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { PublicSpaceMessage, SpaceMessageAttachment, SpaceMessageRevision } from '@adieuu/shared';

export interface SpaceMessageRevisionDoc {
  replacedAt: Date;
  content?: string;
  ciphertext?: string;
  nonce?: string;
  cipherId?: string;
}

export interface SpaceMessageAttachmentDoc {
  mediaId: string;
  cdnUrl: string;
  contentType: string;
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
  /** Cleartext `space_media` ids (plaintext channels). */
  attachmentMediaIds?: string[];
  /** Resolved cleartext attachment metadata (CDN URLs). */
  attachments?: SpaceMessageAttachmentDoc[];
  /** Server-visible E2E media ids (encrypted channels). */
  e2eMediaIds?: string[];
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
  attachmentMediaIds?: string[];
  attachments?: SpaceMessageAttachmentDoc[];
  e2eMediaIds?: string[];
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

function serializeAttachment(a: SpaceMessageAttachmentDoc): SpaceMessageAttachment {
  return {
    mediaId: a.mediaId,
    cdnUrl: a.cdnUrl,
    contentType: a.contentType,
  };
}

export function toPublicSpaceMessage(
  doc: SpaceMessageDocument,
  opts?: { hasReactions?: boolean },
): PublicSpaceMessage {
  const deleted = doc.deleted ?? false;
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    channelId: doc.channelId.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    ...(!deleted && doc.content !== undefined ? { content: doc.content } : {}),
    ...(!deleted && doc.ciphertext
      ? { ciphertext: doc.ciphertext, nonce: doc.nonce, cipherId: doc.cipherId }
      : {}),
    ...(!deleted && doc.attachmentMediaIds?.length
      ? { attachmentMediaIds: doc.attachmentMediaIds }
      : {}),
    ...(!deleted && doc.attachments?.length
      ? { attachments: doc.attachments.map(serializeAttachment) }
      : {}),
    ...(!deleted && doc.e2eMediaIds?.length ? { e2eMediaIds: doc.e2eMediaIds } : {}),
    clientMessageId: doc.clientMessageId,
    deleted,
    revisionCount: doc.revisionCount ?? 0,
    ...(doc.lastEditedAt ? { lastEditedAt: doc.lastEditedAt.toISOString() } : {}),
    ...(!deleted && doc.revisionHistory?.length
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
