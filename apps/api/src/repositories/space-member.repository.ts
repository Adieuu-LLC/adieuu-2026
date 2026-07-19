/**
 * Space member repository
 * Data access for Space membership. One document per (space, identity).
 */

import { type Filter, ObjectId, type UpdateFilter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceMemberDocument, CreateSpaceMemberInput } from '../models/space-member';
import type { SpaceMemberStatus } from '@adieuu/shared';

export class SpaceMemberRepository extends BaseRepository<SpaceMemberDocument> {
  constructor() {
    super(Collections.SPACE_MEMBERS);
  }

  async createMember(input: CreateSpaceMemberInput): Promise<SpaceMemberDocument> {
    const doc = {
      ...input,
      status: input.status ?? ('active' as SpaceMemberStatus),
      joinedAt: input.joinedAt ?? new Date(),
    };
    return await this.create(doc as Omit<SpaceMemberDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  async findMember(
    spaceId: ObjectId,
    identityId: ObjectId
  ): Promise<SpaceMemberDocument | null> {
    return await this.findOne({ spaceId, identityId } as Filter<SpaceMemberDocument>);
  }

  /** Members of a Space, oldest first, cursor-paginated by _id. */
  async listBySpace(
    spaceId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<SpaceMemberDocument[]> {
    const filter: Record<string, unknown> = { spaceId };
    if (cursor) {
      filter._id = { $gt: cursor };
    }
    return (await this.collection
      .find(filter as Filter<SpaceMemberDocument>)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray()) as SpaceMemberDocument[];
  }

  /** Most recently joined members of a Space (by joinedAt, then _id). */
  async listRecentBySpace(
    spaceId: ObjectId,
    limit = 10,
  ): Promise<SpaceMemberDocument[]> {
    return (await this.collection
      .find({ spaceId } as Filter<SpaceMemberDocument>)
      .sort({ joinedAt: -1, _id: -1 })
      .limit(limit)
      .toArray()) as SpaceMemberDocument[];
  }

  /** Spaces an identity belongs to, most recently joined first. */
  async findForIdentity(
    identityId: ObjectId,
    limit = 100,
    cursor?: ObjectId
  ): Promise<SpaceMemberDocument[]> {
    const filter: Record<string, unknown> = { identityId };
    if (cursor) {
      filter._id = { $lt: cursor };
    }
    return (await this.collection
      .find(filter as Filter<SpaceMemberDocument>)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray()) as SpaceMemberDocument[];
  }

  async removeMember(spaceId: ObjectId, identityId: ObjectId): Promise<boolean> {
    const result = await this.collection.deleteOne({
      spaceId,
      identityId,
    } as Filter<SpaceMemberDocument>);
    return result.deletedCount === 1;
  }

  async addRole(spaceId: ObjectId, identityId: ObjectId, roleId: ObjectId): Promise<boolean> {
    const result = await this.collection.updateOne(
      { spaceId, identityId } as Filter<SpaceMemberDocument>,
      { $addToSet: { roleIds: roleId }, $set: { updatedAt: new Date() } }
    );
    return result.modifiedCount === 1;
  }

  async removeRole(spaceId: ObjectId, identityId: ObjectId, roleId: ObjectId): Promise<boolean> {
    const result = await this.collection.updateOne(
      { spaceId, identityId } as Filter<SpaceMemberDocument>,
      { $pull: { roleIds: roleId }, $set: { updatedAt: new Date() } } as UpdateFilter<SpaceMemberDocument>
    );
    return result.modifiedCount === 1;
  }

  async setRoles(
    spaceId: ObjectId,
    identityId: ObjectId,
    roleIds: ObjectId[],
  ): Promise<SpaceMemberDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { spaceId, identityId } as Filter<SpaceMemberDocument>,
      {
        $set: { roleIds, updatedAt: new Date() },
      } as UpdateFilter<SpaceMemberDocument>,
      { returnDocument: 'after' },
    );
    return (result as SpaceMemberDocument | null) ?? null;
  }

  /** Count active members that hold a given role. */
  async countWithRole(spaceId: ObjectId, roleId: ObjectId): Promise<number> {
    return await this.count({
      spaceId,
      roleIds: roleId,
      status: 'active',
    } as Filter<SpaceMemberDocument>);
  }

  /** Members holding a given role, oldest first, cursor-paginated by _id. */
  async listByRole(
    spaceId: ObjectId,
    roleId: ObjectId,
    limit = 50,
    cursor?: ObjectId,
  ): Promise<SpaceMemberDocument[]> {
    const filter: Record<string, unknown> = {
      spaceId,
      roleIds: roleId,
      status: 'active',
    };
    if (cursor) {
      filter._id = { $gt: cursor };
    }
    return (await this.collection
      .find(filter as Filter<SpaceMemberDocument>)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray()) as SpaceMemberDocument[];
  }

  async countBySpace(spaceId: ObjectId): Promise<number> {
    return await this.count({ spaceId } as Filter<SpaceMemberDocument>);
  }

  async deleteBySpace(spaceId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ spaceId } as Filter<SpaceMemberDocument>);
    return result.deletedCount;
  }
}

let spaceMemberRepository: SpaceMemberRepository | null = null;

export function getSpaceMemberRepository(): SpaceMemberRepository {
  if (!spaceMemberRepository) {
    spaceMemberRepository = new SpaceMemberRepository();
  }
  return spaceMemberRepository;
}
