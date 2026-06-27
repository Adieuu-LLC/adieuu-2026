/**
 * Group invite repository
 * Data access layer for group conversation invite operations.
 *
 * Handles the opt-in approval flow: when a member with
 * requireGroupApproval enabled is added to a group, an invite
 * is created instead of directly adding them.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  GroupInviteDocument,
  CreateGroupInviteInput,
  GroupInviteStatus,
} from '../models/group-invite';

export interface IGroupInviteRepository {
  findPendingForIdentity(
    identityId: ObjectId,
    limit: number,
    cursor?: ObjectId
  ): Promise<GroupInviteDocument[]>;
  findPendingForConversation(
    conversationId: ObjectId,
    identityId: ObjectId
  ): Promise<GroupInviteDocument | null>;
  findAllPendingForConversation(
    conversationId: ObjectId
  ): Promise<GroupInviteDocument[]>;
  updateStatus(
    inviteId: ObjectId,
    status: GroupInviteStatus
  ): Promise<GroupInviteDocument | null>;
  countPendingForIdentity(identityId: ObjectId): Promise<number>;
  deleteByConversation(conversationId: ObjectId): Promise<number>;
}

export class GroupInviteRepository
  extends BaseRepository<GroupInviteDocument>
  implements IGroupInviteRepository
{
  constructor() {
    super(Collections.GROUP_INVITES);
  }

  /**
   * Create a new group invite.
   */
  async createInvite(
    input: CreateGroupInviteInput
  ): Promise<GroupInviteDocument> {
    const doc = { ...input, status: 'pending' as GroupInviteStatus };
    return await this.create(doc as Omit<GroupInviteDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  /**
   * List pending invites for an identity (most recent first).
   */
  async findPendingForIdentity(
    identityId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<GroupInviteDocument[]> {
    const filter: Record<string, unknown> = {
      invitedIdentityId: identityId,
      status: 'pending',
    };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray() as GroupInviteDocument[];
  }

  /**
   * Find a pending invite for a specific identity and conversation.
   * Used to prevent duplicate invites.
   */
  async findPendingForConversation(
    conversationId: ObjectId,
    identityId: ObjectId
  ): Promise<GroupInviteDocument | null> {
    return await this.findOne({
      conversationId,
      invitedIdentityId: identityId,
      status: 'pending',
    });
  }

  /**
   * Find all pending invites for a conversation (for preview: show who else is invited).
   */
  async findAllPendingForConversation(
    conversationId: ObjectId
  ): Promise<GroupInviteDocument[]> {
    return await this.collection
      .find({ conversationId, status: 'pending' })
      .sort({ _id: -1 })
      .toArray() as GroupInviteDocument[];
  }

  /**
   * Update an invite's status (accept or decline).
   */
  async updateStatus(
    inviteId: ObjectId,
    status: GroupInviteStatus
  ): Promise<GroupInviteDocument | null> {
    return await this.updateById(inviteId, { status } as Partial<Omit<GroupInviteDocument, '_id' | 'createdAt'>>);
  }

  /**
   * Count pending invites for an identity (for badge/indicator).
   */
  async countPendingForIdentity(identityId: ObjectId): Promise<number> {
    return await this.count({
      invitedIdentityId: identityId,
      status: 'pending',
    });
  }

  /**
   * Find accepted invites for a conversation (for identifying former members who left).
   */
  async findAcceptedForConversation(
    conversationId: ObjectId
  ): Promise<GroupInviteDocument[]> {
    return await this.collection
      .find({ conversationId, status: 'accepted' })
      .toArray() as GroupInviteDocument[];
  }

  /**
   * Delete all invites for a conversation (for group cleanup/termination).
   */
  async deleteByConversation(conversationId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ conversationId });
    return result.deletedCount;
  }
}

let groupInviteRepository: GroupInviteRepository | null = null;

export function getGroupInviteRepository(): GroupInviteRepository {
  if (!groupInviteRepository) {
    groupInviteRepository = new GroupInviteRepository();
  }
  return groupInviteRepository;
}
