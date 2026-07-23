/**
 * Space invite, preferences, and audit-log route controllers.
 *
 * Split from `controller.ts` to keep files under 700 lines.
 *
 * @module routes/spaces/invite-controller
 */

import { ObjectId } from 'mongodb';
import type { RouteContext } from '../../router/types';
import type { IdentityContext } from '../../middleware/identity-session';
import type { SpaceRouteResult } from './space-route-result';
import { mapSpaceError } from './space-route-result';
import type { SpaceBillingContext } from '../../services/space/types';
import {
  createSpaceInvite,
  acceptSpaceInvite,
  declineSpaceInvite,
  revokeSpaceInvite,
  listSpaceInvitesForIdentity,
  listPendingInvitesForSpace,
  listSpaceAuditLog,
} from '../../services/space.service';
import {
  CreateSpaceInviteSchema,
  UpdateSpacePreferencesSchema,
} from '@adieuu/shared/schemas';
import { getSpacePreferencesRepository } from '../../repositories/space-preferences.repository';
import { toPublicSpacePreferences } from '../../models/space-preferences';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import {
  sanitizeSpaceObjectId,
  parseSpaceListCursor,
  clampSpaceListLimit,
} from './space-inputs';

/** Effective billing context for paid gating and join tier checks. */
function billingFromSession(session: IdentityContext): SpaceBillingContext {
  return {
    subscriptions: session.subscriptions,
    entitlements: session.entitlements,
    isLifetime: session.isLifetime,
  };
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export async function listInvitesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ invites: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await listSpaceInvitesForIdentity(identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list invites.');
  }
  return { kind: 'ok', data: { invites: result.invites ?? [], cursor: result.cursor ?? null } };
}

export async function acceptInviteCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const inviteId = sanitizeSpaceObjectId(ctx.params.inviteId);
  if (!inviteId.ok) return { kind: 'bad_request', message: 'Invalid invite id.' };

  const result = await acceptSpaceInvite(
    inviteId.id,
    identity._id,
    billingFromSession(ctx.identitySession),
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to accept invite.');
  }
  return { kind: 'ok', data: result.invite, message: 'Invite accepted.' };
}

export async function declineInviteCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const inviteId = sanitizeSpaceObjectId(ctx.params.inviteId);
  if (!inviteId.ok) return { kind: 'bad_request', message: 'Invalid invite id.' };

  const result = await declineSpaceInvite(inviteId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to decline invite.');
  }
  return { kind: 'ok', data: result.invite, message: 'Invite declined.' };
}

export async function createInviteCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const parsed = CreateSpaceInviteSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };
  const invited = sanitizeSpaceObjectId(parsed.data.identityId);
  if (!invited.ok) return { kind: 'bad_request', message: 'Invalid identity id.' };

  const result = await createSpaceInvite(id.id, identity._id, invited.id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to create invite.');
  }
  return { kind: 'ok', data: result.invite, message: 'Invite sent.' };
}

export async function listPendingInvitesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ invites: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await listPendingInvitesForSpace(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list invites.');
  }
  return { kind: 'ok', data: { invites: result.invites ?? [] } };
}

export async function revokeInviteCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const inviteId = sanitizeSpaceObjectId(ctx.params.inviteId);
  if (!id.ok || !inviteId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const result = await revokeSpaceInvite(id.id, inviteId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to revoke invite.');
  }
  return { kind: 'ok', data: result.invite, message: 'Invite revoked.' };
}

// ---------------------------------------------------------------------------
// Space preferences
// ---------------------------------------------------------------------------

export async function listSpacePreferencesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const repo = getSpacePreferencesRepository();
  const docs = await repo.findForIdentity(identity._id);

  return { kind: 'ok', data: docs.map(toPublicSpacePreferences) };
}

export async function patchSpacePreferencesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const space = sanitizeSpaceObjectId(ctx.params.spaceId);
  if (!space.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const parseResult = UpdateSpacePreferencesSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const patch = parseResult.data;
  if (patch.favorited === undefined) {
    return {
      kind: 'bad_request',
      message: 'At least one preference field is required.',
    };
  }

  const spaceId = new ObjectId(space.id);
  const member = await getSpaceMemberRepository().findMember(spaceId, identity._id);
  if (!member || member.status !== 'active') {
    return { kind: 'forbidden', message: 'You are not a member of this Space.' };
  }

  const repo = getSpacePreferencesRepository();
  const doc = await repo.upsert(identity._id, spaceId, patch);

  return {
    kind: 'ok',
    data: toPublicSpacePreferences(doc),
    message: 'Preferences updated.',
  };
}

export async function listAuditLogCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ entries: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await listSpaceAuditLog(id.id, identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list audit log.');
  }
  return { kind: 'ok', data: { entries: result.entries ?? [], cursor: result.cursor ?? null } };
}
