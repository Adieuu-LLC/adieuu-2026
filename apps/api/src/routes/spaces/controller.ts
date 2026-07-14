/**
 * Space route controllers.
 *
 * Controllers are transport-agnostic: each validates/sanitizes input, calls the
 * Space service, and returns a {@link SpaceRouteResult} that `index.ts` maps to
 * a `Response` via {@link spaceRespond}. All endpoints require an authenticated
 * identity session.
 *
 * @module routes/spaces/controller
 */

import type { RouteContext } from '../../router/types';
import type { IdentityContext } from '../../middleware/identity-session';
import type { SpaceRouteResult } from './space-route-result';
import { mapSpaceError } from './space-route-result';
import {
  createSpace,
  getSpaceBySlug,
  getSpaceById,
  updateSpace,
  listMySpaces,
  discoverSpaces,
  isSlugAvailable,
  joinSpace,
  leaveSpace,
  removeSpaceMember,
  listSpaceMembers,
  listSpaceRoles,
  createSpaceInvite,
  acceptSpaceInvite,
  declineSpaceInvite,
  revokeSpaceInvite,
  listSpaceInvitesForIdentity,
  listPendingInvitesForSpace,
  listSpaceChannels,
  sendSpaceMessage,
  getSpaceMessages,
} from '../../services/space.service';
import type { SpaceBillingContext } from '../../services/space/types';
import {
  CreateSpaceSchema,
  UpdateSpaceSchema,
  CreateSpaceInviteSchema,
  SendSpaceMessageSchema,
} from '@adieuu/shared/schemas';
import {
  sanitizeSpaceObjectId,
  sanitizeSpaceSlug,
  sanitizeSpaceName,
  sanitizeSpaceDescription,
  sanitizeSpaceMessageContent,
  sanitizeClientMessageId,
  sanitizeSpaceSearchTerm,
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
// Space lifecycle
// ---------------------------------------------------------------------------

export async function createSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const parsed = CreateSpaceSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const slug = sanitizeSpaceSlug(parsed.data.slug);
  if (!slug.ok) return { kind: 'validation_failed' };
  const name = sanitizeSpaceName(parsed.data.name);
  if (!name.ok) return { kind: 'validation_failed' };
  const description = sanitizeSpaceDescription(parsed.data.description);
  if (!description.ok) return { kind: 'validation_failed' };

  let id: string | undefined;
  if (parsed.data.id !== undefined) {
    const sanitizedId = sanitizeSpaceObjectId(parsed.data.id);
    if (!sanitizedId.ok) return { kind: 'validation_failed' };
    id = sanitizedId.id;
  }

  const result = await createSpace(
    identity._id,
    {
      slug: slug.slug,
      name: name.name,
      ...(description.description !== undefined ? { description: description.description } : {}),
      visibility: parsed.data.visibility,
      ...(parsed.data.allowFreeMembers !== undefined
        ? { allowFreeMembers: parsed.data.allowFreeMembers }
        : {}),
      ...(parsed.data.cipherCheck ? { cipherCheck: parsed.data.cipherCheck } : {}),
      ...(id !== undefined ? { id } : {}),
    },
    billingFromSession(ctx.identitySession),
  );

  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to create Space.');
  }
  return { kind: 'ok', data: result.space, message: 'Space created.' };
}

export async function listMySpacesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ spaces: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 100, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await listMySpaces(identity._id, limit, cursor);
  return { kind: 'ok', data: { spaces: result.spaces, cursor: result.cursor } };
}

export async function discoverSpacesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ spaces: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };

  const q = sanitizeSpaceSearchTerm(ctx.query.get('q'));
  const limit = clampSpaceListLimit(ctx.query.get('limit'), 30, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await discoverSpaces({
    ...(q ? { q } : {}),
    limit,
    ...(cursor ? { cursor } : {}),
  });
  return { kind: 'ok', data: { spaces: result.spaces, cursor: result.cursor } };
}

export async function getSpaceBySlugCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const slug = sanitizeSpaceSlug(ctx.params.slug);
  if (!slug.ok) return { kind: 'not_found', message: 'Space not found.' };

  const result = await getSpaceBySlug(slug.slug, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Space not found.');
  }
  return { kind: 'ok', data: result.space };
}

export async function checkSlugAvailabilityCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ available: boolean }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };

  const slug = sanitizeSpaceSlug(ctx.params.slug);
  if (!slug.ok) return { kind: 'ok', data: { available: false } };

  const available = await isSlugAvailable(slug.slug);
  return { kind: 'ok', data: { available } };
}

export async function getSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'not_found', message: 'Space not found.' };

  const result = await getSpaceById(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Space not found.');
  }
  return { kind: 'ok', data: result.space };
}

export async function updateSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const parsed = UpdateSpaceSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const updates: {
    name?: string;
    description?: string;
    visibility?: (typeof parsed.data)['visibility'];
    allowFreeMembers?: boolean;
  } = {};

  if (parsed.data.name !== undefined) {
    const name = sanitizeSpaceName(parsed.data.name);
    if (!name.ok) return { kind: 'validation_failed' };
    updates.name = name.name;
  }
  if (parsed.data.description !== undefined) {
    const description = sanitizeSpaceDescription(parsed.data.description);
    if (!description.ok) return { kind: 'validation_failed' };
    updates.description = description.description ?? '';
  }
  if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;
  if (parsed.data.allowFreeMembers !== undefined) {
    updates.allowFreeMembers = parsed.data.allowFreeMembers;
  }

  const result = await updateSpace(id.id, identity._id, updates);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update Space.');
  }
  return { kind: 'ok', data: result.space, message: 'Space updated.' };
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export async function joinSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await joinSpace(id.id, identity._id, billingFromSession(ctx.identitySession));
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to join Space.');
  }
  return { kind: 'ok', data: result.member, message: 'Joined Space.' };
}

export async function leaveSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await leaveSpace(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to leave Space.');
  }
  return { kind: 'ok', data: undefined, message: 'Left Space.' };
}

export async function listMembersCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ members: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await listSpaceMembers(id.id, identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list members.');
  }
  return { kind: 'ok', data: { members: result.members ?? [], cursor: result.cursor ?? null } };
}

export async function removeMemberCtrl(ctx: RouteContext): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const target = sanitizeSpaceObjectId(ctx.params.identityId);
  if (!id.ok || !target.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const result = await removeSpaceMember(id.id, identity._id, target.id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to remove member.');
  }
  return { kind: 'ok', data: undefined, message: 'Member removed.' };
}

export async function listRolesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ roles: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await listSpaceRoles(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list roles.');
  }
  return { kind: 'ok', data: { roles: result.roles ?? [] } };
}

// ---------------------------------------------------------------------------
// Channels & messages
// ---------------------------------------------------------------------------

export async function listChannelsCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ channels: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await listSpaceChannels(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list channels.');
  }
  return { kind: 'ok', data: { channels: result.channels ?? [] } };
}

export async function getMessagesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ messages: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!id.ok || !channelId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await getSpaceMessages(id.id, channelId.id, identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list messages.');
  }
  return { kind: 'ok', data: { messages: result.messages ?? [], cursor: result.cursor ?? null } };
}

export async function sendMessageCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!id.ok || !channelId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = SendSpaceMessageSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const content = sanitizeSpaceMessageContent(parsed.data.content);
  if (!content.ok) return { kind: 'validation_failed' };
  const clientMessageId = sanitizeClientMessageId(parsed.data.clientMessageId);
  if (!clientMessageId.ok) return { kind: 'validation_failed' };

  const result = await sendSpaceMessage(id.id, channelId.id, identity._id, {
    content: content.content,
    clientMessageId: clientMessageId.clientMessageId,
  });
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to send message.');
  }
  return { kind: 'ok', data: result.message };
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
