/**
 * Conversation folders repository
 * Data access layer for per-identity conversation folders.
 *
 * Each record is keyed by identityId and contains an ordered list
 * of conversation IDs that belong to the folder.
 */

import { ObjectId } from 'mongodb';
import { getCollection, Collections } from '../db';
import type { ConversationFolderDocument } from '../models/conversation-folder';

export interface CreateFolderParams {
  name: string;
  conversationIds: ObjectId[];
  iconType?: 'dynamic' | 'icon';
  iconName?: string;
  iconColor?: string;
}

export interface UpdateFolderParams {
  name?: string;
  iconType?: 'dynamic' | 'icon';
  iconName?: string;
  iconColor?: string | null;
  favorited?: boolean;
  sortOrder?: number;
}

export class ConversationFoldersRepository {
  private get collection() {
    return getCollection<ConversationFolderDocument>(
      Collections.CONVERSATION_FOLDERS,
    );
  }

  async findForIdentity(
    identityId: ObjectId,
  ): Promise<ConversationFolderDocument[]> {
    return this.collection
      .find({ identityId })
      .sort({ sortOrder: 1, createdAt: 1 })
      .toArray() as Promise<ConversationFolderDocument[]>;
  }

  async findById(
    identityId: ObjectId,
    folderId: ObjectId,
  ): Promise<ConversationFolderDocument | null> {
    return this.collection.findOne({
      _id: folderId,
      identityId,
    }) as Promise<ConversationFolderDocument | null>;
  }

  async create(
    identityId: ObjectId,
    params: CreateFolderParams,
  ): Promise<ConversationFolderDocument> {
    const now = new Date();
    const maxSort = await this.collection
      .find({ identityId })
      .sort({ sortOrder: -1 })
      .limit(1)
      .toArray();
    const nextSort = maxSort.length > 0 ? (maxSort[0] as ConversationFolderDocument).sortOrder + 1 : 0;

    const doc: Omit<ConversationFolderDocument, '_id'> = {
      identityId,
      name: params.name,
      iconType: params.iconType ?? 'dynamic',
      ...(params.iconName ? { iconName: params.iconName } : {}),
      ...(params.iconColor ? { iconColor: params.iconColor } : {}),
      conversationIds: params.conversationIds,
      favorited: false,
      sortOrder: nextSort,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(doc as ConversationFolderDocument);
    return { ...doc, _id: result.insertedId } as ConversationFolderDocument;
  }

  async update(
    identityId: ObjectId,
    folderId: ObjectId,
    params: UpdateFolderParams,
  ): Promise<ConversationFolderDocument | null> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    const $unset: Record<string, unknown> = {};

    if (params.name !== undefined) $set.name = params.name;
    if (params.iconType !== undefined) $set.iconType = params.iconType;
    if (params.iconName !== undefined) $set.iconName = params.iconName;
    if (params.iconColor === null) {
      $unset.iconColor = '';
    } else if (params.iconColor !== undefined) {
      $set.iconColor = params.iconColor;
    }
    if (params.favorited !== undefined) $set.favorited = params.favorited;
    if (params.sortOrder !== undefined) $set.sortOrder = params.sortOrder;

    // Reset icon fields when switching back to dynamic
    if (params.iconType === 'dynamic') {
      $unset.iconName = '';
      $unset.iconColor = '';
    }

    const update: Record<string, unknown> = { $set };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    return this.collection.findOneAndUpdate(
      { _id: folderId, identityId },
      update,
      { returnDocument: 'after' },
    ) as Promise<ConversationFolderDocument | null>;
  }

  async addConversation(
    identityId: ObjectId,
    folderId: ObjectId,
    conversationId: ObjectId,
  ): Promise<ConversationFolderDocument | null> {
    return this.collection.findOneAndUpdate(
      { _id: folderId, identityId },
      {
        $addToSet: { conversationIds: conversationId },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' },
    ) as Promise<ConversationFolderDocument | null>;
  }

  async removeConversation(
    identityId: ObjectId,
    folderId: ObjectId,
    conversationId: ObjectId,
  ): Promise<ConversationFolderDocument | null> {
    return this.collection.findOneAndUpdate(
      { _id: folderId, identityId },
      {
        $pull: { conversationIds: conversationId },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' },
    ) as Promise<ConversationFolderDocument | null>;
  }

  async delete(
    identityId: ObjectId,
    folderId: ObjectId,
  ): Promise<ConversationFolderDocument | null> {
    return this.collection.findOneAndDelete({
      _id: folderId,
      identityId,
    }) as Promise<ConversationFolderDocument | null>;
  }

  /**
   * Find which folder (if any) contains a given conversation for this identity.
   */
  async findByConversation(
    identityId: ObjectId,
    conversationId: ObjectId,
  ): Promise<ConversationFolderDocument | null> {
    return this.collection.findOne({
      identityId,
      conversationIds: conversationId,
    }) as Promise<ConversationFolderDocument | null>;
  }
}

let instance: ConversationFoldersRepository | null = null;

export function getConversationFoldersRepository(): ConversationFoldersRepository {
  if (!instance) instance = new ConversationFoldersRepository();
  return instance;
}
