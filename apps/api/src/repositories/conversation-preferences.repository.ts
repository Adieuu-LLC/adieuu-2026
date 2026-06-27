/**
 * Conversation preferences repository
 * Data access layer for per-identity conversation preferences (archive, favorites).
 *
 * Each record is keyed by (identityId, conversationId) with a unique compound index.
 */

import { ObjectId } from 'mongodb';
import { getCollection, Collections } from '../db';
import type { ConversationPreferencesDocument } from '../models/conversation-preferences';

export interface ConversationPreferencesPatch {
  archived?: boolean;
  keepArchived?: boolean;
  favorited?: boolean;
  encryptedReadState?: string;
}

export class ConversationPreferencesRepository {
  private get collection() {
    return getCollection<ConversationPreferencesDocument>(
      Collections.CONVERSATION_PREFERENCES,
    );
  }

  async findForIdentity(
    identityId: ObjectId,
  ): Promise<ConversationPreferencesDocument[]> {
    return this.collection
      .find({ identityId })
      .toArray() as Promise<ConversationPreferencesDocument[]>;
  }

  async findOne(
    identityId: ObjectId,
    conversationId: ObjectId,
  ): Promise<ConversationPreferencesDocument | null> {
    return this.collection.findOne({
      identityId,
      conversationId,
    }) as Promise<ConversationPreferencesDocument | null>;
  }

  async upsert(
    identityId: ObjectId,
    conversationId: ObjectId,
    patch: ConversationPreferencesPatch,
  ): Promise<ConversationPreferencesDocument> {
    const now = new Date();

    const $set: Record<string, unknown> = { updatedAt: now };
    if (patch.archived !== undefined) $set.archived = patch.archived;
    if (patch.keepArchived !== undefined) $set.keepArchived = patch.keepArchived;
    if (patch.favorited !== undefined) $set.favorited = patch.favorited;
    if (patch.encryptedReadState !== undefined) $set.encryptedReadState = patch.encryptedReadState;

    const result = await this.collection.findOneAndUpdate(
      { identityId, conversationId },
      {
        $set,
        $setOnInsert: {
          identityId,
          conversationId,
          createdAt: now,
          ...(patch.archived === undefined ? { archived: false } : {}),
          ...(patch.keepArchived === undefined ? { keepArchived: false } : {}),
          ...(patch.favorited === undefined ? { favorited: false } : {}),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return result as ConversationPreferencesDocument;
  }

  async deleteForConversation(
    identityId: ObjectId,
    conversationId: ObjectId,
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      identityId,
      conversationId,
    });
    return result.deletedCount > 0;
  }
}

let instance: ConversationPreferencesRepository | null = null;

export function getConversationPreferencesRepository(): ConversationPreferencesRepository {
  if (!instance) instance = new ConversationPreferencesRepository();
  return instance;
}
