/**
 * Conversation folder controllers.
 *
 * CRUD operations for per-identity conversation folders used
 * to organise conversations and spaces in the sidebar.
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
  AddSpaceToFolderSchema,
} from './folder-schemas';
import { sanitizeString } from '../../utils/sanitize';

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

  const { conversationIds, spaceIds, iconType, iconName } = parseResult.data;
  const sanitizedName = sanitizeString(parseResult.data.name, 'general').value;
  if (!sanitizedName) return { kind: 'validation_failed' };
  let sanitizedIconColor: string | undefined;
  if (parseResult.data.iconColor) {
    const colorValue = sanitizeString(parseResult.data.iconColor, 'hexColor').value;
    if (!colorValue) return { kind: 'validation_failed' };
    sanitizedIconColor = colorValue;
  }

  const repo = getConversationFoldersRepository();
  const doc = await repo.create(identity._id, {
    name: sanitizedName,
    conversationIds: conversationIds.map((id) => new ObjectId(id)),
    spaceIds: spaceIds.map((id) => new ObjectId(id)),
    iconType,
    iconName,
    iconColor: sanitizedIconColor,
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

  let patch = parseResult.data;
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

  if (patch.name !== undefined) {
    const sanitizedName = sanitizeString(patch.name, 'general').value;
    if (!sanitizedName) return { kind: 'validation_failed' };
    patch = { ...patch, name: sanitizedName };
  }

  let sanitizedIconColor: string | null | undefined;
  if (patch.iconColor === undefined) {
    sanitizedIconColor = undefined;
  } else if (patch.iconColor === null) {
    sanitizedIconColor = null;
  } else {
    const colorValue = sanitizeString(patch.iconColor, 'hexColor').value;
    if (!colorValue) return { kind: 'validation_failed' };
    sanitizedIconColor = colorValue;
  }

  const sanitizedPatch = {
    ...patch,
    iconColor: sanitizedIconColor,
  };

  const repo = getConversationFoldersRepository();
  const doc = await repo.update(identity._id, new ObjectId(folder.id), sanitizedPatch);
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

  try {
    const doc = await repo.addConversation(
      identity._id,
      new ObjectId(folder.id),
      new ObjectId(conv.id),
    );
    if (!doc) return { kind: 'not_found', message: 'Folder not found.' };

    return { kind: 'ok', data: toPublicConversationFolder(doc) };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('E11000')) {
      return {
        kind: 'bad_request',
        message: 'Conversation is already in another folder.',
      };
    }
    throw err;
  }
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

export async function addSpaceToFolderCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const folder = sanitizeObjectId24(ctx.params.id);
  if (!folder.ok) return { kind: 'bad_request', message: 'Invalid folder ID.' };

  const parseResult = AddSpaceToFolderSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const space = sanitizeObjectId24(parseResult.data.spaceId);
  if (!space.ok) return { kind: 'bad_request', message: 'Invalid space ID.' };

  const repo = getConversationFoldersRepository();

  const existing = await repo.findBySpace(identity._id, new ObjectId(space.id));
  if (existing && existing._id.toHexString() !== folder.id) {
    return {
      kind: 'bad_request',
      message: 'Space is already in another folder.',
    };
  }

  try {
    const doc = await repo.addSpace(
      identity._id,
      new ObjectId(folder.id),
      new ObjectId(space.id),
    );
    if (!doc) return { kind: 'not_found', message: 'Folder not found.' };

    return { kind: 'ok', data: toPublicConversationFolder(doc) };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('E11000')) {
      return {
        kind: 'bad_request',
        message: 'Space is already in another folder.',
      };
    }
    throw err;
  }
}

export async function removeSpaceFromFolderCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const folder = sanitizeObjectId24(ctx.params.id);
  if (!folder.ok) return { kind: 'bad_request', message: 'Invalid folder ID.' };

  const space = sanitizeObjectId24(ctx.params.spaceId);
  if (!space.ok) return { kind: 'bad_request', message: 'Invalid space ID.' };

  const repo = getConversationFoldersRepository();
  const doc = await repo.removeSpace(
    identity._id,
    new ObjectId(folder.id),
    new ObjectId(space.id),
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
