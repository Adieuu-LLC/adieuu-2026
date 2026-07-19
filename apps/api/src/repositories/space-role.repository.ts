/**
 * Space role repository
 * Data access for Space roles (permission flags + display settings).
 */

import { type Filter, ObjectId, type UpdateFilter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceRoleDocument, CreateSpaceRoleInput } from '../models/space-role';
import {
  DEFAULT_CUSTOM_ROLE_COLOR,
  normalizeSpacePermissions,
  type SpacePermission,
  type SpaceRoleSystemKey,
} from '@adieuu/shared';

export interface UpdateSpaceRoleFields {
  name?: string;
  permissions?: SpacePermission[];
  color?: string;
  displaySeparately?: boolean;
  mentionable?: boolean;
  isDefaultMember?: boolean;
  position?: number;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
}

export class SpaceRoleRepository extends BaseRepository<SpaceRoleDocument> {
  constructor() {
    super(Collections.SPACE_ROLES);
  }

  async createRole(input: CreateSpaceRoleInput): Promise<SpaceRoleDocument> {
    const doc = {
      ...input,
      permissions: normalizeSpacePermissions(input.permissions),
      color: input.color ?? DEFAULT_CUSTOM_ROLE_COLOR,
      displaySeparately: input.displaySeparately ?? false,
      mentionable: input.mentionable ?? false,
      position: input.position ?? 0,
      isDefaultMember: input.isDefaultMember ?? false,
      isSystem: input.isSystem ?? false,
    };
    return await this.create(doc as Omit<SpaceRoleDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  async findBySpace(spaceId: ObjectId): Promise<SpaceRoleDocument[]> {
    return (await this.collection
      .find({ spaceId } as Filter<SpaceRoleDocument>)
      .sort({ position: 1, _id: 1 })
      .toArray()) as SpaceRoleDocument[];
  }

  async findByIdInSpace(spaceId: ObjectId, roleId: ObjectId): Promise<SpaceRoleDocument | null> {
    return await this.findOne({
      _id: roleId,
      spaceId,
    } as Filter<SpaceRoleDocument>);
  }

  /** The role auto-assigned to new members. */
  async findDefaultMember(spaceId: ObjectId): Promise<SpaceRoleDocument | null> {
    return await this.findOne({
      spaceId,
      isDefaultMember: true,
    } as Filter<SpaceRoleDocument>);
  }

  async findBySystemKey(
    spaceId: ObjectId,
    systemKey: SpaceRoleSystemKey,
  ): Promise<SpaceRoleDocument | null> {
    return await this.findOne({
      spaceId,
      systemKey,
    } as Filter<SpaceRoleDocument>);
  }

  async updateRole(
    spaceId: ObjectId,
    roleId: ObjectId,
    fields: UpdateSpaceRoleFields,
  ): Promise<SpaceRoleDocument | null> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (fields.name !== undefined) $set.name = fields.name;
    if (fields.permissions !== undefined) {
      $set.permissions = normalizeSpacePermissions(fields.permissions);
    }
    if (fields.color !== undefined) $set.color = fields.color;
    if (fields.displaySeparately !== undefined) $set.displaySeparately = fields.displaySeparately;
    if (fields.mentionable !== undefined) $set.mentionable = fields.mentionable;
    if (fields.isDefaultMember !== undefined) $set.isDefaultMember = fields.isDefaultMember;
    if (fields.position !== undefined) $set.position = fields.position;
    if (fields.encryptedName !== undefined) $set.encryptedName = fields.encryptedName;
    if (fields.nameNonce !== undefined) $set.nameNonce = fields.nameNonce;
    if (fields.cipherId !== undefined) $set.cipherId = fields.cipherId;

    const result = await this.collection.findOneAndUpdate(
      { _id: roleId, spaceId } as Filter<SpaceRoleDocument>,
      { $set } as UpdateFilter<SpaceRoleDocument>,
      { returnDocument: 'after' },
    );
    return (result as SpaceRoleDocument | null) ?? null;
  }

  /** Clear `isDefaultMember` on every role in the Space except `exceptRoleId`. */
  async clearDefaultMemberExcept(spaceId: ObjectId, exceptRoleId: ObjectId): Promise<number> {
    const result = await this.collection.updateMany(
      {
        spaceId,
        isDefaultMember: true,
        _id: { $ne: exceptRoleId },
      } as Filter<SpaceRoleDocument>,
      { $set: { isDefaultMember: false, updatedAt: new Date() } } as UpdateFilter<SpaceRoleDocument>,
    );
    return result.modifiedCount;
  }

  async deleteRole(spaceId: ObjectId, roleId: ObjectId): Promise<boolean> {
    const result = await this.collection.deleteOne({
      _id: roleId,
      spaceId,
    } as Filter<SpaceRoleDocument>);
    return result.deletedCount === 1;
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
