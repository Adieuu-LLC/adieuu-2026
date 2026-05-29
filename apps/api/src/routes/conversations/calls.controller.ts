/**
 * Call route controllers.
 *
 * Endpoints for initiating, joining, leaving, ending, and querying
 * live audio/video/screenshare calls within conversations.
 *
 * @module routes/conversations/calls.controller
 */

import type { RouteContext } from '../../router/types';
import type { ConversationRouteResult } from './conversation-route-result';
import {
  initiateCall,
  joinCall,
  leaveCall,
  endCall,
  getActiveCall,
  updateMediaState,
} from '../../services/call.service';
import { updateCallSettings } from '../../services/conversation/group-settings';
import { escalateCallInitiateThrottle } from '../../services/rate-limit.service';
import { sanitizeObjectId24 } from './conversation-inputs';
import { z } from '@adieuu/shared/schemas';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MediaOptionsSchema = z.object({
  audio: z.boolean(),
  video: z.boolean(),
  screenshare: z.boolean(),
});

const InitiateCallSchema = z.object({
  media: MediaOptionsSchema,
});

const JoinCallSchema = z.object({
  media: MediaOptionsSchema,
});

const UpdateMediaStateSchema = z.object({
  media: MediaOptionsSchema,
});

const CallSettingsSchema = z.object({
  audioCallsDisabled: z.boolean().optional(),
  videoCallsDisabled: z.boolean().optional(),
  screenshareDisabled: z.boolean().optional(),
}).refine(
  (data) =>
    data.audioCallsDisabled !== undefined ||
    data.videoCallsDisabled !== undefined ||
    data.screenshareDisabled !== undefined,
  { message: 'At least one call setting must be provided' }
);

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

/**
 * POST /conversations/:id/calls
 * Initiate a new call in a conversation.
 */
export async function initiateCallCtrl(
  ctx: RouteContext
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = InitiateCallSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await initiateCall(
    conv.id,
    identity._id.toHexString(),
    parseResult.data.media
  );

  if (!result.success) {
    if (result.errorCode === 'RATE_LIMITED' && result.retryAfter !== undefined) {
      await escalateCallInitiateThrottle(identity._id.toHexString());
      return { kind: 'rate_limited', retryAfter: result.retryAfter };
    }
    if (result.errorCode === 'CALL_ALREADY_ACTIVE') {
      return { kind: 'named_error', code: result.errorCode, message: result.error!, status: 409 };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'forbidden', message: result.error! };
    }
    if (result.errorCode === 'MEDIA_DISABLED') {
      return { kind: 'forbidden', message: result.error! };
    }
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: result.error! };
    }
    if (result.errorCode === 'JITSI_UNAVAILABLE') {
      return { kind: 'named_error', code: result.errorCode, message: result.error!, status: 503 };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to initiate call.' };
  }

  return {
    kind: 'ok',
    data: {
      call: result.call,
      jitsiToken: result.jitsiToken,
      jitsiDomain: result.jitsiDomain,
      jitsiMucDomain: result.jitsiMucDomain,
    },
  };
}

/**
 * POST /conversations/:id/calls/:callId/join
 * Join an existing call.
 */
export async function joinCallCtrl(
  ctx: RouteContext
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const call = sanitizeObjectId24(ctx.params.callId);
  if (!call.ok) return { kind: 'bad_request', message: 'Invalid call ID.' };

  const parseResult = JoinCallSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await joinCall(
    conv.id,
    call.id,
    identity._id.toHexString(),
    parseResult.data.media
  );

  if (!result.success) {
    if (result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'forbidden', message: result.error! };
    }
    if (result.errorCode === 'CALL_NOT_FOUND') {
      return { kind: 'not_found', message: result.error! };
    }
    if (result.errorCode === 'ALREADY_IN_CALL') {
      return { kind: 'named_error', code: result.errorCode, message: result.error!, status: 409 };
    }
    if (result.errorCode === 'JITSI_UNAVAILABLE') {
      return { kind: 'named_error', code: result.errorCode, message: result.error!, status: 503 };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to join call.' };
  }

  return {
    kind: 'ok',
    data: {
      call: result.call,
      jitsiToken: result.jitsiToken,
      jitsiDomain: result.jitsiDomain,
      jitsiMucDomain: result.jitsiMucDomain,
    },
  };
}

/**
 * POST /conversations/:id/calls/:callId/leave
 * Leave an active call.
 */
export async function leaveCallCtrl(
  ctx: RouteContext
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const call = sanitizeObjectId24(ctx.params.callId);
  if (!call.ok) return { kind: 'bad_request', message: 'Invalid call ID.' };

  const result = await leaveCall(conv.id, call.id, identity._id.toHexString());

  if (!result.success) {
    if (result.errorCode === 'CALL_NOT_FOUND') {
      return { kind: 'not_found', message: result.error! };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to leave call.' };
  }

  return { kind: 'ok', data: { call: result.call } };
}

/**
 * POST /conversations/:id/calls/:callId/end
 * End an active call (active participants only).
 */
export async function endCallCtrl(
  ctx: RouteContext
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const call = sanitizeObjectId24(ctx.params.callId);
  if (!call.ok) return { kind: 'bad_request', message: 'Invalid call ID.' };

  const result = await endCall(conv.id, call.id, identity._id.toHexString());

  if (!result.success) {
    if (result.errorCode === 'CALL_NOT_FOUND') {
      return { kind: 'not_found', message: result.error! };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_IN_CALL') {
      return { kind: 'forbidden', message: result.error! };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to end call.' };
  }

  return { kind: 'ok', data: { call: result.call } };
}

/**
 * GET /conversations/:id/calls/active
 * Get the active call (if any) for a conversation.
 */
export async function getActiveCallCtrl(
  ctx: RouteContext
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const result = await getActiveCall(conv.id, identity._id.toHexString());

  if (!result.success) {
    if (result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'forbidden', message: result.error! };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to get call status.' };
  }

  return { kind: 'ok', data: { call: result.call ?? null } };
}

/**
 * PATCH /conversations/:id/calls/:callId/media
 * Update media state for the calling participant.
 */
export async function updateMediaStateCtrl(
  ctx: RouteContext
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const call = sanitizeObjectId24(ctx.params.callId);
  if (!call.ok) return { kind: 'bad_request', message: 'Invalid call ID.' };

  const parseResult = UpdateMediaStateSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateMediaState(
    conv.id,
    call.id,
    identity._id.toHexString(),
    parseResult.data.media
  );

  if (!result.success) {
    if (result.errorCode === 'CALL_NOT_FOUND') {
      return { kind: 'not_found', message: result.error! };
    }
    if (result.errorCode === 'NOT_IN_CALL') {
      return { kind: 'forbidden', message: result.error! };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to update media state.' };
  }

  return { kind: 'ok', data: { call: result.call } };
}

/**
 * PATCH /conversations/:id/call-settings
 * Update call permission settings (admin toggle for audio/video/screenshare).
 */
export async function updateCallSettingsCtrl(
  ctx: RouteContext
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = CallSettingsSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateCallSettings(
    conv.id,
    identity._id.toHexString(),
    parseResult.data
  );

  if (!result.success) {
    if (result.errorCode === 'NOT_ADMIN') {
      return { kind: 'forbidden', message: result.error! };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'forbidden', message: result.error! };
    }
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: result.error! };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to update call settings.' };
  }

  return { kind: 'ok', data: { conversation: result.conversation } };
}
