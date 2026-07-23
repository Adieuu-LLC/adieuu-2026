/**
 * Space message repository
 * Data access for messages posted in Space channels. Supports both plaintext
 * (content) and E2EE (ciphertext/nonce/cipherId) messages.
 */

import { type Filter, type UpdateFilter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceMessageDocument, CreateSpaceMessageInput, SpaceMessageRevisionDoc } from '../models/space-message';

export type EditMessageBody =
  | {
      content: string;
      ciphertext?: undefined;
      nonce?: undefined;
      cipherId?: undefined;
      attachmentMediaIds?: string[];
      attachments?: import('../models/space-message').SpaceMessageAttachmentDoc[];
      e2eMediaIds?: undefined;
    }
  | {
      content?: undefined;
      ciphertext: string;
      nonce: string;
      cipherId: string;
      attachmentMediaIds?: undefined;
      attachments?: undefined;
      e2eMediaIds?: string[];
    };

export type EditMessageResult =
  | { conflict: false; message: SpaceMessageDocument }
  | { conflict: true; current: SpaceMessageDocument | null };

export class SpaceMessageRepository extends BaseRepository<SpaceMessageDocument> {
  constructor() {
    super(Collections.SPACE_MESSAGES);
  }

  async createMessage(input: CreateSpaceMessageInput): Promise<SpaceMessageDocument> {
    const doc = {
      ...input,
      deleted: input.deleted ?? false,
      revisionCount: input.revisionCount ?? 0,
    };
    return await this.create(
      doc as Omit<SpaceMessageDocument, '_id' | 'createdAt' | 'updatedAt'>
    );
  }

  /**
   * Messages for a channel, newest first, cursor-paginated. With a cursor,
   * `asc` returns messages older than the cursor; the default returns newer.
   */
  async findByChannel(
    channelId: ObjectId,
    limit = 50,
    cursor?: ObjectId,
    direction?: 'asc' | 'desc'
  ): Promise<SpaceMessageDocument[]> {
    const filter: Filter<SpaceMessageDocument> = { channelId } as Filter<SpaceMessageDocument>;
    if (cursor) {
      (filter as Record<string, unknown>)._id =
        direction === 'asc' ? { $lt: cursor } : { $gt: cursor };
    }
    return (await this.collection
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray()) as SpaceMessageDocument[];
  }

  /**
   * Messages strictly newer than `anchor` in a channel, oldest-first, capped at
   * `limit`. Used for newer-page (toward-present) pagination so results splice
   * contiguously onto the buffer head. Mirrors the `_id`-cursor / `createdAt`
   * sort convention used by {@link findByChannel}.
   */
  async findAfter(
    channelId: ObjectId,
    anchor: ObjectId,
    limit: number,
  ): Promise<SpaceMessageDocument[]> {
    return (await this.collection
      .find({ channelId, _id: { $gt: anchor } } as Filter<SpaceMessageDocument>)
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .toArray()) as SpaceMessageDocument[];
  }

  /** True when at least one message newer than `anchor` exists in the channel. */
  async hasMessageNewerThan(channelId: ObjectId, anchor: ObjectId): Promise<boolean> {
    const doc = await this.collection.findOne(
      { channelId, _id: { $gt: anchor } } as Filter<SpaceMessageDocument>,
      { projection: { _id: 1 } },
    );
    return doc != null;
  }

  async findByIds(ids: ObjectId[]): Promise<SpaceMessageDocument[]> {
    if (!ids.length) return [];
    return await this.collection
      .find({ _id: { $in: ids } } as Filter<SpaceMessageDocument>)
      .toArray() as SpaceMessageDocument[];
  }

  async findByIdInChannel(
    channelId: ObjectId,
    messageId: ObjectId,
  ): Promise<SpaceMessageDocument | null> {
    return await this.findOne({ _id: messageId, channelId } as Filter<SpaceMessageDocument>);
  }

  /**
   * Fetch a window of messages around a target message in a channel.
   * Returns `before` messages older than the target, the target itself, and
   * `after` messages newer than the target.
   */
  async findAround(
    channelId: ObjectId,
    targetId: ObjectId,
    before: number,
    after: number,
  ): Promise<SpaceMessageDocument[]> {
    const olderFilter: Filter<SpaceMessageDocument> = {
      channelId,
      _id: { $lt: targetId },
    } as Filter<SpaceMessageDocument>;
    const older = await this.collection
      .find(olderFilter)
      .sort({ _id: -1 })
      .limit(before)
      .toArray() as SpaceMessageDocument[];

    const target = await this.findOne({ _id: targetId, channelId } as Filter<SpaceMessageDocument>);

    const newerFilter: Filter<SpaceMessageDocument> = {
      channelId,
      _id: { $gt: targetId },
    } as Filter<SpaceMessageDocument>;
    const newer = await this.collection
      .find(newerFilter)
      .sort({ _id: 1 })
      .limit(after)
      .toArray() as SpaceMessageDocument[];

    const result = [...older.reverse()];
    if (target) result.push(target);
    result.push(...newer);
    return result;
  }

  async editMessage(
    messageId: ObjectId,
    body: EditMessageBody,
  ): Promise<EditMessageResult | null> {
    const existing = await this.findOne({ _id: messageId } as Filter<SpaceMessageDocument>);
    if (!existing) return null;

    const now = new Date();
    const prevRevision: SpaceMessageRevisionDoc = { replacedAt: now };
    if (existing.ciphertext) {
      prevRevision.ciphertext = existing.ciphertext;
      prevRevision.nonce = existing.nonce;
      prevRevision.cipherId = existing.cipherId;
    } else {
      prevRevision.content = existing.content;
    }

    const $set: Record<string, unknown> = { lastEditedAt: now, updatedAt: now };
    const $unset: Record<string, string> = {};
    if (body.ciphertext) {
      $set.ciphertext = body.ciphertext;
      $set.nonce = body.nonce;
      $set.cipherId = body.cipherId;
      $unset.content = '';
      $unset.attachmentMediaIds = '';
      $unset.attachments = '';
      if (body.e2eMediaIds !== undefined) {
        if (body.e2eMediaIds.length) $set.e2eMediaIds = body.e2eMediaIds;
        else $unset.e2eMediaIds = '';
      }
    } else {
      $set.content = body.content;
      $unset.ciphertext = '';
      $unset.nonce = '';
      $unset.cipherId = '';
      $unset.e2eMediaIds = '';
      if (body.attachmentMediaIds !== undefined) {
        if (body.attachmentMediaIds.length) {
          $set.attachmentMediaIds = body.attachmentMediaIds;
          $set.attachments = body.attachments ?? [];
        } else {
          $unset.attachmentMediaIds = '';
          $unset.attachments = '';
        }
      }
    }

    const result = await this.collection.findOneAndUpdate(
      {
        _id: messageId,
        deleted: false,
        revisionCount: existing.revisionCount,
      } as Filter<SpaceMessageDocument>,
      {
        $set,
        $inc: { revisionCount: 1 },
        $push: { revisionHistory: prevRevision },
        ...(Object.keys($unset).length ? { $unset } : {}),
      } as UpdateFilter<SpaceMessageDocument>,
      { returnDocument: 'after' },
    );
    if (!result) {
      const current = await this.findOne({ _id: messageId } as Filter<SpaceMessageDocument>);
      return { conflict: true, current: current ?? null };
    }
    return { conflict: false, message: result as SpaceMessageDocument };
  }

  async softDelete(messageId: ObjectId): Promise<SpaceMessageDocument | null> {
    const now = new Date();
    const result = await this.collection.findOneAndUpdate(
      { _id: messageId } as Filter<SpaceMessageDocument>,
      {
        $set: { deleted: true, content: '', updatedAt: now },
        $unset: {
          revisionHistory: '',
          ciphertext: '',
          nonce: '',
          cipherId: '',
          attachmentMediaIds: '',
          attachments: '',
          e2eMediaIds: '',
        },
      } as UpdateFilter<SpaceMessageDocument>,
      { returnDocument: 'after' },
    );
    return result as SpaceMessageDocument | null;
  }

  /**
   * Locate a Space message that references an E2E media id (for download ACL).
   * Returns space/channel ids when the message is not deleted.
   */
  async findChannelContextByE2EMediaId(
    e2eMediaId: string,
  ): Promise<{ spaceId: ObjectId; channelId: ObjectId } | null> {
    const doc = await this.collection.findOne(
      { e2eMediaIds: e2eMediaId, deleted: { $ne: true } } as Filter<SpaceMessageDocument>,
      { projection: { spaceId: 1, channelId: 1 } },
    );
    if (!doc) return null;
    return { spaceId: doc.spaceId, channelId: doc.channelId };
  }

  async findByClientMessageId(
    channelId: ObjectId,
    clientMessageId: string
  ): Promise<SpaceMessageDocument | null> {
    return await this.findOne({ channelId, clientMessageId } as Filter<SpaceMessageDocument>);
  }

  async countByChannel(channelId: ObjectId): Promise<number> {
    return await this.count({ channelId } as Filter<SpaceMessageDocument>);
  }

  async deleteByChannel(channelId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({
      channelId,
    } as Filter<SpaceMessageDocument>);
    return result.deletedCount;
  }

  async deleteBySpace(spaceId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ spaceId } as Filter<SpaceMessageDocument>);
    return result.deletedCount;
  }
}

let spaceMessageRepository: SpaceMessageRepository | null = null;

export function getSpaceMessageRepository(): SpaceMessageRepository {
  if (!spaceMessageRepository) {
    spaceMessageRepository = new SpaceMessageRepository();
  }
  return spaceMessageRepository;
}
