/**
 * Space route controllers — lifecycle (create/list/discover/update/delete).
 *
 * Controllers are transport-agnostic: each validates/sanitizes input, calls the
 * Space service, and returns a {@link SpaceRouteResult} that `index.ts` maps to
 * a `Response` via {@link spaceRespond}. All endpoints require an authenticated
 * identity session.
 *
 * Membership/roles: {@link ./member-controller}.
 * Invites/preferences/audit: {@link ./invite-controller}.
 * Channel/message controllers: {@link ./message-controller}.
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
  deleteSpace,
  getSpaceViewerPermissions,
  getSpaceManageOverview,
  listMySpaces,
  discoverSpaces,
  isSlugAvailable,
  isSpaceCreationEnabled,
} from '../../services/space.service';
import type { SpaceBillingContext } from '../../services/space/types';
import {
  CreateSpaceSchema,
  UpdateSpaceSchema,
} from '@adieuu/shared/schemas';
import {
  sanitizeSpaceObjectId,
  sanitizeSpaceSlug,
  sanitizeSpaceName,
  sanitizeSpaceDescription,
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

/**
 * Returns whether non-admin Space creation is currently enabled on the platform.
 * Auth required (same as other Spaces routes); clients combine with isPlatformAdmin.
 */
export async function getSpaceCreationEnabledCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ enabled: boolean }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const enabled = await isSpaceCreationEnabled();
  return { kind: 'ok', data: { enabled } };
}

export async function createSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const parsed = CreateSpaceSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const isHidden = parsed.data.visibility === 'hidden';
  let slug: string | undefined;
  if (!isHidden) {
    const sanitizedSlug = sanitizeSpaceSlug(parsed.data.slug);
    if (!sanitizedSlug.ok) return { kind: 'validation_failed' };
    slug = sanitizedSlug.slug;
  }

  const encryptIdentity = parsed.data.encryptIdentity === true;
  let name: string | undefined;
  let description: string | undefined;
  if (!encryptIdentity) {
    const sanitizedName = sanitizeSpaceName(parsed.data.name);
    if (!sanitizedName.ok) return { kind: 'validation_failed' };
    name = sanitizedName.name;
    const sanitizedDescription = sanitizeSpaceDescription(parsed.data.description);
    if (!sanitizedDescription.ok) return { kind: 'validation_failed' };
    description = sanitizedDescription.description;
  }

  let id: string | undefined;
  if (parsed.data.id !== undefined) {
    const sanitizedId = sanitizeSpaceObjectId(parsed.data.id);
    if (!sanitizedId.ok) return { kind: 'validation_failed' };
    id = sanitizedId.id;
  }

  const result = await createSpace(
    identity._id,
    {
      ...(slug !== undefined ? { slug } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      visibility: parsed.data.visibility,
      ...(parsed.data.allowFreeMembers !== undefined
        ? { allowFreeMembers: parsed.data.allowFreeMembers }
        : {}),
      ...(parsed.data.cipherCheck ? { cipherCheck: parsed.data.cipherCheck } : {}),
      ...(parsed.data.e2ee !== undefined ? { e2ee: parsed.data.e2ee } : {}),
      ...(parsed.data.encryptIdentity !== undefined
        ? { encryptIdentity: parsed.data.encryptIdentity }
        : {}),
      ...(parsed.data.cipherRequired !== undefined
        ? { cipherRequired: parsed.data.cipherRequired }
        : {}),
      ...(parsed.data.encryptedSeed ? { encryptedSeed: parsed.data.encryptedSeed } : {}),
      ...(parsed.data.encryptedName ? { encryptedName: parsed.data.encryptedName } : {}),
      ...(parsed.data.nameNonce ? { nameNonce: parsed.data.nameNonce } : {}),
      ...(parsed.data.cipherId ? { cipherId: parsed.data.cipherId } : {}),
      ...(parsed.data.encryptedDescription
        ? { encryptedDescription: parsed.data.encryptedDescription }
        : {}),
      ...(parsed.data.descriptionNonce
        ? { descriptionNonce: parsed.data.descriptionNonce }
        : {}),
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
  const { identity } = ctx.identitySession;

  const q = sanitizeSpaceSearchTerm(ctx.query.get('q'));
  const limit = clampSpaceListLimit(ctx.query.get('limit'), 30, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await discoverSpaces({
    ...(q ? { q } : {}),
    limit,
    ...(cursor ? { cursor } : {}),
    viewerIdentityId: identity._id,
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

export async function getMyPermissionsCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await getSpaceViewerPermissions(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to resolve permissions.');
  }
  return { kind: 'ok', data: result.viewer };
}

export async function getManageOverviewCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await getSpaceManageOverview(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to load overview.');
  }
  return { kind: 'ok', data: result.overview };
}

export async function deleteSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await deleteSpace(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to delete Space.');
  }
  return { kind: 'ok', data: undefined, message: 'Space deleted.' };
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
    cipherRequired?: boolean;
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
  if (parsed.data.cipherRequired !== undefined) {
    updates.cipherRequired = parsed.data.cipherRequired;
  }

  const result = await updateSpace(id.id, identity._id, updates);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update Space.');
  }
  return { kind: 'ok', data: result.space, message: 'Space updated.' };
}
