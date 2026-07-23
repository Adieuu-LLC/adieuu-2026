/**
 * Space audit logging: fire-and-forget writes + gated listing.
 *
 * @module services/space/audit
 */

import { ObjectId } from 'mongodb';
import type { PublicSpaceAuditEntry, SpaceAuditAction } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceAuditLogRepository } from '../../repositories/space-audit.repository';
import {
  toPublicSpaceAuditEntry,
  type CreateSpaceAuditLogInput,
} from '../../models/space-audit';
import { isValidObjectId } from '../../utils';
import { hashIdentifier } from '../../utils/crypto';
import elog from '../../utils/adieuuLogger';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import type { SpaceErrorCode } from './types';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

export interface RecordSpaceAuditParams {
  spaceId: ObjectId;
  actorIdentityId: ObjectId;
  action: SpaceAuditAction;
  targetIdentityId?: ObjectId;
  targetId?: ObjectId;
  channelId?: ObjectId;
  metadata?: Record<string, unknown>;
}

export interface SpaceAuditLogListResult {
  success: boolean;
  entries?: PublicSpaceAuditEntry[];
  cursor?: string | null;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/**
 * Best-effort audit write. Never throws to the caller; failures are logged.
 */
export async function recordSpaceAudit(params: RecordSpaceAuditParams): Promise<void> {
  try {
    const input: CreateSpaceAuditLogInput = {
      spaceId: params.spaceId,
      actorIdentityId: params.actorIdentityId,
      action: params.action,
      ...(params.targetIdentityId ? { targetIdentityId: params.targetIdentityId } : {}),
      ...(params.targetId ? { targetId: params.targetId } : {}),
      ...(params.channelId ? { channelId: params.channelId } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    };
    await getSpaceAuditLogRepository().create(input);
  } catch (err) {
    elog.warn('Failed to record Space audit log', {
      action: params.action,
      spaceIdHash: hashIdentifier(params.spaceId.toHexString()),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * List Space audit entries (newest first). Requires `viewAuditLog`.
 */
export async function listSpaceAuditLog(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
  limit = 50,
  cursor?: string,
): Promise<SpaceAuditLogListResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, requesterId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'viewAuditLog')) {
    return {
      success: false,
      error: 'You do not have permission to view the audit log.',
      errorCode: 'FORBIDDEN',
    };
  }

  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;
  const docs = await getSpaceAuditLogRepository().listBySpace(
    spaceId,
    limit + 1,
    cursorObjId,
  );

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  return {
    success: true,
    entries: page.map(toPublicSpaceAuditEntry),
    cursor: hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null,
  };
}
