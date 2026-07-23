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
  DEFAULT_MEMBER_ROLE_NAME,
  normalizeSpacePermissions,
  resolveSpaceRoleSystemKey,
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
    const roles = (await this.collection
      .find({ spaceId } as Filter<SpaceRoleDocument>)
      .sort({ position: 1, _id: 1 })
      .toArray()) as SpaceRoleDocument[];
    await this.repairLegacySystemRoles(roles);
    return roles;
  }

  async findByIdInSpace(spaceId: ObjectId, roleId: ObjectId): Promise<SpaceRoleDocument | null> {
    const role = await this.findOne({
      _id: roleId,
      spaceId,
    } as Filter<SpaceRoleDocument>);
    if (role) await this.repairLegacySystemRoles([role]);
    return role;
  }

  /** The role auto-assigned to new members. */
  async findDefaultMember(spaceId: ObjectId): Promise<SpaceRoleDocument | null> {
    const byFlag = await this.findOne({
      spaceId,
      isDefaultMember: true,
    } as Filter<SpaceRoleDocument>);
    if (byFlag) {
      await this.repairLegacySystemRoles([byFlag]);
      return byFlag;
    }
    // Legacy Spaces may have mis-set isDefaultMember; fall back to system Member.
    const roles = await this.findBySpace(spaceId);
    return roles.find((r) => resolveSpaceRoleSystemKey(r) === 'everyone') ?? null;
  }

  async findBySystemKey(
    spaceId: ObjectId,
    systemKey: SpaceRoleSystemKey,
  ): Promise<SpaceRoleDocument | null> {
    const keyed = await this.findOne({
      spaceId,
      systemKey,
    } as Filter<SpaceRoleDocument>);
    if (keyed) return keyed;

    // Legacy `member` key + pre-systemKey seeds: recognize via resolve helpers.
    if (systemKey === 'everyone') {
      const legacyKeyed = await this.findOne({
        spaceId,
        systemKey: 'member',
      } as Filter<SpaceRoleDocument>);
      if (legacyKeyed) {
        await this.repairLegacySystemRoles([legacyKeyed]);
        return legacyKeyed;
      }
    }

    const roles = (await this.collection
      .find({ spaceId, isSystem: true } as Filter<SpaceRoleDocument>)
      .toArray()) as SpaceRoleDocument[];
    await this.repairLegacySystemRoles(roles);
    return roles.find((r) => resolveSpaceRoleSystemKey(r) === systemKey) ?? null;
  }

  /**
   * Persist missing/canonical `systemKey` / `position` on older system role
   * docs (incl. `member` → `everyone`). Mutates `roles` in place.
   */
  private async repairLegacySystemRoles(roles: SpaceRoleDocument[]): Promise<void> {
    let everyoneRole: SpaceRoleDocument | null = null;
    let claimedDefault = false;

    for (const role of roles) {
      const systemKey = resolveSpaceRoleSystemKey(role);
      if (!systemKey) continue;
      if (systemKey === 'everyone') everyoneRole = role;

      const nextPosition =
        typeof role.position === 'number'
          ? role.position
          : systemKey === 'admin'
            ? 0
            : 1000;
      const needsKey = role.systemKey !== systemKey;
      const needsPosition = role.position !== nextPosition;
      const needsDefault =
        systemKey === 'everyone' && role.isDefaultMember !== true;
      const needsName =
        systemKey === 'everyone' &&
        !role.encryptedName &&
        role.name === 'Member';

      if (!needsKey && !needsPosition && !needsDefault && !needsName) continue;

      const $set: Record<string, unknown> = { updatedAt: new Date() };
      if (needsKey) {
        role.systemKey = systemKey;
        $set.systemKey = systemKey;
      }
      if (needsPosition) {
        role.position = nextPosition;
        $set.position = nextPosition;
      }
      if (needsDefault) {
        role.isDefaultMember = true;
        $set.isDefaultMember = true;
        claimedDefault = true;
      }
      if (needsName) {
        role.name = DEFAULT_MEMBER_ROLE_NAME;
        $set.name = DEFAULT_MEMBER_ROLE_NAME;
      }

      await this.collection.updateOne(
        { _id: role._id } as Filter<SpaceRoleDocument>,
        { $set } as UpdateFilter<SpaceRoleDocument>,
      );
    }

    // System Everyone is permanently the join default; clear stray flags only
    // when we just claimed it or multiple defaults are already present.
    const defaultCount = roles.filter((r) => r.isDefaultMember).length;
    if (everyoneRole && (claimedDefault || defaultCount > 1)) {
      for (const role of roles) {
        if (role._id.equals(everyoneRole._id) || !role.isDefaultMember) continue;
        role.isDefaultMember = false;
      }
      await this.collection.updateMany(
        {
          spaceId: everyoneRole.spaceId,
          isDefaultMember: true,
          _id: { $ne: everyoneRole._id },
        } as Filter<SpaceRoleDocument>,
        { $set: { isDefaultMember: false, updatedAt: new Date() } } as UpdateFilter<SpaceRoleDocument>,
      );
    }
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
