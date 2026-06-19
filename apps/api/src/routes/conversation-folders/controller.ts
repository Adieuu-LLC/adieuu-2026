/**
 * Conversation folder controllers.
 *
 * CRUD operations for per-identity conversation folders used
 * to organise conversations in the sidebar.
 *
 * @module routes/conversation-folders/controller
 */

import { ObjectId } from 'mongodb';
import type { RouteContext } from '../../router/types';
import type { ConversationRouteResult } from '../conversations/conversation-route-result';
import { sanitizeObjectId24 } from '../conversations/conversation-inputs';
import { getConversationFoldersRepository } from '../../repositories/conversation-folders.repository';
import { toPublicConversationFolder } from '../../models/conversation-folder';
import {
  CreateFolderSchema,
  UpdateFolderSchema,
  AddConversationToFolderSchema,
} from './folder-schemas';

export async function listFoldersCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const repo = getConversationFoldersRepository();
  const docs = await repo.findForIdentity(identity._id);

  return { kind: 'ok', data: docs.map(toPublicConversationFolder) };
}

export async function createFolderCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const parseResult = CreateFolderSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const { name, conversationIds, iconType, iconName, iconColor } = parseResult.data;

  const repo = getConversationFoldersRepository();
  const doc = await repo.create(identity._id, {
    name,
    conversationIds: conversationIds.map((id) => new ObjectId(id)),
    iconType,
    iconName,
    iconColor,
  });

  return { kind: 'ok', data: toPublicConversationFolder(doc) };
}

export async function updateFolderCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const folder = sanitizeObjectId24(ctx.params.id);
  if (!folder.ok) return { kind: 'bad_request', message: 'Invalid folder ID.' };

  const parseResult = UpdateFolderSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const patch = parseResult.data;
  if (
    patch.name === undefined &&
    patch.iconType === undefined &&
    patch.iconName === undefined &&
    patch.iconColor === undefined &&
    patch.favorited === undefined &&
    patch.sortOrder === undefined
  ) {
    return { kind: 'bad_request', message: 'At least one field is required.' };
  }

  const repo = getConversationFoldersRepository();
  const doc = await repo.update(identity._id, new ObjectId(folder.id), patch);
  if (!doc) return { kind: 'not_found', message: 'Folder not found.' };

  return { kind: 'ok', data: toPublicConversationFolder(doc) };
}

export async function addConversationToFolderCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const folder = sanitizeObjectId24(ctx.params.id);
  if (!folder.ok) return { kind: 'bad_request', message: 'Invalid folder ID.' };

  const parseResult = AddConversationToFolderSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const conv = sanitizeObjectId24(parseResult.data.conversationId);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const repo = getConversationFoldersRepository();

  // Check if conversation is already in another folder
  const existing = await repo.findByConversation(identity._id, new ObjectId(conv.id));
  if (existing && existing._id.toHexString() !== folder.id) {
    return {
      kind: 'bad_request',
      message: 'Conversation is already in another folder.',
    };
  }

  const doc = await repo.addConversation(
    identity._id,
    new ObjectId(folder.id),
    new ObjectId(conv.id),
  );
  if (!doc) return { kind: 'not_found', message: 'Folder not found.' };

  return { kind: 'ok', data: toPublicConversationFolder(doc) };
}

export async function removeConversationFromFolderCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const folder = sanitizeObjectId24(ctx.params.id);
  if (!folder.ok) return { kind: 'bad_request', message: 'Invalid folder ID.' };

  const conv = sanitizeObjectId24(ctx.params.conversationId);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const repo = getConversationFoldersRepository();
  const doc = await repo.removeConversation(
    identity._id,
    new ObjectId(folder.id),
    new ObjectId(conv.id),
  );
  if (!doc) return { kind: 'not_found', message: 'Folder not found.' };

  return { kind: 'ok', data: toPublicConversationFolder(doc) };
}

export async function deleteFolderCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const folder = sanitizeObjectId24(ctx.params.id);
  if (!folder.ok) return { kind: 'bad_request', message: 'Invalid folder ID.' };

  const repo = getConversationFoldersRepository();
  const deleted = await repo.delete(identity._id, new ObjectId(folder.id));
  if (!deleted) return { kind: 'not_found', message: 'Folder not found.' };

  return {
    kind: 'ok',
    data: toPublicConversationFolder(deleted),
  };
}
