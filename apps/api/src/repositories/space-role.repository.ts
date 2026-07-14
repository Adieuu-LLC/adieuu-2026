/**
 * Space role repository
 * Data access for Space roles (permission flags).
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceRoleDocument, CreateSpaceRoleInput } from '../models/space-role';

export class SpaceRoleRepository extends BaseRepository<SpaceRoleDocument> {
  constructor() {
    super(Collections.SPACE_ROLES);
  }

  async createRole(input: CreateSpaceRoleInput): Promise<SpaceRoleDocument> {
    const doc = {
      ...input,
      isDefaultMember: input.isDefaultMember ?? false,
      isSystem: input.isSystem ?? false,
    };
    return await this.create(doc as Omit<SpaceRoleDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  async findBySpace(spaceId: ObjectId): Promise<SpaceRoleDocument[]> {
    return (await this.collection
      .find({ spaceId } as Filter<SpaceRoleDocument>)
      .sort({ _id: 1 })
      .toArray()) as SpaceRoleDocument[];
  }

  /** The role auto-assigned to new members. */
  async findDefaultMember(spaceId: ObjectId): Promise<SpaceRoleDocument | null> {
    return await this.findOne({
      spaceId,
      isDefaultMember: true,
    } as Filter<SpaceRoleDocument>);
  }

  async deleteBySpace(spaceId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ spaceId } as Filter<SpaceRoleDocument>);
    return result.deletedCount;
  }
}

let spaceRoleRepository: SpaceRoleRepository | null = null;

export function getSpaceRoleRepository(): SpaceRoleRepository {
  if (!spaceRoleRepository) {
    spaceRoleRepository = new SpaceRoleRepository();
  }
  return spaceRoleRepository;
}
