/**
 * Space invite repository
 * Data access for Space invites. Mirrors the group-conversation invite flow.
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceInviteDocument, CreateSpaceInviteInput } from '../models/space-invite';
import type { SpaceInviteStatus } from '@adieuu/shared';

export class SpaceInviteRepository extends BaseRepository<SpaceInviteDocument> {
  constructor() {
    super(Collections.SPACE_INVITES);
  }

  async createInvite(input: CreateSpaceInviteInput): Promise<SpaceInviteDocument> {
    const doc = { ...input, status: 'pending' as SpaceInviteStatus };
    return await this.create(doc as Omit<SpaceInviteDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  /** Pending invites for an identity (inbox), most recent first. */
  async findPendingForIdentity(
    identityId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<SpaceInviteDocument[]> {
    const filter: Record<string, unknown> = {
      invitedIdentityId: identityId,
      status: 'pending',
    };
    if (cursor) {
      filter._id = { $lt: cursor };
    }
    return (await this.collection
      .find(filter as Filter<SpaceInviteDocument>)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray()) as SpaceInviteDocument[];
  }

  /** Existing pending invite for a (space, identity) pair — prevents duplicates. */
  async findPendingForSpace(
    spaceId: ObjectId,
    identityId: ObjectId
  ): Promise<SpaceInviteDocument | null> {
    return await this.findOne({
      spaceId,
      invitedIdentityId: identityId,
      status: 'pending',
    } as Filter<SpaceInviteDocument>);
  }

  async findAllPendingForSpace(spaceId: ObjectId): Promise<SpaceInviteDocument[]> {
    return (await this.collection
      .find({ spaceId, status: 'pending' } as Filter<SpaceInviteDocument>)
      .sort({ _id: -1 })
      .toArray()) as SpaceInviteDocument[];
  }

  async updateStatus(
    inviteId: ObjectId,
    status: SpaceInviteStatus
  ): Promise<SpaceInviteDocument | null> {
    return await this.updateById(inviteId, { status } as Partial<
      Omit<SpaceInviteDocument, '_id' | 'createdAt'>
    >);
  }

  async countPendingForIdentity(identityId: ObjectId): Promise<number> {
    return await this.count({
      invitedIdentityId: identityId,
      status: 'pending',
    } as Filter<SpaceInviteDocument>);
  }

  async deleteBySpace(spaceId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ spaceId } as Filter<SpaceInviteDocument>);
    return result.deletedCount;
  }
}

let spaceInviteRepository: SpaceInviteRepository | null = null;

export function getSpaceInviteRepository(): SpaceInviteRepository {
  if (!spaceInviteRepository) {
    spaceInviteRepository = new SpaceInviteRepository();
  }
  return spaceInviteRepository;
}
