/**
 * Blocks controller — validation, sanitization, and block service orchestration.
 *
 * Route modules map structured results to HTTP responses.
 *
 * @module routes/blocks/controller
 */

import type { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import { isValidObjectId, sanitizeString } from '../../utils';
import {
  blockIdentity,
  unblockIdentity,
  checkIfBlocked,
  getBlockedIdentities,
  isBlockedByEither,
} from '../../services/block.service';

/** Zod schema for POST /blocks body */
export const BlockIdentitySchema = z.object({
  identityId: z.string().length(24),
});

function sanitizeObjectIdHex(raw: string): string | null {
  const { value } = sanitizeString(raw, 'id');
  if (!value || !isValidObjectId(value)) return null;
  return value;
}

export type PostBlockResult =
  | { ok: true }
  | { ok: false; kind: 'validation_failed' }
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: false; kind: 'not_found'; message: string };

export async function postBlockResult(
  blockerId: ObjectId,
  body: unknown,
): Promise<PostBlockResult> {
  const parseResult = BlockIdentitySchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const hexId = sanitizeObjectIdHex(parseResult.data.identityId);
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid identity ID.' };
  }

  const result = await blockIdentity(blockerId, hexId);

  if (!result.success) {
    switch (result.errorCode) {
      case 'CANNOT_BLOCK_SELF':
        return { ok: false, kind: 'bad_request', message: 'Cannot block yourself.' };
      case 'ALREADY_BLOCKED':
        return { ok: false, kind: 'bad_request', message: 'Identity already blocked.' };
      case 'IDENTITY_NOT_FOUND':
        return { ok: false, kind: 'not_found', message: 'Identity not found.' };
      default:
        return { ok: false, kind: 'bad_request', message: result.error ?? 'Block failed.' };
    }
  }

  return { ok: true };
}

export type DeleteBlockResult =
  | { ok: true }
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: false; kind: 'not_found'; message: string };

export async function deleteBlockResult(
  blockerId: ObjectId,
  rawIdentityId: string | undefined,
): Promise<DeleteBlockResult> {
  const hexId = sanitizeObjectIdHex(rawIdentityId ?? '');
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid identity ID.' };
  }

  const result = await unblockIdentity(blockerId, hexId);

  if (!result.success) {
    if (result.errorCode === 'BLOCK_NOT_FOUND') {
      return { ok: false, kind: 'not_found', message: 'Block not found.' };
    }
    return { ok: false, kind: 'bad_request', message: result.error ?? 'Unblock failed.' };
  }

  return { ok: true };
}

export type GetBlockedListPayload = Awaited<ReturnType<typeof getBlockedIdentities>>;

export async function getBlockedListResult(
  blockerId: ObjectId,
  query: URLSearchParams,
): Promise<GetBlockedListPayload> {
  const limitParam = query.get('limit');
  const cursorParam = query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let validCursor: string | undefined;
  if (cursorParam) {
    const hex = sanitizeObjectIdHex(cursorParam);
    if (hex) validCursor = hex;
  }

  return getBlockedIdentities(blockerId, limit, validCursor);
}

export type CheckBlockedResult =
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: true; blocked: boolean; blockedAt?: string };

export async function checkBlockedResult(
  blockerId: ObjectId,
  rawIdentityId: string | undefined,
): Promise<CheckBlockedResult> {
  const hexId = sanitizeObjectIdHex(rawIdentityId ?? '');
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid identity ID.' };
  }

  const result = await checkIfBlocked(blockerId, hexId);

  return {
    ok: true,
    blocked: result.blocked,
    blockedAt: result.blockedAt,
  };
}

export type CheckBlockedEitherResult =
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: true; blockedByEither: boolean; blockedByYou: boolean };

export async function checkBlockedEitherResult(
  blockerId: ObjectId,
  rawIdentityId: string | undefined,
): Promise<CheckBlockedEitherResult> {
  const hexId = sanitizeObjectIdHex(rawIdentityId ?? '');
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid identity ID.' };
  }

  const [byEither, byYou] = await Promise.all([
    isBlockedByEither(blockerId, hexId),
    checkIfBlocked(blockerId, hexId),
  ]);

  return {
    ok: true,
    blockedByEither: byEither,
    blockedByYou: byYou.blocked,
  };
}
