/**
 * Space channel list + create/update (role ACL + `manageChannels`).
 *
 * @module services/space/channel-crud
 */

import { ObjectId } from 'mongodb';
import type { CipherCheck } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceChannel } from '../../models/space-channel';
import type { SpaceDocument } from '../../models/space';
import type { SpaceRoleDocument } from '../../models/space-role';
import { toPublicCipherCheck } from '../../models/cipher-check';
import {
  resolveMemberPermissions,
  memberHasPermission,
  type SpaceMemberPermissions,
} from './permissions';
import {
  actorTopRolePosition,
  canViewSpaceChannel,
  findEveryoneRole,
  rolesAtOrBelowHierarchy,
} from './channel-access';
import { canReadSpace } from './access';
import { publishSpaceEvent } from './redis-events';
import type { SpaceChannelResult, SpaceChannelsResult } from './types';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

export interface CreateSpaceChannelParams {
  name?: string;
  type: 'text';
  allowedRoleIds?: readonly string[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  encrypt?: boolean;
  cipherCheck?: CipherCheck;
}

export interface UpdateSpaceChannelParams {
  name?: string;
  allowedRoleIds?: readonly string[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  encrypt?: boolean;
  cipherCheck?: CipherCheck;
}

/**
 * Resolve whether a new/updated channel should store a `cipherCheck`.
 * Defaults to inheriting the Space Cipher when the Space is e2ee.
 */
export function resolveChannelCipherCheck(
  space: Pick<SpaceDocument, 'e2ee' | 'cipherCheck'>,
  params: { encrypt?: boolean; cipherCheck?: CipherCheck },
): CipherCheck | undefined {
  if (params.encrypt === false) return undefined;
  if (params.cipherCheck) return toPublicCipherCheck(params.cipherCheck);
  const inheritByDefault = params.encrypt === true || (params.encrypt === undefined && !!space.e2ee);
  if (inheritByDefault && space.cipherCheck) {
    return toPublicCipherCheck(space.cipherCheck);
  }
  return undefined;
}

async function requireChannelMember(
  spaceId: ObjectId,
  actingId: ObjectId,
): Promise<
  | { ok: true; space: SpaceDocument; perms: SpaceMemberPermissions }
  | { ok: false; result: SpaceChannelResult }
> {
  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return {
      ok: false,
      result: { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' },
    };
  }

  const perms = await resolveMemberPermissions(spaceId, actingId);
  if (!perms.isMember) {
    return {
      ok: false,
      result: {
        success: false,
        error: 'You are not a member of this Space.',
        errorCode: 'NOT_MEMBER',
      },
    };
  }
  return { ok: true, space, perms };
}

function forbidUnless(
  perms: SpaceMemberPermissions,
  permission: 'manageChannels' | 'manageEncryption',
  message: string,
): SpaceChannelResult | null {
  if (memberHasPermission(perms, permission)) return null;
  return { success: false, error: message, errorCode: 'FORBIDDEN' };
}

async function resolveAllowedRoleIds(
  spaceId: ObjectId,
  perms: SpaceMemberPermissions,
  allowedRoleIds: readonly string[] | undefined,
): Promise<{ ok: true; allowedRoleIds: ObjectId[] } | { ok: false; result: SpaceChannelResult }> {
  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const everyone = findEveryoneRole(roles);
  if (!everyone) {
    return {
      ok: false,
      result: { success: false, error: 'Everyone role not found.', errorCode: 'ROLE_NOT_FOUND' },
    };
  }

  const top = actorTopRolePosition(perms.roleIds, roles);
  if (top === null) {
    return {
      ok: false,
      result: { success: false, error: 'You have no roles in this Space.', errorCode: 'FORBIDDEN' },
    };
  }
  const selectable = new Set(
    rolesAtOrBelowHierarchy(roles, top).map((r: SpaceRoleDocument) => r._id.toHexString()),
  );

  if (!allowedRoleIds?.length) {
    return { ok: true, allowedRoleIds: [everyone._id] };
  }

  const seen = new Set<string>();
  const resolved: ObjectId[] = [];
  for (const raw of allowedRoleIds) {
    const id = parseObjId(raw);
    if (!id) {
      return {
        ok: false,
        result: { success: false, error: 'Invalid role id.', errorCode: 'INVALID_ID' },
      };
    }
    const hex = id.toHexString();
    if (seen.has(hex)) continue;
    if (!selectable.has(hex)) {
      return {
        ok: false,
        result: {
          success: false,
          error: 'You cannot restrict a channel to a role above your own.',
          errorCode: 'ESCALATION',
        },
      };
    }
    seen.add(hex);
    resolved.push(id);
  }
  return {
    ok: true,
    allowedRoleIds: resolved.length > 0 ? resolved : [everyone._id],
  };
}

/**
 * List a Space's channels (ordered by position). Visibility-gated read + role ACL.
 */
export async function listSpaceChannels(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
): Promise<SpaceChannelsResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, requesterId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const [channels, perms, roles] = await Promise.all([
    getSpaceChannelRepository().findBySpace(spaceId),
    resolveMemberPermissions(spaceId, requesterId),
    getSpaceRoleRepository().findBySpace(spaceId),
  ]);
  const everyoneId = findEveryoneRole(roles)?._id ?? null;
  const visible = channels.filter((ch) => canViewSpaceChannel(ch, perms, everyoneId));
  return { success: true, channels: visible.map(toPublicSpaceChannel) };
}

/**
 * Create a text channel. Requires membership + `manageChannels`.
 * Setting encryption also requires `manageEncryption`.
 * Empty/omitted `allowedRoleIds` defaults to the Everyone role.
 * When the Space is e2ee, the channel inherits the Space `cipherCheck` unless
 * `encrypt: false` (or an explicit `cipherCheck` is provided).
 */
export async function createSpaceChannel(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: CreateSpaceChannelParams,
): Promise<SpaceChannelResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireChannelMember(spaceId, actingId);
  if (!gate.ok) return gate.result;
  const { space, perms } = gate;

  const channelsDenied = forbidUnless(
    perms,
    'manageChannels',
    'You do not have permission to manage channels.',
  );
  if (channelsDenied) return channelsDenied;

  const touchesEncryption = params.encrypt !== undefined || params.cipherCheck !== undefined;
  if (touchesEncryption) {
    const encryptionDenied = forbidUnless(
      perms,
      'manageEncryption',
      'You do not have permission to manage encryption.',
    );
    if (encryptionDenied) return encryptionDenied;
  }

  const e2ee = !!space.e2ee;
  const hasEncrypted = !!(params.encryptedName && params.nameNonce && params.cipherId);
  const plainName = params.name?.trim() ?? '';
  if (e2ee && !hasEncrypted) {
    return {
      success: false,
      error: 'Encrypted channel name is required.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (!e2ee && !plainName) {
    return { success: false, error: 'Channel name is required.', errorCode: 'INVALID_CONTENT' };
  }

  const rolesResult = await resolveAllowedRoleIds(spaceId, perms, params.allowedRoleIds);
  if (!rolesResult.ok) return rolesResult.result;

  const cipherCheck = resolveChannelCipherCheck(space, params);
  if (params.encrypt === true && !cipherCheck) {
    return {
      success: false,
      error: 'cipherCheck is required when encrypt is enabled.',
      errorCode: 'INVALID_CONTENT',
    };
  }

  const existing = await getSpaceChannelRepository().findBySpace(spaceId);
  const maxPosition = existing.reduce((max, ch) => Math.max(max, ch.position ?? 0), -1);

  const channel = await getSpaceChannelRepository().createChannel({
    spaceId,
    type: 'text',
    name: e2ee ? '' : plainName,
    position: maxPosition + 1,
    allowedRoleIds: rolesResult.allowedRoleIds,
    ...(hasEncrypted
      ? {
          encryptedName: params.encryptedName,
          nameNonce: params.nameNonce,
          cipherId: params.cipherId,
        }
      : {}),
    ...(cipherCheck ? { cipherCheck } : {}),
  });

  const publicChannel = toPublicSpaceChannel(channel);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_channel_created',
    data: { channel: publicChannel },
  });

  return { success: true, channel: publicChannel };
}

/**
 * Update a text channel (name, role ACL, encryption).
 * Name/ACL require `manageChannels`; encryption requires `manageEncryption`.
 */
export async function updateSpaceChannel(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: UpdateSpaceChannelParams,
): Promise<SpaceChannelResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !channelId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireChannelMember(spaceId, actingId);
  if (!gate.ok) return gate.result;
  const { space, perms } = gate;

  const existing = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!existing) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }

  const touchesStructure =
    params.name !== undefined ||
    params.allowedRoleIds !== undefined ||
    params.encryptedName !== undefined ||
    params.nameNonce !== undefined ||
    params.cipherId !== undefined;
  const touchesEncryption = params.encrypt !== undefined || params.cipherCheck !== undefined;

  if (!touchesStructure && !touchesEncryption) {
    return { success: false, error: 'At least one field is required.', errorCode: 'INVALID_CONTENT' };
  }
  if (touchesStructure) {
    const denied = forbidUnless(
      perms,
      'manageChannels',
      'You do not have permission to manage channels.',
    );
    if (denied) return denied;
  }
  if (touchesEncryption) {
    const denied = forbidUnless(
      perms,
      'manageEncryption',
      'You do not have permission to manage encryption.',
    );
    if (denied) return denied;
  }

  const e2ee = !!space.e2ee;
  const hasEncrypted = !!(params.encryptedName && params.nameNonce && params.cipherId);
  const hasPartialEncrypted =
    !!(params.encryptedName || params.nameNonce || params.cipherId) && !hasEncrypted;
  if (hasPartialEncrypted) {
    return {
      success: false,
      error: 'encryptedName, nameNonce, and cipherId must be provided together.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (params.name !== undefined && e2ee) {
    return {
      success: false,
      error: 'Encrypted channel name is required.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (hasEncrypted && !e2ee) {
    return {
      success: false,
      error: 'Encrypted channel names require an e2ee Space.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (params.name !== undefined && !params.name.trim()) {
    return { success: false, error: 'Channel name is required.', errorCode: 'INVALID_CONTENT' };
  }

  let allowedRoleIds: ObjectId[] | undefined;
  if (params.allowedRoleIds !== undefined) {
    const rolesResult = await resolveAllowedRoleIds(spaceId, perms, params.allowedRoleIds);
    if (!rolesResult.ok) return rolesResult.result;
    allowedRoleIds = rolesResult.allowedRoleIds;
  }

  let cipherCheck: CipherCheck | undefined;
  let clearCipherCheck = false;
  if (touchesEncryption) {
    if (params.encrypt === false) {
      clearCipherCheck = true;
    } else {
      cipherCheck = resolveChannelCipherCheck(space, {
        encrypt: params.encrypt ?? true,
        cipherCheck: params.cipherCheck,
      });
      if (!cipherCheck) {
        return {
          success: false,
          error: 'cipherCheck is required when encrypt is enabled.',
          errorCode: 'INVALID_CONTENT',
        };
      }
    }
  }

  const updated = await getSpaceChannelRepository().updateChannel(spaceId, channelId, {
    ...(params.name !== undefined ? { name: params.name.trim() } : {}),
    ...(hasEncrypted
      ? {
          name: '',
          encryptedName: params.encryptedName,
          nameNonce: params.nameNonce,
          cipherId: params.cipherId,
        }
      : {}),
    ...(allowedRoleIds !== undefined ? { allowedRoleIds } : {}),
    ...(clearCipherCheck ? { clearCipherCheck: true } : {}),
    ...(cipherCheck ? { cipherCheck } : {}),
  });

  if (!updated) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }

  const publicChannel = toPublicSpaceChannel(updated);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_channel_updated',
    data: { channel: publicChannel },
  });

  return { success: true, channel: publicChannel };
}
