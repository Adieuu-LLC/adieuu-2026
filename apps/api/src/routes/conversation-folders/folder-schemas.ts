/**
 * Zod request shapes for conversation folder routes.
 *
 * @module routes/conversation-folders/folder-schemas
 */

import { z } from '@adieuu/shared/schemas';

const objectIdString = z.string().length(24).regex(/^[0-9a-fA-F]{24}$/);

const FOLDER_ICON_NAMES = [
  'folder',
  'folders',
  'layer-group',
  'ball-pile',
  'building',
  'family',
  'sportsball',
  'dice',
  'dice-d10',
  'dice-d12',
  'game-board',
  'game-console-handheld',
] as const;

export const CreateFolderSchema = z
  .object({
    name: z.string().min(1).max(100),
    conversationIds: z.array(objectIdString).max(50).optional().default([]),
    spaceIds: z.array(objectIdString).max(50).optional().default([]),
    iconType: z.enum(['dynamic', 'icon']).optional(),
    iconName: z.enum(FOLDER_ICON_NAMES).optional(),
    iconColor: z.string().max(20).optional(),
  })
  .refine(
    (data) => data.conversationIds.length + data.spaceIds.length >= 1,
    { message: 'At least one conversation or space is required.' },
  );

export const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  iconType: z.enum(['dynamic', 'icon']).optional(),
  iconName: z.enum(FOLDER_ICON_NAMES).optional(),
  iconColor: z.string().max(20).nullable().optional(),
  favorited: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const AddConversationToFolderSchema = z.object({
  conversationId: objectIdString,
});

export const AddSpaceToFolderSchema = z.object({
  spaceId: objectIdString,
});
