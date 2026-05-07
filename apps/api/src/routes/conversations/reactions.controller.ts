/**
 * Conversation reaction route controllers.
 *
 * @module routes/conversations/reactions.controller
 */

import type { RouteContext } from '../../router/types';
import type { ConversationRouteResult } from './conversation-route-result';
import {
  addReaction,
  removeReaction,
  getReactionsForMessages,
} from '../../services/reaction.service';
import { SendReactionSchema } from './conversation-schemas';
import { sanitizeObjectId24, sanitizeCommaSeparatedMessageIds, sanitizeSendReactionBody } from './conversation-inputs';

export async function addReactionCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const msg = sanitizeObjectId24(ctx.params.messageId);
  if (!msg.ok) return { kind: 'bad_request', message: 'Invalid message ID.' };

  const parseResult = SendReactionSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const sanitizedBody = sanitizeSendReactionBody(parseResult.data);
  if (!sanitizedBody.ok) return { kind: 'bad_request', message: 'Invalid reaction payload.' };

  const result = await addReaction(
    identity._id.toHexString(),
    conv.id,
    msg.id,
    sanitizedBody.data,
  );

  if (!result.success) {
    return { kind: 'bad_request', message: result.error ?? 'Failed to add reaction.' };
  }

  return { kind: 'ok', data: result.reaction, message: 'Reaction added.' };
}

export async function removeReactionCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const reaction = sanitizeObjectId24(ctx.params.reactionId);
  if (!reaction.ok) return { kind: 'bad_request', message: 'Invalid reaction ID.' };

  const result = await removeReaction(
    identity._id.toHexString(),
    conv.id,
    reaction.id,
  );

  if (!result.success) {
    return { kind: 'bad_request', message: result.error ?? 'Failed to remove reaction.' };
  }

  return { kind: 'ok', data: undefined, message: 'Reaction removed.' };
}

export async function batchReactionsCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<{ reactions: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const idsParsed = sanitizeCommaSeparatedMessageIds(ctx.query.get('messageIds'));
  if (!idsParsed.ok) return { kind: 'bad_request', message: idsParsed.message };

  const result = await getReactionsForMessages(
    identity._id.toHexString(),
    conv.id,
    idsParsed.ids,
  );

  if (!result.success) {
    return { kind: 'bad_request', message: result.error ?? 'Failed to fetch reactions.' };
  }

  return { kind: 'ok', data: { reactions: result.reactions } };
}
