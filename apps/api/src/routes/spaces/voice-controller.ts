/**
 * Space voice-channel route controllers.
 *
 * @module routes/spaces/voice-controller
 */

import { z } from '@adieuu/shared/schemas';
import type { RouteContext } from '../../router/types';
import type { SpaceRouteResult } from './space-route-result';
import { mapSpaceError } from './space-route-result';
import {
  joinVoiceChannel,
  leaveVoiceChannel,
  updateVoiceMediaState,
  getVoiceSession,
  listSpaceVoicePresence,
} from '../../services/space.service';
import { sanitizeSpaceObjectId } from './space-inputs';

const VoiceMediaSchema = z.object({
  audio: z.boolean().optional(),
  video: z.boolean().optional(),
  screenshare: z.boolean().optional(),
});

function billingFromCtx(ctx: RouteContext) {
  const session = ctx.identitySession!;
  return {
    subscriptions: session.subscriptions ?? [],
    entitlements: session.entitlements ?? [],
    isLifetime: session.isLifetime,
  };
}

export async function listVoicePresenceCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ sessions: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await listSpaceVoicePresence(id.id, ctx.identitySession.identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list voice presence.');
  }
  return { kind: 'ok', data: { sessions: result.sessions ?? [] } };
}

export async function getVoiceSessionCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ session: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const spaceId = sanitizeSpaceObjectId(ctx.params.id);
  if (!spaceId.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!channelId.ok) return { kind: 'bad_request', message: 'Invalid channel id.' };

  const result = await getVoiceSession(
    spaceId.id,
    channelId.id,
    ctx.identitySession.identity._id,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to get voice session.');
  }
  return { kind: 'ok', data: { session: result.session ?? null } };
}

export async function joinVoiceChannelCtrl(
  ctx: RouteContext,
): Promise<
  SpaceRouteResult<{
    session: unknown;
    livekitToken?: string;
    livekitUrl?: string;
  }>
> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const spaceId = sanitizeSpaceObjectId(ctx.params.id);
  if (!spaceId.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!channelId.ok) return { kind: 'bad_request', message: 'Invalid channel id.' };

  const parsed = VoiceMediaSchema.safeParse(ctx.body ?? {});
  if (!parsed.success) return { kind: 'validation_failed' };

  const result = await joinVoiceChannel(
    spaceId.id,
    channelId.id,
    ctx.identitySession.identity._id,
    billingFromCtx(ctx),
    parsed.data,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to join voice channel.');
  }
  return {
    kind: 'ok',
    data: {
      session: result.session,
      ...(result.livekitToken ? { livekitToken: result.livekitToken } : {}),
      ...(result.livekitUrl ? { livekitUrl: result.livekitUrl } : {}),
    },
  };
}

export async function leaveVoiceChannelCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ session: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const spaceId = sanitizeSpaceObjectId(ctx.params.id);
  if (!spaceId.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!channelId.ok) return { kind: 'bad_request', message: 'Invalid channel id.' };

  const result = await leaveVoiceChannel(
    spaceId.id,
    channelId.id,
    ctx.identitySession.identity._id,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to leave voice channel.');
  }
  return { kind: 'ok', data: { session: result.session ?? null } };
}

export async function updateVoiceMediaCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ session: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const spaceId = sanitizeSpaceObjectId(ctx.params.id);
  if (!spaceId.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!channelId.ok) return { kind: 'bad_request', message: 'Invalid channel id.' };

  const parsed = VoiceMediaSchema.safeParse(ctx.body ?? {});
  if (!parsed.success) return { kind: 'validation_failed' };
  if (
    parsed.data.audio === undefined &&
    parsed.data.video === undefined &&
    parsed.data.screenshare === undefined
  ) {
    return { kind: 'validation_failed' };
  }

  const result = await updateVoiceMediaState(
    spaceId.id,
    channelId.id,
    ctx.identitySession.identity._id,
    parsed.data,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update media state.');
  }
  return { kind: 'ok', data: { session: result.session } };
}
